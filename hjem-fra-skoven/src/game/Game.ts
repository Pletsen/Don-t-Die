import * as THREE from 'three';
import { PLAYER } from '../data/balance';
import { getLevel, LEVEL_COUNT, type LevelDef } from '../data/levels';
import { UPGRADES, type UpgradeId } from '../data/upgrades';
import { effective, FAMILIES, MAX_UPGRADE, upgradeCost, weaponById, WEAPONS, type Effective, type Track, type WeaponDef } from '../data/weapons';
import { Animal, type AnimalContext } from '../animals/Animal';
import { spawnAnimals } from '../animals/spawner';
import { Sound } from '../audio/Sound';
import { CameraRig } from '../player/CameraRig';
import { Player, type PlayerStats } from '../player/Player';
import { Hud } from '../ui/Hud';
import { canAfford, Screens, type RunSummary } from '../ui/Screens';
import { Projectiles } from '../weapons/Projectiles';
import { Traps } from '../weapons/Traps';
import { Drift, Fireflies } from '../world/Drift';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Wind } from '../world/Wind';
import { World } from '../world/World';
import { Bursts } from './Burst';
import { buildHeldModel } from '../player/Held';
import { Drops, DROP_LABEL } from './Drops';
import { Input } from './Input';
import { LITE } from './quality';
import { freshSave, loadSave, writeSave, type Save } from './save';

const MIN_POWER = 0.12; // a tap on the button

type State = 'menu' | 'hub' | 'playing' | 'paused' | 'dead';

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(68, 1, 0.1, 600);
  readonly rig = new CameraRig(this.camera);
  readonly input: Input;
  readonly sound = new Sound();
  readonly hud: Hud;
  readonly screens: Screens;
  save: Save = loadSave();
  state: State = 'menu';

  scene!: THREE.Scene;
  world!: World;
  level!: LevelDef;
  player!: Player;
  wind!: Wind;
  animals: Animal[] = [];
  projectiles!: Projectiles;
  traps!: Traps;
  eff: Record<string, Effective> = {};
  drops!: Drops;
  drift!: Drift;
  fireflies?: Fireflies;
  private composer!: EffectComposer;
  private renderPass!: RenderPass;
  private gradePass!: ShaderPass;
  bursts!: Bursts;

  private time = 0;
  private last = performance.now();
  private lastRun: RunSummary | null = null;
  private deathTimer = 0;
  private completed = false;
  private stats!: PlayerStats;

  constructor(root: HTMLElement, ui: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(LITE ? 1 : Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    root.appendChild(this.renderer.domElement);
    this.setupPost();
    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(ui);
    this.screens = new Screens(ui);
    addEventListener('resize', () => this.resize());
    this.resize();

    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.pause();
      else if (locked && this.state === 'paused') {
        this.state = 'playing';
        this.screens.hide();
        this.hud.show(true);
      }
    };

    this.buildLevel(this.save.level);
    this.showMenu();
    requestAnimationFrame(() => this.loop());
  }

  // ---------- flow ----------

  /** Bloom, a colour grade with vignette, then tone mapping. Rendered in half-float with 4x MSAA. */
  private setupPost() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: LITE ? 0 : 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(new THREE.Scene(), this.camera);
    this.composer.addPass(this.renderPass);
    if (!LITE) this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.65, 0.88));
    this.gradePass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, vig: { value: 0.4 }, tint: { value: new THREE.Vector3(1, 1, 1) }, sat: { value: 1.1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float vig; uniform vec3 tint; uniform float sat; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, sat) * tint;
          float d = distance(vUv, vec2(0.5));
          c *= 1.0 - vig * smoothstep(0.32, 0.9, d);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.composer.addPass(this.gradePass);
    this.composer.addPass(new OutputPass());
  }

  private showMenu() {
    this.state = 'menu';
    this.hud.show(false);
    this.buildLevel(this.save.level);
    this.screens.menu(this.save, {
      play: () => {
        this.sound.init();
        this.showHub();
      },
      reset: () => {
        this.save = freshSave();
        writeSave(this.save);
        this.lastRun = null;
        this.showMenu();
      },
    });
  }

  private showHub() {
    this.state = 'hub';
    this.hud.show(false);
    this.buildLevel(this.save.level);
    this.screens.hub(this.save, this.lastRun, {
      go: () => this.startLevel(this.save.level),
      buy: (id) => {
        this.buy(id);
        this.showHub();
      },
      buyWeapon: (id) => {
        this.buyWeapon(id);
        this.showHub();
      },
      upgradeWeapon: (id, track) => {
        this.upgradeWeapon(id, track);
        this.showHub();
      },
    });
  }

  private buy(id: UpgradeId) {
    const def = UPGRADES.find((u) => u.id === id)!;
    const lvl = this.save.upgrades[id];
    const cost = def.costs[lvl];
    if (!cost || !canAfford(this.save.bank, cost)) return;
    this.save.bank.meat -= cost.meat ?? 0;
    this.save.bank.shards -= cost.shards ?? 0;
    this.save.bank.trophies -= cost.trophies ?? 0;
    this.save.upgrades[id] = lvl + 1;
    writeSave(this.save);
    this.sound.pickup();
  }

  startLevel(n: number) {
    this.sound.init();
    this.buildLevel(n);
    const u = this.save.upgrades;
    this.stats = {
      maxHealth: PLAYER.maxHealth + 15 * u.health,
      maxStamina: PLAYER.maxStamina + 15 * u.stamina,
      scentMul: 1 - 0.08 * u.wind,
    };
    this.player = new Player(this.stats, Math.min(this.save.bank.meat, PLAYER.startingMeatPack));
    this.eff = {};
    for (const w of WEAPONS) {
      this.eff[w.id] = effective(w, this.save.weaponLv[w.id]);
      if (this.save.owned[w.id] && w.ammo > 0) this.player.ammo[w.id] = Math.round(this.eff[w.id].ammo);
    }
    this.player.weaponId = 'jagtbue';
    this.player.pos.copy(this.world.spawn);
    this.player.onRoll = () => this.sound.roll();
    this.player.onJump = () => this.sound.jump();
    this.player.onLand = () => this.sound.land();
    this.player.onHurt = () => {
      this.sound.hurt();
      this.rig.kick(0.25);
    };
    this.scene.add(this.player.group);
    this.rig.heading = Math.PI;
    this.rig.pitch = 0.08;
    this.completed = false;
    this.state = 'playing';
    this.screens.hide();
    this.hud.show(true);
    this.warmup();
    this.hud.toast(`Bane ${n}. Hold vinden i ansigtet.`, 3200);
    this.input.requestLock();
  }

  /** Builds the world for a level. Also used as a slowly turning backdrop for the menus. */
  private buildLevel(n: number) {
    if (this.world) this.world.dispose();
    this.level = getLevel(n);
    this.scene = new THREE.Scene();
    this.ghost = undefined;
    this.delayed = [];
    this.world = new World(this.scene, this.level, this.renderer);
    this.renderPass.scene = this.scene;
    const tod = this.level.tod;
    this.gradePass.uniforms.tint.value.set(1.05 - tod * 0.14, 1.0 - tod * 0.01, 0.95 + tod * 0.14);
    this.gradePass.uniforms.vig.value = 0.38 + tod * 0.15;
    this.wind = new Wind(this.level.windAngle, this.level.windStrength);
    this.projectiles = new Projectiles(this.scene, this.world);
    this.projectiles.onHit = (e) => this.onHit(e.killed, e.point);
    this.traps = new Traps(this.scene, this.world);
    this.traps.onTrigger = () => {
      this.sound.hit();
      this.hud.toast('Fælden klaprede!', 1400);
    };
    this.drops = new Drops(this.scene, this.world);
    this.bursts = new Bursts(this.scene);
    this.drift = new Drift(this.world.night > 0.5 ? 0x9fb4d8 : 0xd9c58a);
    this.scene.add(this.drift.points);
    this.fireflies = this.world.night > 0.15 || this.level.tod > 0.4 ? new Fireflies() : undefined;
    if (this.fireflies) this.scene.add(this.fireflies.points);
    this.animals = spawnAnimals(this.level, this.world);
    for (const a of this.animals) {
      this.scene.add(a.group);
      a.onDeath = (an) => this.onKilled(an);
    }
    this.renderer.toneMappingExposure = this.world.light.exposure;
    // placeholder player so the menu backdrop has something to follow
    this.player = new Player(
      { maxHealth: 100, maxStamina: 100, scentMul: 1 },
      0,
    );
    this.player.pos.copy(this.world.spawn);
    this.player.dead = true;
  }

  private pause() {
    this.state = 'paused';
    this.hud.show(false);
    this.screens.pause({
      resume: () => {
        this.input.requestLock();
        // if the browser refuses the lock we still let the player carry on
        setTimeout(() => {
          if (this.state === 'paused') {
            this.state = 'playing';
            this.screens.hide();
            this.hud.show(true);
          }
        }, 400);
      },
      menu: () => {
        this.showMenu();
      },
    });
  }

  private die() {
    this.state = 'dead';
    this.deathTimer = 1.4;
    this.sound.death();
    document.exitPointerLock?.();
  }

  private complete() {
    this.completed = true;
    const c = this.player.carried;
    const meatGain = Math.max(0, c.meat - this.player.startMeat);
    const bank = this.save.bank;
    bank.meat = Math.max(0, bank.meat + (c.meat - this.player.startMeat));
    bank.shards += c.shards;
    bank.trophies += c.trophies;
    this.lastRun = { level: this.level.n, meat: meatGain, shards: c.shards, trophies: c.trophies };
    this.save.level = Math.min(LEVEL_COUNT, Math.max(this.save.level, this.level.n + 1));
    writeSave(this.save);
    this.sound.complete();
    document.exitPointerLock?.();
    this.hud.show(false);
    if (this.level.n >= LEVEL_COUNT) {
      this.state = 'menu';
      this.screens.ending({ menu: () => this.showHub() });
    } else {
      setTimeout(() => this.showHub(), 600);
      this.state = 'menu';
    }
  }

  // ---------- gameplay ----------

  // ---------- weapons ----------

  private ownedWeapons(): WeaponDef[] {
    return WEAPONS.filter((w) => this.save.owned[w.id]);
  }

  selectFamily(f: number) {
    const list = this.ownedWeapons().filter((w) => w.family === f);
    if (!list.length) {
      this.hud.toast(`Du har ingen våben i "${FAMILIES[f - 1].name}" endnu. Køb dem i hulen.`, 2200);
      return;
    }
    const cur = list.findIndex((w) => w.id === this.player.weaponId);
    this.equip(list[(cur + 1) % list.length].id);
  }

  private cycleWeapon(dir: number) {
    const list = this.ownedWeapons();
    const cur = list.findIndex((w) => w.id === this.player.weaponId);
    this.equip(list[(cur + dir + list.length) % list.length].id);
  }

  private equip(id: string) {
    if (id === this.player.weaponId) return;
    this.player.weaponId = id;
    this.player.drawing = false;
    this.player.drawP = 0;
    this.player.shotCooldown = Math.max(this.player.shotCooldown, 0.25);
    this.hud.toast(weaponById(id).name, 900);
  }

  /** Seconds before delayed effects (like a spear hit landing mid-thrust) happen. */
  private ghost?: THREE.Mesh;

  /**
   * Compiles the shaders of everything that can appear mid-fight (loot glow, particles, thrown weapons,
   * traps, held weapons) while the level loads. Otherwise the first kill or first throw would freeze for a moment.
   */
  private warmup() {
    const warm = new THREE.Scene();
    const at = this.world.spawn;
    const drops = new Drops(warm, this.world);
    for (const k of ['meat', 'shards', 'trophies'] as const) drops.spawn(k, 1, at);
    new Bursts(warm).emit(at, 0xffffff);
    const proj = new Projectiles(warm, this.world);
    for (const look of ['arrow', 'knife', 'axe', 'spear', 'stone'] as const) {
      proj.fire(at, new THREE.Vector3(0, 1, 0), { weaponId: 'x', look, speed: 1, gravity: 0, damage: 0, retrievable: false, spin: false });
    }
    const traps = new Traps(warm, this.world);
    traps.placeTrap(at, { weaponId: 'x', type: 'snare', radius: 1, damage: 0, root: 0 });
    traps.placeTrap(at, { weaponId: 'x', type: 'bear', radius: 1, damage: 0, root: 0 });
    traps.placeBait(at, { weaponId: 'x', life: 1, lure: 1 });
    traps.placeBait(at, { weaponId: 'x', life: 1, lure: 1, poison: { dps: 1, time: 1 } });
    for (const w of WEAPONS) warm.add(buildHeldModel(w).group);
    this.renderer.compile(warm, this.camera, this.scene);
  }

  /** A ring on the ground shows where a trap or bait will land while you hold the button. */
  private updateGhost() {
    const p = this.player;
    const w = weaponById(p.weaponId);
    const on = p.drawing && (w.kind === 'trap' || w.kind === 'bait');
    if (!this.ghost) {
      this.ghost = new THREE.Mesh(
        new THREE.RingGeometry(0.7, 0.85, 28).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.7, depthWrite: false }),
      );
      this.ghost.visible = false;
      this.scene.add(this.ghost);
    }
    this.ghost.visible = on;
    if (on) {
      const at = this.placeAt(w.kind === 'bait' ? 8 : 2.2);
      this.ghost.position.set(at.x, this.world.height(at.x, at.z) + 0.08, at.z);
      this.ghost.scale.setScalar(w.kind === 'bait' ? 1.4 : 1);
    }
  }

  private delayed: { t: number; fn: () => void }[] = [];

  /** 0..1 power of the current draw. A tap gives `MIN_POWER`, a full draw gives 1. */
  private power(): number {
    const p = this.player;
    return Math.max(MIN_POWER, p.drawP);
  }

  /**
   * The use button.
   * Bows, throwing weapons, sling, traps and bait are held to draw/wind up and let go to fire:
   * a quick tap is instant but weak and loose, a full draw is hard, far and accurate.
   * Melee swings on the click.
   */
  private weaponInput(dt: number) {
    const p = this.player;
    const w = weaponById(p.weaponId);
    const e = this.eff[w.id];
    if (p.rolling) {
      p.drawing = false;
      p.drawP = 0;
      return;
    }
    const hasAmmo = w.ammo === 0 || (p.ammo[w.id] ?? 0) > 0;
    if (w.kind === 'melee') {
      if (this.input.left && p.shotCooldown <= 0) this.melee(w, e);
      return;
    }
    if (!p.drawing) {
      if (this.input.left && p.shotCooldown <= 0) {
        if (!hasAmmo) {
          if (this.input.leftPressed) {
            p.shotCooldown = 0.4;
            this.hud.toast(`Ingen ${w.name.toLowerCase()} tilbage. Find dem i skoven.`, 1500);
          }
          return;
        }
        p.drawing = true;
        p.drawT = 0;
        p.drawP = 0;
        this.sound.drawStart();
      }
      return;
    }
    if (this.input.left) {
      p.drawT += dt;
      p.drawP = Math.min(1, p.drawT / Math.max(0.05, e.draw));
      return;
    }
    // let go
    const power = w.kind === 'proj' ? this.power() : 1;
    p.drawing = false;
    p.held.release();
    if (w.kind === 'proj') this.fireProjectile(w, e, power);
    else if (w.kind === 'trap') this.placeTrap(w, e);
    else this.placeBait(w, e);
    if (w.ammo > 0) p.ammo[w.id]--;
    p.shotCooldown = e.cooldown;
    p.fired(e.noise * (0.6 + 0.4 * power));
    p.drawP = 0;
  }

  /** Spread (radians) right now, shrinking as the draw builds. Also drives the crosshair. */
  private currentSpread(): number {
    const p = this.player;
    const w = weaponById(p.weaponId);
    const e = this.eff[w.id];
    if (w.kind !== 'proj') return 0.02;
    const pw = p.drawing ? this.power() : MIN_POWER;
    let s = e.spread * (1 - 0.92 * pw);
    if (p.aiming) s = Math.min(s, e.spreadAim + e.spread * (1 - 0.92 * pw) * 0.35);
    // holding a full draw for too long makes the arms tremble
    if (p.drawing && p.drawP >= 1) s += Math.min(0.02, Math.max(0, p.drawT - e.draw - 1.2) * 0.012);
    if (p.moving) s *= 1.35;
    return s;
  }

  private aimBlend(): number {
    const p = this.player;
    return p.aiming ? 1 : p.drawing ? 0.25 + 0.35 * p.drawP : 0;
  }

  private fireProjectile(w: WeaponDef, e: Effective, power: number) {
    const p = this.player;
    const forward = this.rig.forward;
    const origin = p.chest.addScaledVector(new THREE.Vector3(Math.sin(this.rig.heading), 0, Math.cos(this.rig.heading)), 0.55);
    // Aim at what the crosshair is on: the nearest animal under the camera ray, otherwise a point 40 m out.
    // The shot leaves the chest, not the camera, so this keeps close shots from missing sideways.
    let range = 40;
    for (const a of this.animals) {
      if (a.dead) continue;
      const toC = a.hitCenter().sub(this.camera.position);
      const along = toC.dot(forward);
      if (along < 1 || along > 70) continue;
      const miss2 = toC.lengthSq() - along * along;
      const r = a.def.radius * 0.8;
      if (miss2 < r * r) range = Math.min(range, Math.max(1, along - Math.sqrt(r * r - miss2)), 40);
    }
    const aim = this.camera.position.clone().addScaledVector(forward, range);
    const speed = e.speed * (0.5 + 0.5 * power);
    const t = aim.distanceTo(origin) / speed;
    aim.y += 0.5 * e.gravity * t * t; // compensate the drop so it lands where the crosshair points
    const dir = aim.sub(origin).normalize();
    const spread = this.spreadFor(e, power);
    const right = this.rig.right;
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    dir.addScaledVector(right, (Math.random() - 0.5) * 2 * spread).addScaledVector(up, (Math.random() - 0.5) * 2 * spread).normalize();
    this.projectiles.fire(origin, dir, {
      weaponId: w.id,
      look: w.look!,
      speed,
      gravity: e.gravity,
      damage: e.damage * (0.35 + 0.65 * power),
      retrievable: !!w.retrievable,
      spin: !!w.spin,
      poison: w.poison ? { dps: e.poisonDps, time: e.poisonTime } : undefined,
    });
    if (w.look === 'arrow') this.sound.shoot();
    else this.sound.throwSound();
    this.rig.kick(0.04);
  }

  private spreadFor(e: Effective, power: number): number {
    const p = this.player;
    let s = e.spread * (1 - 0.92 * power);
    if (p.aiming) s = Math.min(s, e.spreadAim + e.spread * (1 - 0.92 * power) * 0.35);
    if (p.drawing || power >= 1) s += Math.min(0.02, Math.max(0, p.drawT - e.draw - 1.2) * 0.012);
    if (p.moving) s *= 1.35;
    return s;
  }

  private melee(w: WeaponDef, e: Effective) {
    const p = this.player;
    p.shotCooldown = e.cooldown;
    p.fired(e.noise);
    p.heading = this.rig.heading;
    p.held.swing(Math.min(0.55, Math.max(0.24, e.cooldown * 0.75)));
    this.sound.swing();
    // the blow lands a moment into the swing, not on the click
    const delay = w.id === 'jagtkniv' ? 0.07 : 0.16;
    this.delayed.push({
      t: delay,
      fn: () => {
        if (p.dead) return;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        let hit = false;
        for (const a of this.animals) {
          if (a.dead) continue;
          const dx = a.pos.x - p.pos.x;
          const dz = a.pos.z - p.pos.z;
          const d = Math.hypot(dx, dz);
          if (d - a.def.radius > e.reach) continue;
          if (d > 0.01 && (dx * fx + dz * fz) / d < 0.5) continue;
          a.hurt(e.damage, this.world, p.pos);
          this.onHit(a.dead, a.hitCenter());
          hit = true;
        }
        if (!hit) this.bursts.emit(p.chest.add(new THREE.Vector3(fx * (e.reach * 0.8), -0.4, fz * (e.reach * 0.8))), 0xcfd6da, 4, 2);
        this.rig.kick(hit ? 0.1 : 0.03);
      },
    });
  }

  private placeAt(dist: number): THREE.Vector3 {
    const h = this.rig.heading;
    this.player.heading = h;
    return this.player.pos.clone().add(new THREE.Vector3(Math.sin(h) * dist, 0, Math.cos(h) * dist));
  }

  private placeTrap(w: WeaponDef, e: Effective) {
    this.traps.placeTrap(this.placeAt(2.2), { weaponId: w.id, type: w.trap!, radius: w.radius!, damage: e.damage, root: e.root });
    this.sound.pickup();
    this.hud.toast(`${w.name} lagt ud`, 1000);
  }

  private placeBait(w: WeaponDef, e: Effective) {
    this.traps.placeBait(this.placeAt(8), {
      weaponId: w.id,
      life: e.damage,
      lure: e.lure,
      poison: w.poison ? { dps: e.poisonDps, time: e.poisonTime } : undefined,
    });
    this.sound.eat();
    this.hud.toast(`${w.name} lagt ud`, 1000);
  }

  private onHit(killed: boolean, point: THREE.Vector3) {
    this.sound.hit();
    this.hud.hitMarker();
    this.bursts.emit(point, killed ? 0xe8d9b0 : 0xd9b27a, killed ? 22 : 10);
  }

  private onKilled(a: Animal) {
    this.sound.kill();
    const d = a.def;
    this.drops.spawn('meat', d.meat, a.pos);
    this.drops.spawn('shards', d.shards, a.pos);
    this.drops.spawn('trophies', d.trophies, a.pos);
    this.hud.toast(`${cap(d.name)} nedlagt`, 1600);
  }

  private interact(): boolean {
    const p = this.player;
    let any = false;
    const got: string[] = [];
    for (const d of this.drops.near(p.pos, PLAYER.pickupRange)) {
      p.carried[d.kind] += d.amount;
      got.push(`+${d.amount} ${DROP_LABEL[d.kind]}`);
      this.drops.take(d);
      any = true;
    }
    const back: Record<string, number> = { ...this.projectiles.collect(p.pos, PLAYER.pickupRange) };
    for (const [id, n] of Object.entries(this.traps.collect(p.pos, PLAYER.pickupRange))) back[id] = (back[id] ?? 0) + n;
    for (const [id, n] of Object.entries(back)) {
      const room = Math.max(0, Math.round(this.eff[id].ammo) - (p.ammo[id] ?? 0));
      p.ammo[id] = (p.ammo[id] ?? 0) + Math.min(n, room);
      got.push(`+${n} ${weaponById(id).name.toLowerCase()}`);
      any = true;
    }
    if (any) {
      this.sound.pickup();
      this.hud.toast(got.join('  '), 1400);
      return true;
    }
    if (p.carried.meat > 0 && p.hp < this.stats.maxHealth) {
      p.carried.meat--;
      p.heal(PLAYER.eatHeal);
      this.sound.eat();
      this.hud.toast('Du spiser et stykke kød', 1200);
      return true;
    }
    return false;
  }

  // ---------- cave shop ----------

  private buyWeapon(id: string) {
    const w = weaponById(id);
    if (this.save.owned[id] || !canAfford(this.save.bank, w.price)) return;
    this.spend(w.price);
    this.save.owned[id] = true;
    writeSave(this.save);
    this.sound.pickup();
  }

  private upgradeWeapon(id: string, track: Track) {
    const w = weaponById(id);
    const lv = this.save.weaponLv[id];
    if (!this.save.owned[id] || lv[track] >= MAX_UPGRADE) return;
    const cost = upgradeCost(w, track, lv[track]);
    if (!canAfford(this.save.bank, cost)) return;
    this.spend(cost);
    lv[track]++;
    writeSave(this.save);
    this.sound.pickup();
  }

  private spend(c: { meat?: number; shards?: number; trophies?: number }) {
    this.save.bank.meat -= c.meat ?? 0;
    this.save.bank.shards -= c.shards ?? 0;
    this.save.bank.trophies -= c.trophies ?? 0;
  }

  private updatePlaying(dt: number) {
    const p = this.player;
    this.wind.update(dt);
    if (this.input.dx || this.input.dy) this.rig.look(this.input.dx, this.input.dy);
    p.update(dt, this.input, this.rig, this.world);

    for (let f = 1; f <= 4; f++) if (this.input.was(`Digit${f}`)) this.selectFamily(f);
    if (this.input.wheel) this.cycleWeapon(this.input.wheel > 0 ? 1 : -1);
    this.weaponInput(dt);
    this.updateGhost();
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      this.delayed[i].t -= dt;
      if (this.delayed[i].t <= 0) this.delayed.splice(i, 1)[0].fn();
    }
    if (this.input.was('KeyE')) {
      if (!this.interact()) this.hud.toast('Intet at samle op her', 900);
    }

    const ctx: AnimalContext = {
      player: p,
      wind: this.wind,
      world: this.world,
      scentMul: this.stats.scentMul,
      time: this.time,
      onAlert: (a) => {
        if (a.pos.distanceTo(p.pos) < 35) this.sound.alert();
      },
      onStrike: (a) => {
        if (p.damage(a.def.damage, a.def.name)) this.rig.kick(0.3);
      },
    };
    for (const a of this.animals) a.update(dt, ctx);
    for (let i = this.animals.length - 1; i >= 0; i--) {
      if (this.animals[i].removable) {
        this.scene.remove(this.animals[i].group);
        this.animals.splice(i, 1);
      }
    }
    this.projectiles.update(dt, this.animals);
    this.traps.update(dt, this.animals);
    this.drops.update(this.time);
    this.bursts.update(dt);

    if (p.dead) {
      this.die();
      return;
    }
    const dCave = Math.hypot(p.pos.x - this.world.caveEntrance.x, p.pos.z - this.world.caveEntrance.z);
    if (dCave < 5 && !this.completed) {
      this.complete();
      return;
    }
    this.updateHud(dCave, dt);
  }

  private updateHud(dCave: number, dt: number) {
    const p = this.player;
    const heading = this.rig.heading;
    const wx = this.wind.dx;
    const wz = this.wind.dz;
    const xs = wx * -Math.cos(heading) + wz * Math.sin(heading);
    const ys = wx * Math.sin(heading) + wz * Math.cos(heading);
    const nearLoot = this.drops.near(p.pos, PLAYER.pickupRange).length > 0 || this.projectiles.nearestStuck(p.pos, PLAYER.pickupRange) || this.traps.nearTrap(p.pos, PLAYER.pickupRange);
    let hint = '';
    if (nearLoot) hint = '[E] Saml op';
    else if (p.hp < this.stats.maxHealth * 0.6 && p.carried.meat > 0) hint = '[E] Spis kød';
    const total = this.level.length;
    this.hud.update(
      {
        hp: p.hp,
        maxHp: this.stats.maxHealth,
        stamina: p.stamina,
        maxStamina: this.stats.maxStamina,
        exhausted: p.stamina < PLAYER.exhaustedUntil && !p.sprinting && p.stamina < 5,
        ...this.weaponHud(),
        meat: p.carried.meat,
        shards: p.carried.shards,
        trophies: p.carried.trophies,
        windDeg: (Math.atan2(xs, ys) * 180) / Math.PI,
        windLabel: this.wind.label(),
        progress: 1 - dCave / total,
        distLeft: dCave,
        level: this.level.n,
        hint,
        aiming: p.aiming,
        hurt: p.hurtFlash,
      },
      dt,
    );
  }

  // ---------- loop ----------

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(dt);
    requestAnimationFrame(() => this.loop());
  }

  /** One frame. Public so tests can step the game deterministically. */
  step(dt: number) {
    this.time += dt;
    if (this.state === 'playing') {
      this.updatePlaying(dt);
      this.rig.update(dt, this.player.pos, this.aimBlend(), this.world);
    } else if (this.state === 'dead') {
      this.deathTimer -= dt;
      this.rig.update(dt, this.player.pos, 0, this.world);
      this.wind.update(dt);
      for (const a of this.animals) a.update(dt, this.deadCtx());
      this.hud.update(this.hudSnapshot(), dt);
      if (this.deathTimer <= 0 && !document.querySelector('.scr.on')) {
        this.hud.show(false);
        this.screens.death(`Dræbt af ${this.player.killedBy}.`, {
          retry: () => this.startLevel(this.level.n),
          menu: () => this.showMenu(),
        });
      }
    } else if (this.state === 'paused') {
      // frozen
    } else {
      // menu / hub backdrop: orbit slowly around the start or the cave
      this.wind.update(dt);
      const focus = this.state === 'hub' ? this.world.caveEntrance : this.world.spawn;
      const a = this.time * 0.08;
      const r = this.state === 'hub' ? 15 : 12;
      this.camera.position.set(focus.x + Math.sin(a) * r, focus.y + 4.5, focus.z + Math.cos(a) * r + (this.state === 'hub' ? 4 : 0));
      this.camera.lookAt(focus.x, focus.y + (this.state === 'hub' ? 3 : 2), focus.z);
      if (this.camera.fov !== 68) {
        this.camera.fov = 68;
        this.camera.updateProjectionMatrix();
      }
    }
    const focus = this.state === 'playing' || this.state === 'dead' || this.state === 'paused' ? this.player.pos : this.camera.position;
    this.world.update(dt, focus, this.camera, this.time);
    this.drift.update(dt, this.wind, this.camera.position, this.time);
    this.fireflies?.update(dt, focus, this.time, this.world.height(focus.x, focus.z));
    this.world.setWind(this.wind.dx, this.wind.dz, this.wind.strength);
    this.sound.setWind(this.wind.strength, this.time);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  private weaponHud() {
    const p = this.player;
    const w = weaponById(p.weaponId);
    const owned = this.ownedWeapons();
    const spread = this.currentSpread();
    return {
      crossSize: Math.round(Math.min(90, Math.max(10, 9 + spread * 560))),
      drawP: p.drawing ? p.drawP : 0,
      weaponName: w.name,
      ammoText: w.ammo > 0 ? String(p.ammo[w.id] ?? 0) : '∞',
      slots: FAMILIES.map((f, i) => {
        const inFam = owned.filter((o) => o.family === i + 1);
        const active = w.family === i + 1;
        return { key: f.key, name: active ? w.name : inFam[0]?.name ?? '', active, locked: inFam.length === 0, count: inFam.length };
      }),
    };
  }

  private deadCtx(): AnimalContext {
    // dead hunters smell of nothing, animals just wander off
    return {
      player: this.player,
      wind: this.wind,
      world: this.world,
      scentMul: 0,
      time: this.time,
      onAlert: () => {},
      onStrike: () => {},
    };
  }

  private hudSnapshot() {
    const p = this.player;
    return {
      hp: p.hp, maxHp: this.stats.maxHealth, stamina: p.stamina, maxStamina: this.stats.maxStamina, exhausted: false,
      ...this.weaponHud(), meat: p.carried.meat, shards: p.carried.shards, trophies: p.carried.trophies,
      windDeg: 0, windLabel: this.wind.label(), progress: 0, distLeft: 0, level: this.level.n, hint: '', aiming: false, hurt: 1,
    };
  }
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
