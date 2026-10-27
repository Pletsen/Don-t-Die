import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { PLAYER } from '../data/balance';
import { DIFFICULTY } from '../data/difficulty';
import { getLevel, LEVEL_COUNT, type LevelDef } from '../data/levels';
import { UPGRADES, type UpgradeId } from '../data/upgrades';
import { effective, FAMILIES, MAX_UPGRADE, upgradeCost, weaponById, WEAPONS, type Effective, type Track, type WeaponDef } from '../data/weapons';
import { Animal, type AnimalContext } from '../animals/Animal';
import { spawnAnimals, spawnBoss } from '../animals/spawner';
import type { Boss } from '../animals/Boss';
import type { AnimalCue } from '../animals/Animal';
import { Blood } from '../fx/Blood';
import { Audio } from '../audio/Audio';
import { AudioDirector } from '../audio/AudioDirector';
import { CameraRig } from '../player/CameraRig';
import { buildHeldModel } from '../player/Held';
import { Player, type PlayerStats } from '../player/Player';
import { Hud } from '../ui/Hud';
import { SoundBoard } from '../ui/SoundBoard';
import { canAfford, Screens, type RunSummary } from '../ui/Screens';
import { Projectiles } from '../weapons/Projectiles';
import { Traps } from '../weapons/Traps';
import { Drift, Fireflies } from '../world/Drift';
import { Wind } from '../world/Wind';
import { World } from '../world/World';
import { Bursts } from './Burst';
import { Drops, DROP_LABEL } from './Drops';
import { Input } from './Input';
import { freshSave, loadSave, writeSave, type Save } from './save';
import { QUALITY_ORDER, qualityProfile, settings } from './settings';

const MIN_POWER = 0.12; // a tap on the button
// animals that count against the engagement cap; 'circle' animals wait their turn and must not block each other
const HOSTILE = new Set(['chase', 'windup', 'strike', 'recover']);
/** Anything that means "you are being hunted" (music, the 'Uset' mark, threat chevrons). */
const HUNTING = new Set(['chase', 'windup', 'strike', 'recover', 'circle']);

type State = 'menu' | 'hub' | 'playing' | 'paused' | 'dead' | 'arriving' | 'ending';

/** Help texts shown once each, the first time the situation comes up (stored in save.seenHelp). */
const HELP: Record<string, string> = {
  draw: 'Hold venstre museknap nede for at spænde buen. Slip for at skyde. Jo længere du spænder, jo hårdere og mere præcist.',
  wind: 'Et dyr har fået færten af dig. Se vindkompasset: driver din fært hen mod dyrene, lugter de dig langt væk.',
  pickup: 'Tryk E for at samle kød, skærv og pile op.',
  eat: 'Du er såret. Tryk E for at spise et stykke kød.',
  roll: 'Et rovdyr jagter dig! Tryk Ctrl (eller C) for at rulle væk, når det springer.',
  cave: 'Hulen er lige foran. Gå ind for at komme i sikkerhed.',
  jump: 'Mellemrum hopper over sten og væltede stammer.',
};

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(68, 1, 0.1, 600);
  readonly rig = new CameraRig(this.camera);
  readonly input: Input;
  readonly audio = new Audio();
  readonly director = new AudioDirector(this.audio);
  readonly hud: Hud;
  readonly screens: Screens;
  save: Save;
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
  bursts!: Bursts;
  blood?: Blood;
  boss: Boss | null = null;

  private composer!: EffectComposer;
  private renderPass!: RenderPass;
  private gradePass!: ShaderPass;
  private builtLevel = 0;
  private time = 0;
  private last = performance.now();
  private lastRun: RunSummary | null = null;
  private stats: PlayerStats = { maxHealth: 100, maxStamina: 100, scentMul: 1 };
  private deathTimer = 0;
  private arriveT = 0;
  private hitStop = 0;
  /** Physics/animation run at this speed (slow motion on big moments). */
  private timeScale = 1;
  private slowT = 0;
  private ghost?: THREE.Mesh;
  private delayed: { t: number; fn: () => void }[] = [];
  private run = { hunted: false, whiteDeer: false, kills: 0 };
  private helpShown = new Set<string>();
  /** The browser must hand us the mouse to play; tests (webdriver) have no pointer lock. */
  private readonly requireLock = !navigator.webdriver;
  private v1 = new THREE.Vector3();
  private soundBoard = new SoundBoard(this.audio);
  /** Real frame times for the FPS readout and automatic quality. */
  private frameTimes: number[] = [];
  private fpsT = 0;
  private autoT = 0;

  constructor(root: HTMLElement, ui: HTMLElement) {
    this.save = loadSave();
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // count draw calls for the whole frame (shadow + main + post), reset by hand in step()
    this.renderer.info.autoReset = false;
    root.appendChild(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(ui);
    this.screens = new Screens(ui, () => this.audio.play('ui_click'));
    this.setupPost();
    addEventListener('resize', () => this.resize());
    this.resize();

    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && this.requireLock) this.pause();
      this.hud.setUnlocked(this.state === 'playing' && !locked && this.requireLock);
    };
    this.input.onPauseKey = () => {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    };
    this.input.onClickUnlocked = () => this.input.requestLock();

    try {
      this.buildLevel(this.save.selected);
    } catch (err) {
      // a broken save must never brick the game
      console.error(err);
      this.save = freshSave();
      writeSave(this.save);
      this.buildLevel(1);
    }
    this.showMenu();
    if (new URLSearchParams(location.search).has('lyd')) this.soundBoard.open(() => this.showMenu());
    requestAnimationFrame(() => this.loop());
  }

  // ======================================================================
  // rendering setup
  // ======================================================================

  /** Bloom (per quality), a colour grade with vignette, then tone mapping. */
  private setupPost() {
    const q = qualityProfile();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatioMax));
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.composer?.dispose();
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(this.scene ?? new THREE.Scene(), this.camera);
    this.composer.addPass(this.renderPass);
    if (q.bloom) this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.3, 0.6, 0.9));
    this.gradePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        vig: { value: 0.4 },
        tint: { value: new THREE.Vector3(1, 1, 1) },
        sat: { value: 1.08 },
        hurt: { value: 0 },
        lift: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float vig; uniform vec3 tint; uniform float sat; uniform float hurt; uniform float lift; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          c += lift * vec3(0.6, 0.8, 1.0);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, sat * (1.0 - 0.6 * hurt)) * tint;
          float d = distance(vUv, vec2(0.5));
          c *= 1.0 - vig * smoothstep(0.32, 0.9, d);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.composer.addPass(this.gradePass);
    this.composer.addPass(new OutputPass());
    this.composer.setSize(w, h);
    if (this.level) this.applyGrade();
  }

  private applyGrade() {
    const tod = this.level.tod;
    const g = (this.world as unknown as { grade?: { tint?: THREE.Vector3; sat?: number; vignette?: number; lift?: number } }).grade;
    this.gradePass.uniforms.lift.value = g?.lift ?? 0;
    if (g?.tint) this.gradePass.uniforms.tint.value.copy(g.tint);
    else this.gradePass.uniforms.tint.value.set(1.05 - tod * 0.12, 1.0 - tod * 0.02, 0.95 + tod * 0.12);
    this.gradePass.uniforms.sat.value = g?.sat ?? 1.08 - tod * 0.1;
    this.gradePass.uniforms.vig.value = g?.vignette ?? 0.36 + tod * 0.16;
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ======================================================================
  // level building and teardown
  // ======================================================================

  /** Frees everything the old level put on the GPU (geometries, materials, textures). */
  private disposeScene() {
    if (!this.scene) return;
    const seen = new Set<object>();
    const free = (o: { dispose?: () => void } | null | undefined) => {
      if (!o || seen.has(o)) return;
      seen.add(o);
      o.dispose?.();
    };
    this.scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry) free(m.geometry);
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mat of mats) {
        for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) free(v);
        free(mat);
      }
    });
    for (const a of this.animals) a.dispose();
    this.projectiles?.clear();
    this.blood?.dispose();
    this.blood = undefined;
    this.bursts?.dispose();
    this.drift?.dispose();
    this.fireflies?.dispose();
    this.drops?.dispose();
    this.world?.dispose();
    this.renderer.renderLists.dispose();
  }

  /** Builds the world for a level. Also used as a slowly turning backdrop for the menus. */
  private buildLevel(n: number) {
    this.disposeScene();
    this.level = getLevel(n);
    this.builtLevel = n;
    this.scene = new THREE.Scene();
    this.ghost = undefined;
    this.delayed = [];
    this.world = new World(this.scene, this.level, this.renderer);
    this.renderPass.scene = this.scene;
    this.applyGrade();
    this.camera.far = this.world.viewDistance;
    this.camera.updateProjectionMatrix();
    this.wind = new Wind(this.level.windAngle, this.level.windStrength);
    this.projectiles = new Projectiles(this.scene, this.world);
    this.projectiles.onHit = (e) => this.onAnimalHit(e.animal, e.killed, e.point);
    this.projectiles.onImpact = (e) => {
      this.audio.play(e.surface === 'wood' ? 'hit_wood' : e.look === 'stone' ? 'hit_stone' : 'hit_ground', { pos: e.point });
      this.blood?.dust(e.point, 0.3);
    };
    this.traps = new Traps(this.scene, this.world);
    this.blood = new Blood(this.scene, this.world);
    this.traps.blood = this.blood;
    this.traps.onTrigger = (a) => {
      this.audio.play(a.def.radius > 1 ? 'beartrap_clamp' : 'snare_snap', { pos: a.pos });
      this.hud.toast('Fælden klaprede!', 1400);
    };
    this.drops = new Drops(this.scene, this.world);
    this.bursts = new Bursts(this.scene);
    this.drift = new Drift(this.world.night > 0.5 ? 0x9fb4d8 : 0xd9c58a);
    this.scene.add(this.drift.points);
    this.fireflies = this.level.tod > 0.4 ? new Fireflies() : undefined;
    if (this.fireflies) this.scene.add(this.fireflies.points);
    this.animals = spawnAnimals(this.level, this.world);
    for (const a of this.animals) {
      this.scene.add(a.group);
      a.onDeath = (an) => this.onKilled(an);
    }
    this.boss = spawnBoss(this.level, this.world);
    if (this.boss) {
      const boss = this.boss;
      this.scene.add(boss.group);
      this.animals.push(boss);
      boss.onDeath = (an) => this.onKilled(an);
      boss.onSummon = (w) => {
        this.scene.add(w.group);
        w.onDeath = (an) => this.onKilled(an);
        this.animals.push(w);
      };
      boss.onPhase = () => {
        this.hitStop = 0.12;
        this.timeScale = 0.3;
        this.slowT = 0.4;
        this.rig.kick(0.6);
        this.audio.duck(0.5, 1.5);
      };
    }
    this.renderer.toneMappingExposure = this.world.light.exposure;
    // placeholder player so the menu backdrop has something to follow
    this.player = new Player({ maxHealth: 100, maxStamina: 100, scentMul: 1 }, 0);
    this.player.pos.copy(this.world.spawn);
    this.player.dead = true;
  }

  /**
   * Compiles the shaders of everything that can appear mid-fight (loot, particles, thrown weapons, traps, held weapons)
   * while the level loads. Otherwise the first kill or first throw would freeze for a moment.
   */
  private warmed = false;

  private warmup() {
    if (this.warmed) return;
    this.warmed = true;
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
    for (const w of WEAPONS) if (this.save.owned[w.id]) warm.add(buildHeldModel(w).group);
    this.renderer.compile(warm, this.camera, this.scene);
  }

  // ======================================================================
  // flow: menu, hub, level, pause, death, arrival, ending
  // ======================================================================

  private showMenu() {
    this.state = 'menu';
    this.input.playing = false;
    this.hud.show(false);
    this.hud.setUnlocked(false);
    if (this.builtLevel !== this.save.selected) this.buildLevel(this.save.selected);
    this.director.menu(this.level.tod);
    this.screens.menu(this.save, {
      play: () => {
        this.audio.init();
        this.showHub();
      },
      settings: () => this.openSettings(() => this.showMenu()),
      reset: () => {
        const keep = { ...settings };
        this.save = freshSave();
        this.save.settings = keep;
        writeSave(this.save);
        this.lastRun = null;
        this.showMenu();
      },
    });
  }

  private showHub() {
    this.state = 'hub';
    this.input.playing = false;
    this.hud.show(false);
    this.hud.setUnlocked(false);
    this.save.selected = Math.max(1, Math.min(this.save.selected || this.save.level, this.save.level));
    if (this.builtLevel !== this.save.selected) {
      this.screens.loading('Hulen…');
      this.buildLevel(this.save.selected);
    }
    this.director.menu(this.level.tod);
    this.refreshHub();
  }

  /** Re-renders the hub screen only (buying something must not rebuild the forest). */
  private refreshHub() {
    this.screens.hub(this.save, this.lastRun, {
      go: () => this.startLevel(this.save.selected),
      select: (n) => {
        this.save.selected = n;
        writeSave(this.save);
        this.refreshHub();
      },
      buy: (id) => {
        this.buy(id);
        this.refreshHub();
      },
      buyWeapon: (id) => {
        this.buyWeapon(id);
        this.refreshHub();
      },
      upgradeWeapon: (id, track) => {
        this.upgradeWeapon(id, track);
        this.refreshHub();
      },
      settings: () => this.openSettings(() => this.refreshHub()),
      menu: () => this.showMenu(),
    });
  }

  private openSettings(back: () => void) {
    const before = settings.quality;
    this.screens.settings(
      () => {
        writeSave(this.save);
        if (before !== settings.quality) this.setupPost();
        back();
      },
      () => this.soundBoard.open(() => this.openSettings(back)),
    );
  }

  startLevel(n: number) {
    this.audio.init();
    this.screens.loading(`Bane ${n}…`);
    this.buildLevel(n);
    const u = this.save.upgrades;
    const diff = DIFFICULTY[settings.difficulty];
    this.stats = {
      maxHealth: Math.round((PLAYER.maxHealth + 15 * u.health) * diff.playerHealth),
      maxStamina: PLAYER.maxStamina + 15 * u.stamina,
      scentMul: 1 - 0.08 * u.wind,
    };
    this.player = new Player(this.stats, Math.min(this.save.bank.meat, PLAYER.startingMeatPack));
    this.eff = {};
    for (const w of WEAPONS) {
      this.eff[w.id] = effective(w, this.save.weaponLv[w.id]);
      if (this.save.owned[w.id] && w.ammo > 0) this.player.ammo[w.id] = Math.round(this.eff[w.id].ammo * diff.ammo);
    }
    this.player.weaponId = 'jagtbue';
    this.player.pos.copy(this.world.spawn);
    this.player.onRoll = () => this.audio.play('roll');
    this.player.onJump = () => {
      this.audio.play('jump');
      this.tip('jump', false);
    };
    this.player.onLand = (impact?: number) => {
      this.audio.play('land', { volume: Math.min(1.2, 0.5 + (impact ?? 4) / 10) });
      if ((impact ?? 0) > 5) this.bursts.emit(this.player.pos.clone().setY(this.player.pos.y + 0.1), 0x8a7a5a, 8, 2);
    };
    this.player.onHurt = () => {
      this.audio.play('hurt');
      this.audio.duck(0.35, 0.8);
      this.hitStop = Math.max(this.hitStop, 0.06);
    };
    this.scene.add(this.player.group);
    this.rig.heading = Math.PI;
    this.rig.pitch = 0.08;
    this.run = { hunted: false, whiteDeer: false, kills: 0 };
    this.helpShown.clear();
    this.hitStop = 0;
    this.timeScale = 1;
    this.state = 'playing';
    this.input.playing = true;
    this.screens.hide();
    this.hud.show(true);
    this.warmup();
    this.director.startLevel(this.level.tod, this.world.caveEntrance, this.level.n % 10 === 0);
    this.hud.toast(`Bane ${n} · ${this.windText()}`, 3500);
    if (n === 1) setTimeout(() => this.tip('draw'), 3800);
    this.input.requestLock();
    this.hud.setUnlocked(this.requireLock && !this.input.locked);
  }

  private pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.playing = false;
    this.player.drawing = false;
    this.audio.stopLoop('sling');
    this.hud.show(false);
    this.hud.setUnlocked(false);
    document.exitPointerLock?.();
    this.screens.pause({
      resume: () => this.resume(),
      settings: () => this.openSettings(() => this.pauseScreenAgain()),
      hub: () => this.showHub(),
      menu: () => this.showMenu(),
    });
  }

  private pauseScreenAgain() {
    this.state = 'playing';
    this.pause();
  }

  /** Back to the game. If the browser refuses the mouse right now, a "click to continue" overlay waits for a click. */
  private resume() {
    this.state = 'playing';
    this.input.playing = true;
    this.screens.hide();
    this.hud.show(true);
    this.input.requestLock();
    this.hud.setUnlocked(this.requireLock && !this.input.locked);
  }

  private die() {
    this.state = 'dead';
    this.input.playing = false;
    this.deathTimer = 1.8;
    this.timeScale = 0.4;
    this.slowT = 1.2;
    this.audio.play('death');
    this.audio.play('death_sting');
    this.audio.duck(0.7, 2.5);
    this.audio.stopLoop('sling');
    this.save.stats.deaths++;
    // on easy you keep part of what you carried
    const keep = DIFFICULTY[settings.difficulty].keepCarried;
    if (keep > 0) {
      const c = this.player.carried;
      this.save.bank.shards += Math.floor(c.shards * keep);
      this.save.bank.meat += Math.floor(Math.max(0, c.meat - this.player.startMeat) * keep);
    }
    writeSave(this.save);
    document.exitPointerLock?.();
    this.hud.setUnlocked(false);
  }

  /** Reached the cave: a short walk into the light before the hub. */
  private arrive() {
    this.state = 'arriving';
    this.input.playing = false;
    this.arriveT = 0;
    this.player.drawing = false;
    this.audio.play('level_complete');
    document.exitPointerLock?.();
    this.hud.setUnlocked(false);
    this.hud.show(false);
  }

  private complete() {
    const n = this.level.n;
    const c = this.player.carried;
    const stat = (this.save.levels[n] ??= { cleared: false, plays: 0, marks: { home: false, unseen: false, whiteDeer: false } });
    const firstClear = !stat.cleared;
    // replays pay fewer shards each time, so going back is worth it but not farmable (QA review 2.6)
    const replayMul = firstClear ? 1 : Math.max(0.25, 0.7 - 0.15 * Math.max(0, stat.plays - 1));
    const shards = Math.round(c.shards * replayMul * DIFFICULTY[settings.difficulty].shardMul) + (firstClear ? 5 * Math.ceil(n / 5) : 0);
    const meatGain = Math.max(0, c.meat - this.player.startMeat);
    const bank = this.save.bank;
    bank.meat = Math.max(0, bank.meat + (c.meat - this.player.startMeat));
    bank.shards += shards;
    bank.trophies += c.trophies;
    stat.cleared = true;
    stat.plays++;
    const newMarks: string[] = [];
    stat.marks.home = true;
    if (!this.run.hunted && !stat.marks.unseen) {
      stat.marks.unseen = true;
      newMarks.push('Uset');
    }
    if (this.run.whiteDeer && !stat.marks.whiteDeer) {
      stat.marks.whiteDeer = true;
      newMarks.push('Hvid hjort');
    }
    this.lastRun = { level: n, meat: meatGain, shards, trophies: c.trophies, firstClear, replayMul, marks: newMarks };
    this.save.level = Math.min(LEVEL_COUNT, Math.max(this.save.level, n + 1));
    this.save.selected = Math.min(this.save.level, n >= LEVEL_COUNT ? n : n + 1);
    if (n >= LEVEL_COUNT && !this.save.finished) {
      this.save.finished = true;
      writeSave(this.save);
      this.state = 'ending';
      this.screens.ending(this.save, { hub: () => this.showHub() });
      return;
    }
    writeSave(this.save);
    this.showHub();
  }

  // ======================================================================
  // shop
  // ======================================================================

  private buy(id: UpgradeId) {
    const def = UPGRADES.find((u) => u.id === id)!;
    const lvl = this.save.upgrades[id];
    const cost = def.costs[lvl];
    if (!cost || !canAfford(this.save.bank, cost)) return void this.audio.play('ui_error');
    this.spend(cost);
    this.save.upgrades[id] = lvl + 1;
    writeSave(this.save);
    this.audio.play('ui_buy');
  }

  private buyWeapon(id: string) {
    const w = weaponById(id);
    if (this.save.owned[id] || !canAfford(this.save.bank, w.price)) return void this.audio.play('ui_error');
    this.spend(w.price);
    this.save.owned[id] = true;
    writeSave(this.save);
    this.audio.play('ui_buy');
  }

  private upgradeWeapon(id: string, track: Track) {
    const w = weaponById(id);
    const lv = this.save.weaponLv[id];
    if (!this.save.owned[id] || lv[track] >= MAX_UPGRADE) return;
    const cost = upgradeCost(w, track, lv[track]);
    if (!canAfford(this.save.bank, cost)) return void this.audio.play('ui_error');
    this.spend(cost);
    lv[track]++;
    writeSave(this.save);
    this.audio.play('ui_buy');
  }

  private spend(c: { meat?: number; shards?: number; trophies?: number }) {
    this.save.bank.meat -= c.meat ?? 0;
    this.save.bank.shards -= c.shards ?? 0;
    this.save.bank.trophies -= c.trophies ?? 0;
  }

  // ======================================================================
  // weapons
  // ======================================================================

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
    this.audio.play('weapon_switch');
    this.audio.stopLoop('sling');
    this.hud.toast(weaponById(id).name, 900);
  }

  private ammoName(w: WeaponDef): string {
    return w.ammoName ?? w.name.toLowerCase();
  }

  /** 0..1 power of the current draw. A tap gives `MIN_POWER`, a full draw gives 1. */
  private power(): number {
    return Math.max(MIN_POWER, this.player.drawP);
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
      if (p.drawing) this.audio.stopLoop('sling');
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
            this.audio.play('ui_error');
            this.hud.toast(`Ingen ${this.ammoName(w)} tilbage. Find dem i skoven.`, 1500);
          }
          return;
        }
        p.drawing = true;
        p.drawT = 0;
        p.drawP = 0;
        if (w.family === 1) this.audio.play('bow_draw', { rate: w.id === 'langbue' ? 0.85 : w.id === 'hurtigbue' ? 1.3 : 1 });
        if (w.id === 'slynge') this.audio.loop('sling', 'sling_whirl', 1, undefined, 0.3);
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
    this.audio.stopLoop('sling', 0.15);
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
    if (w.kind !== 'proj') return 0.02;
    return this.spreadFor(this.eff[w.id], p.drawing ? this.power() : MIN_POWER);
  }

  private spreadFor(e: Effective, power: number): number {
    const p = this.player;
    let s = e.spread * (1 - 0.92 * power);
    if (p.aiming) s = Math.min(s, e.spreadAim + e.spread * (1 - 0.92 * power) * 0.35);
    // holding a full draw for too long makes the arms tremble
    if (p.drawing || power >= 1) s += Math.min(0.02, Math.max(0, p.drawT - e.draw - 1.2) * 0.012);
    if (p.moving) s *= 1.35;
    return s;
  }

  private aimBlend(): number {
    const p = this.player;
    return p.aiming ? 1 : p.drawing ? 0.25 + 0.35 * p.drawP : 0;
  }

  /** Where shots leave: the visible weapon if the player model offers it, else in front of the chest. */
  private muzzle(): THREE.Vector3 {
    const p = this.player as unknown as { muzzle?: (out: THREE.Vector3) => THREE.Vector3 };
    if (typeof p.muzzle === 'function') return p.muzzle(new THREE.Vector3());
    return this.player.chest.addScaledVector(new THREE.Vector3(Math.sin(this.rig.heading), 0, Math.cos(this.rig.heading)), 0.55);
  }

  private fireProjectile(w: WeaponDef, e: Effective, power: number) {
    const forward = this.rig.forward;
    const origin = this.muzzle();
    // Aim at what the crosshair is on: the nearest animal under the camera ray, otherwise a point 40 m out.
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
    if (w.look === 'arrow') this.audio.play('bow_release', { rate: w.id === 'langbue' ? 0.92 : w.id === 'hurtigbue' ? 1.1 : 1, volume: 0.7 + 0.3 * power });
    else if (w.look === 'stone') this.audio.play('sling_release');
    else this.audio.play(w.look === 'knife' ? 'throw_light' : 'throw_heavy');
    this.rig.kick(0.03 + 0.03 * power);
  }

  private melee(w: WeaponDef, e: Effective) {
    const p = this.player;
    p.shotCooldown = e.cooldown;
    p.fired(e.noise);
    p.heading = this.rig.heading;
    const dur = Math.min(0.55, Math.max(0.24, e.cooldown * 0.75));
    this.audio.play('melee_swing');
    const strike = () => {
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
        const point = a.hitCenter();
        const dir = new THREE.Vector3(fx, 0, fz);
        const hurt = a.hurt as unknown as (dmg: number, world: World, from: THREE.Vector3, info?: { dir?: THREE.Vector3; point?: THREE.Vector3 }) => boolean;
        const killed = hurt.call(a, e.damage, this.world, p.pos, { dir, point });
        this.onAnimalHit(a, killed, point);
        this.audio.play(w.id === 'jagtkniv' ? 'knife_stab' : 'axe_chop', { pos: point });
        hit = true;
      }
      if (!hit) this.bursts.emit(p.chest.add(new THREE.Vector3(fx * (e.reach * 0.8), -0.4, fz * (e.reach * 0.8))), 0xcfd6da, 4, 2);
      this.rig.kick(hit ? 0.15 : 0.03);
    };
    // the blow lands at the contact frame of the swing animation, not on the click
    const held = p.held as unknown as { swing: (dur: number, contactAt?: number, onContact?: () => void) => void };
    if (held.swing.length >= 3) held.swing(dur, w.id === 'jagtkniv' ? 0.45 : 0.5, strike);
    else {
      held.swing(dur);
      this.delayed.push({ t: dur * 0.5, fn: strike });
    }
  }

  /** Point in front of the hunter, kept out of trees and inside the forest. */
  private placeAt(dist: number): THREE.Vector3 {
    const h = this.rig.heading;
    this.player.heading = h;
    const at = this.player.pos.clone().add(new THREE.Vector3(Math.sin(h) * dist, 0, Math.cos(h) * dist));
    this.world.collide(at, 0.8);
    at.y = this.world.height(at.x, at.z);
    return at;
  }

  private placeTrap(w: WeaponDef, e: Effective) {
    this.traps.placeTrap(this.placeAt(1.0), { weaponId: w.id, type: w.trap!, radius: w.radius!, damage: e.damage, root: e.root });
    this.audio.play(w.trap === 'snare' ? 'snare_set' : 'trap_set');
    this.hud.toast(`${w.name} lagt ud`, 1000);
  }

  private placeBait(w: WeaponDef, e: Effective) {
    this.traps.placeBait(this.placeAt(8), {
      weaponId: w.id,
      life: e.damage,
      lure: e.lure,
      poison: w.poison ? { dps: e.poisonDps, time: e.poisonTime } : undefined,
    });
    this.audio.play('bait_place');
    this.hud.toast(`${w.name} kastet ud`, 1000);
  }

  /** A ring on the ground shows where a trap or bait will land while you hold the button. */
  private updateGhost() {
    const p = this.player;
    const w = weaponById(p.weaponId);
    const on = p.drawing && (w.kind === 'trap' || w.kind === 'bait');
    if (!this.ghost) {
      this.ghost = new THREE.Mesh(
        new THREE.RingGeometry(0.7, 0.85, 28).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.7, depthWrite: false, fog: false }),
      );
      this.ghost.visible = false;
      this.scene.add(this.ghost);
    }
    this.ghost.visible = on;
    if (on) {
      const at = this.placeAt(w.kind === 'bait' ? 8 : 1.0);
      this.ghost.position.set(at.x, at.y + 0.08, at.z);
      this.ghost.scale.setScalar(w.kind === 'bait' ? 1.4 : 1);
    }
  }

  // ======================================================================
  // hits, kills, loot
  // ======================================================================

  private onAnimalHit(a: Animal, killed: boolean, point: THREE.Vector3) {
    this.audio.play('hit_flesh', { pos: point });
    if (killed) this.audio.play(a.def.radius > 0.9 ? 'bone_crunch' : 'gore_splat', { pos: point });
    this.hud.hitMarker();
    const stealth = (a as unknown as { lastHitStealth?: boolean }).lastHitStealth;
    if (stealth && !killed) this.hud.toast('Snigskud! Dobbelt skade', 1200);
    const heavy = killed || a.def.radius > 1;
    this.hitStop = Math.max(this.hitStop, killed ? 0.07 : heavy ? 0.045 : 0.025);
  }

  private onKilled(a: Animal) {
    const d = a.def;
    const deathPos = (a as unknown as { deathPos?: () => THREE.Vector3 }).deathPos?.() ?? a.pos;
    this.drops.spawn('meat', d.meat, deathPos);
    this.drops.spawn('shards', d.shards, deathPos);
    this.run.kills++;
    this.save.stats.kills[d.id] = (this.save.stats.kills[d.id] ?? 0) + 1;
    let msg = `${cap(d.name)} nedlagt`;
    // trophies: the white deer pays once per level, the first kill of every species pays once per game
    if (d.trophies > 0) {
      const stat = this.save.levels[this.level.n];
      if (d.id === 'hvidhjort' && stat?.marks.whiteDeer) this.drops.spawn('shards', 6, deathPos);
      else this.drops.spawn('trophies', d.trophies, deathPos);
      if (d.id === 'hvidhjort') this.run.whiteDeer = true;
    }
    const boss = (a as unknown as { isBoss?: boolean; bossName?: string }).isBoss ? (a as unknown as { bossName: string }) : null;
    if (boss) {
      this.save.bossesBeaten[this.level.n] = true;
      this.hud.setBoss(null);
      this.director.setBossEngaged(false);
      this.timeScale = 0.3;
      this.slowT = 1.2;
      this.hud.toast(`${boss.bossName} er nedlagt! Vejen til hulen er fri.`, 3000);
      this.rig.kick(0.5);
      return;
    }
    if (!this.save.firstKill[d.id]) {
      this.save.firstKill[d.id] = true;
      this.drops.spawn('trophies', 1, deathPos);
      msg = `Første ${d.name}! +1 trofæ`;
    }
    this.hud.toast(msg, 1800);
    this.hitStop = Math.max(this.hitStop, 0.07);
    this.rig.kick(0.2);
  }

  private interact(): boolean {
    const p = this.player;
    const got: string[] = [];
    let any = false;
    for (const d of this.drops.near(p.pos, PLAYER.pickupRange)) {
      p.carried[d.kind] += d.amount;
      got.push(`+${d.amount} ${DROP_LABEL[d.kind]}`);
      this.drops.take(d);
      this.audio.play(d.kind === 'meat' ? 'pickup_meat' : d.kind === 'shards' ? 'pickup_shards' : 'pickup_trophy');
      any = true;
    }
    const back: Record<string, number> = { ...this.projectiles.collect(p.pos, PLAYER.pickupRange) };
    // eating comes before taking traps back: you just put that trap down on purpose
    if (!any && Object.keys(back).length === 0 && p.carried.meat > 0 && p.hp < this.stats.maxHealth) {
      p.carried.meat--;
      p.heal(PLAYER.eatHeal * DIFFICULTY[settings.difficulty].eatHeal);
      this.audio.play('eat');
      this.hud.toast('Du spiser et stykke kød', 1200);
      return true;
    }
    if (!any) for (const [id, n] of Object.entries(this.traps.collect(p.pos, PLAYER.pickupRange))) back[id] = (back[id] ?? 0) + n;
    for (const [id, n] of Object.entries(back)) {
      const w = weaponById(id);
      const room = Math.max(0, Math.round(this.eff[id].ammo * DIFFICULTY[settings.difficulty].ammo) - (p.ammo[id] ?? 0));
      const add = Math.min(n, room);
      p.ammo[id] = (p.ammo[id] ?? 0) + add;
      got.push(add < n ? `+${add} ${this.ammoName(w)} (fuldt)` : `+${n} ${this.ammoName(w)}`);
      this.audio.play('ammo_pickup');
      any = true;
    }
    if (any) {
      this.hud.toast(got.join('  '), 1400);
      return true;
    }
    return false;
  }

  // ======================================================================
  // per frame
  // ======================================================================

  /** Sounds for animal tells (windup commit, paws, roars...). Hurt/flee/death voices come from the AudioDirector. */
  private animalCue(a: Animal, cue: AnimalCue) {
    const pos = a.hitCenter();
    const id = a.def.id;
    const boss = (a as unknown as { isBoss?: boolean }).isBoss;
    const rate = boss ? 0.85 : 1;
    const attack: Record<string, string> = { ulv: 'wolf_attack', raev: 'fox_bark', bjorn: 'bear_growl', vildsvin: 'boar_squeal', elg: 'moose_grunt', kronhjort: 'deer_roar' };
    const growl: Record<string, string> = { ulv: 'wolf_growl', raev: 'wolf_growl', bjorn: 'bear_growl', vildsvin: 'boar_grunt', elg: 'moose_grunt', kronhjort: 'deer_roar' };
    let snd: string | undefined;
    if (cue === 'commit') snd = attack[id];
    else if (cue === 'growl') snd = growl[id];
    else if (cue === 'snort') snd = 'boar_grunt';
    else if (cue === 'paw' || cue === 'slam') snd = 'boss_charge';
    else if (cue === 'howl') snd = boss ? 'boss_wolf_howl' : 'wolf_howl';
    else if (cue === 'roar') snd = boss ? (id === 'ulv' ? 'boss_wolf_snarl' : id === 'elg' ? 'boss_moose_bellow' : 'boss_bear_roar') : id === 'bjorn' ? 'bear_roar' : growl[id];
    else if (cue === 'flap') snd = 'bird_flush';
    else if (cue === 'yelp') snd = 'wolf_hurt';
    else if (cue === 'stun') snd = 'hit_wood';
    else if (cue === 'throw') snd = 'throw_heavy';
    if (snd) this.audio.play(snd, { pos, rate });
    if (cue === 'slam' || cue === 'stun') this.rig.kick(0.4);
  }

  private animalCtx(): AnimalContext {
    const p = this.player;
    const diff = DIFFICULTY[settings.difficulty];
    const ctx = {
      player: p,
      wind: this.wind,
      world: this.world,
      scentMul: this.stats.scentMul,
      time: this.time,
      diff,
      blood: this.blood,
      camera: this.camera,
      onAlert: () => this.tip('wind'),
      onStrike: (a: Animal) => {
        const dmg = a.strikeDamage || a.def.damage * diff.animalDamage;
        const name = (a as unknown as { bossName?: string }).bossName ?? a.def.name;
        if (p.damage(dmg, name, a.pos)) {
          const big = ['charge', 'crush', 'stomp', 'rock'].includes(a.strikeKind);
          this.rig.kick(big ? 0.7 : 0.45, p.hitDir);
          if (a.strikeKind === 'hamstring') p.stagger = Math.max(p.stagger, 1.2);
          this.hud.hurtFrom(this.screenAngleTo(a.pos));
        }
      },
      onCue: (a: Animal, cue: AnimalCue) => this.animalCue(a, cue),
      canEngage: (a: Animal) => {
        let n = 0;
        for (const o of this.animals) if (o !== a && !o.dead && HOSTILE.has(o.state) && !(o as unknown as { isBoss?: boolean }).isBoss) n++;
        return n < diff.maxAttackers;
      },
      onImpact: (kind: string, strength: number) => {
        if (kind === 'hit') return;
        if (kind === 'kill') this.hitStop = Math.max(this.hitStop, 0.07);
        else if (kind === 'heavy') this.hitStop = Math.max(this.hitStop, 0.045);
        else if (kind === 'thud') this.rig.kick(Math.min(0.25, 0.02 * strength));
        else if (kind === 'roar') {
          this.rig.kick(0.6);
          this.audio.duck(0.4, 1.5);
        }
      },
    };
    return ctx as unknown as AnimalContext;
  }

  private updatePlaying(dt: number) {
    const p = this.player;
    this.save.stats.playSeconds += dt;
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
    if (this.input.was('KeyM')) {
      settings.muted = !settings.muted;
      writeSave(this.save);
      this.hud.toast(settings.muted ? 'Lyd slået fra (M)' : 'Lyd slået til', 1200);
    }
    if (this.input.was('KeyE') && !this.interact()) this.hud.toast('Intet at samle op her', 900);

    const ctx = this.animalCtx();
    for (const a of this.animals) {
      a.update(dt, ctx);
      if (!a.dead && HUNTING.has(a.state)) {
        this.run.hunted = true;
        if (a.def.role === 'predator' && a.pos.distanceTo(p.pos) < 25) this.tip('roll');
      }
    }
    for (let i = this.animals.length - 1; i >= 0; i--) {
      if (this.animals[i].removable) {
        this.scene.remove(this.animals[i].group);
        this.animals[i].dispose();
        this.animals.splice(i, 1);
      }
    }
    this.blood?.update(dt);
    this.projectiles.update(dt, this.animals);
    this.traps.update(dt, this.animals);
    this.drops.update(this.time, this.player.pos);
    this.bursts.update(dt);

    if (p.dead) {
      this.die();
      return;
    }
    const dCave = Math.hypot(p.pos.x - this.world.caveEntrance.x, p.pos.z - this.world.caveEntrance.z);
    const guarded = this.boss && !this.boss.dead;
    if (this.boss) {
      const show = this.boss.awake && !this.boss.dead;
      this.hud.setBoss(show ? this.boss.bossName : null, this.boss.hp / this.boss.maxHp);
      this.director.setBossEngaged(show);
    }
    if (dCave < 25 && !guarded) this.tip('cave');
    if (dCave < 5 && !guarded) {
      this.arrive();
      return;
    }
    if (dCave < 9 && guarded) {
      this.hud.toast(`${this.boss!.bossName} vogter hulen. Nedlæg den først.`, 1500);
      const away = this.v1.set(p.pos.x - this.world.caveEntrance.x, 0, p.pos.z - this.world.caveEntrance.z).normalize();
      p.pos.addScaledVector(away, 0.15);
    }
    if (this.drops.near(p.pos, 6).length) this.tip('pickup');
    if (p.hp < this.stats.maxHealth * 0.6 && p.carried.meat > 0) this.tip('eat');
    this.updateHud(dCave, dt);
  }

  /** Shows a help text once per save. `big` help is shown as a panel, the rest as a toast. */
  private tip(id: string, big = true) {
    if (this.save.seenHelp[id] || this.helpShown.has(id) || !HELP[id]) return;
    this.helpShown.add(id);
    this.save.seenHelp[id] = true;
    writeSave(this.save);
    if (big) this.hud.tip(HELP[id]);
    else this.hud.toast(HELP[id], 3500);
  }

  /** Angle (deg, clockwise from straight ahead on screen) towards a world point. */
  private screenAngleTo(pos: THREE.Vector3): number {
    const h = this.rig.heading;
    const dx = pos.x - this.player.pos.x;
    const dz = pos.z - this.player.pos.z;
    const right = dx * -Math.cos(h) + dz * Math.sin(h);
    const fwd = dx * Math.sin(h) + dz * Math.cos(h);
    return (Math.atan2(right, fwd) * 180) / Math.PI;
  }

  private windText(): string {
    // the route runs towards -z: wind blowing towards -z carries your scent ahead of you
    const ahead = -this.wind.dz;
    if (ahead > 0.5) return 'Medvind: din fært driver fremad. Pas på!';
    if (ahead < -0.5) return 'Modvind: din fært driver bagud.';
    return 'Sidevind: din fært driver til siden.';
  }

  private updateHud(dCave: number, dt: number) {
    const p = this.player;
    const heading = this.rig.heading;
    const wx = this.wind.dx;
    const wz = this.wind.dz;
    const xs = wx * -Math.cos(heading) + wz * Math.sin(heading);
    const ys = wx * Math.sin(heading) + wz * Math.cos(heading);
    const ahead = -wz; // towards the cave
    const nearLoot = this.drops.near(p.pos, PLAYER.pickupRange).length > 0 || this.projectiles.nearestStuck(p.pos, PLAYER.pickupRange);
    let hint = '';
    if (nearLoot) hint = '[E] Saml op';
    else if (p.carried.meat > 0 && p.hp < this.stats.maxHealth * 0.6) hint = '[E] Spis kød';
    else if (this.traps.nearTrap(p.pos, PLAYER.pickupRange)) hint = '[E] Tag fælden op';
    // predators hunting you from outside the screen
    const threats: number[] = [];
    for (const a of this.animals) {
      if (a.dead || !HUNTING.has(a.state) || a.pos.distanceTo(p.pos) > 45) continue;
      const ang = this.screenAngleTo(a.pos);
      if (Math.abs(ang) > 38) threats.push(ang);
    }
    const w = weaponById(p.weaponId);
    const owned = this.ownedWeapons();
    const spread = this.currentSpread();
    this.hud.update(
      {
        hp: p.hp,
        maxHp: this.stats.maxHealth,
        stamina: p.stamina,
        maxStamina: this.stats.maxStamina,
        exhausted: (p as unknown as { exhausted?: boolean }).exhausted ?? p.stamina < 5,
        crossSize: Math.round(Math.min(90, Math.max(24, 18 + spread * 560))),
        drawP: p.drawing ? p.drawP : 0,
        weaponName: w.name,
        ammoText: w.ammo > 0 ? `${p.ammo[w.id] ?? 0} ${this.ammoName(w)}` : '',
        slots: FAMILIES.map((f, i) => {
          const inFam = owned.filter((o) => o.family === i + 1);
          const active = w.family === i + 1;
          return { key: f.key, name: active ? w.name : inFam[0]?.name ?? '', active, locked: inFam.length === 0, count: inFam.length };
        }),
        meat: p.carried.meat,
        shards: p.carried.shards,
        trophies: p.carried.trophies,
        windDeg: (Math.atan2(xs, ys) * 180) / Math.PI,
        windLabel: ahead > 0.5 ? 'Din fært driver fremad' : ahead < -0.5 ? 'Din fært driver bagud' : 'Din fært driver til siden',
        windDanger: ahead > 0.5 ? 2 : ahead > -0.5 ? 1 : 0,
        noise: p.noise,
        progress: 1 - dCave / this.level.length,
        distLeft: dCave,
        level: this.level.n,
        hint,
        aiming: p.aiming,
        hurt: p.hurtFlash,
        threats,
      },
      dt,
    );
  }

  private loop() {
    const now = performance.now();
    const raw = (now - this.last) / 1000;
    const dt = Math.min(0.05, raw);
    this.last = now;
    this.trackFps(raw);
    this.step(dt);
    requestAnimationFrame(() => this.loop());
  }

  /**
   * FPS readout and automatic quality: after 3 s of play, if the average stays under 45 fps for 4 s,
   * step the quality down one level (never below low). Only in a real browser (tests run in software rendering).
   */
  private trackFps(raw: number) {
    if (raw <= 0) return;
    raw = Math.min(raw, 1);
    this.frameTimes.push(raw);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const fps = 1 / avg;
    this.fpsT -= raw;
    if (this.fpsT <= 0) {
      this.fpsT = 0.5;
      const worst = Math.max(...this.frameTimes);
      this.hud.fps(settings.showFps ? `${fps.toFixed(0)} fps · ${(avg * 1000).toFixed(1)} ms (værst ${(worst * 1000).toFixed(0)}) · ${settings.quality} · ${this.renderer.info.render.calls} kald` : null);
    }
    if (!settings.autoQuality || !this.requireLock || this.state !== 'playing' || !this.input.locked) {
      this.autoT = 0;
      return;
    }
    this.autoT += raw;
    if (this.autoT > 7 && fps < 45) {
      const i = QUALITY_ORDER.indexOf(settings.quality);
      if (i > 0) {
        settings.quality = QUALITY_ORDER[i - 1];
        writeSave(this.save);
        this.setupPost();
        this.hud.toast(`Grafik sat ned til "${{ low: 'Lav', medium: 'Mellem', high: 'Høj', ultra: 'Ultra' }[settings.quality]}" (${fps.toFixed(0)} fps)`, 2500);
      }
      this.autoT = 3;
      this.frameTimes.length = 0;
    }
  }

  /** One frame. Public so tests can step the game deterministically. */
  step(dt: number, render = true) {
    this.time += dt;
    // hit-stop and slow motion scale the game; camera, HUD and audio use real time
    let gdt = dt * this.timeScale;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      gdt = dt * 0.05;
    }
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) this.timeScale = 1;
    }
    const frozen = this.state === 'playing' && this.requireLock && !this.input.locked;
    if (this.state === 'playing' && !frozen) {
      this.updatePlaying(gdt);
      if (this.state === 'playing') {
        this.rig.update(dt, this.player.pos, this.aimBlend(), this.world);
        this.director.update(dt, this.player, this.animals, this.wind, this.world, this.stats.maxHealth);
      }
    } else if (this.state === 'playing') {
      this.rig.update(dt, this.player.pos, this.aimBlend(), this.world);
    } else if (this.state === 'dead') {
      this.deathTimer -= dt;
      const rig = this.rig as unknown as { deathCam?: (dt: number, target: THREE.Vector3) => void };
      // the hunter's fall is physics in Player.update; input is ignored once he is dead
      this.player.update(gdt, this.input, this.rig, this.world);
      if (rig.deathCam) rig.deathCam(dt, this.player.pos);
      else this.rig.update(dt, this.player.pos, 0, this.world);
      this.wind.update(gdt);
      const ctx = this.animalCtx() as unknown as { scentMul: number; onStrike: () => void };
      ctx.scentMul = 0;
      ctx.onStrike = () => {};
      for (const a of this.animals) a.update(gdt, ctx as unknown as AnimalContext);
      this.blood?.update(gdt);
      this.bursts.update(gdt);
      if (this.deathTimer <= 0 && !document.querySelector('.scr.on')) {
        this.hud.show(false);
        this.screens.death(`Dræbt af ${this.player.killedBy}.`, DIFFICULTY[settings.difficulty].keepCarried > 0, {
          retry: () => this.startLevel(this.level.n),
          hub: () => this.showHub(),
        });
      }
    } else if (this.state === 'arriving') {
      // walk into the cave mouth while the screen fades, then the hub
      this.arriveT += dt;
      const p = this.player;
      const target = this.world.caveEntrance;
      this.v1.set(target.x - p.pos.x, 0, target.z - 2 - p.pos.z);
      if (this.v1.length() > 0.3) {
        this.v1.normalize();
        p.pos.addScaledVector(this.v1, 2.2 * dt);
        p.heading = Math.atan2(this.v1.x, this.v1.z);
      }
      p.pos.y = this.world.height(p.pos.x, p.pos.z);
      p.group.position.copy(p.pos);
      p.group.rotation.y = p.heading;
      this.rig.update(dt, p.pos, 0, this.world);
      this.hud.fade(Math.min(1, this.arriveT / 1.4));
      if (this.arriveT > 1.6) {
        this.hud.fade(0);
        this.complete();
      }
    } else if (this.state === 'paused') {
      // frozen
    } else {
      // menu / hub / ending backdrop: orbit slowly around the start or the cave
      this.wind.update(dt);
      const atCave = this.state !== 'menu';
      const focus = atCave ? this.world.caveEntrance : this.world.spawn;
      const a = this.time * 0.06;
      const r = atCave ? 16 : 12;
      this.camera.position.set(focus.x + Math.sin(a) * r, focus.y + 4.5, focus.z + Math.cos(a) * r + (atCave ? 5 : 0));
      this.camera.lookAt(focus.x, focus.y + (atCave ? 3 : 2), focus.z);
      if (this.camera.fov !== 60) {
        this.camera.fov = 60;
        this.camera.updateProjectionMatrix();
      }
    }
    const focus = this.state === 'playing' || this.state === 'dead' || this.state === 'paused' || this.state === 'arriving' ? this.player.pos : this.camera.position;
    this.world.update(dt, focus, this.camera, this.time, this.player.heading);
    this.drift.update(dt, this.wind, this.camera.position, this.time);
    this.fireflies?.update(dt, focus, this.time, this.world.height(focus.x, focus.z));
    this.world.setWind(this.wind.dx, this.wind.dz, this.wind.strength);
    this.audio.update(dt, this.camera);
    this.gradePass.uniforms.hurt.value = this.state === 'playing' ? Math.max(0, 1 - this.player.hp / this.stats.maxHealth - 0.5) : 0;
    if (render) {
      this.renderer.info.reset();
      this.composer.render(dt);
    }
    this.input.endFrame();
  }
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
