import * as THREE from 'three';
import { PLAYER, NOISE } from '../data/balance';
import { weaponById } from '../data/weapons';
import type { Input } from '../game/Input';
import type { CameraRig } from './CameraRig';
import type { World } from '../world/World';
import type { Bank } from '../game/save';
import { HeldRig } from './Held';

export interface PlayerStats {
  maxHealth: number;
  maxStamina: number;
  scentMul: number;
}

export class Player {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  heading = Math.PI;
  hp: number;
  stamina: number;
  /** Ammo left per weapon id (melee weapons have none). */
  ammo: Record<string, number> = {};
  weaponId = 'jagtbue';
  carried: Bank;
  startMeat: number;
  aiming = false;
  /** True while the use button is held on a bow, throwing weapon, sling, trap or bait. */
  drawing = false;
  /** 0..1 how far the draw has come. */
  drawP = 0;
  drawT = 0;
  moving = false;
  sprinting = false;
  dead = false;
  killedBy = '';
  /** Metres at which animals can hear the hunter right now. */
  noise = 0;
  invulnerable = 0;
  hurtFlash = 0;
  /** Reload time left after the last release or swing. */
  shotCooldown = 0;
  /** Height above the ground while jumping. */
  air = 0;
  grounded = true;
  readonly held: HeldRig;
  private vy = 0;
  private burst = 0;
  private exhausted = false;
  private regenDelay = 0;
  private rollT = 0;
  private rollDir = new THREE.Vector3();
  private walkPhase = 0;
  private legs: THREE.Group[] = [];
  private body = new THREE.Group();
  private cape!: THREE.Mesh;
  private weaponShown = '';
  onRoll: () => void = () => {};
  onHurt: (amount: number) => void = () => {};
  onJump: () => void = () => {};
  onLand: () => void = () => {};

  constructor(readonly stats: PlayerStats, meatPack: number) {
    this.hp = stats.maxHealth;
    this.stamina = stats.maxStamina;
    this.carried = { meat: meatPack, shards: 0, trophies: 0 };
    this.startMeat = meatPack;
    this.held = this.buildModel();
    this.group.add(this.body);
  }

  get rolling(): boolean {
    return this.rollT > 0;
  }
  get isInvulnerable(): boolean {
    return this.invulnerable > 0;
  }
  /** Where shots leave the hunter. */
  get chest(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z);
  }

  private buildModel(): HeldRig {
    const mat = (c: number, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      this.body.add(mesh);
      return mesh;
    };
    const cloth = clothTexture();
    const cloak = new THREE.MeshStandardMaterial({ color: 0x7a8f4a, roughness: 0.95, map: cloth });
    const cloakDark = new THREE.MeshStandardMaterial({ color: 0x55663a, roughness: 0.95, map: cloth });
    const leather = mat(0x5a3d26);
    const leatherDark = mat(0x3a281a);
    const skin = mat(0xc89a78, 0.7);
    const trousers = new THREE.MeshStandardMaterial({ color: 0x75654a, roughness: 0.95, map: cloth });
    const hatMat = mat(0x6a4a2a);
    const fur = mat(0xb9a98a, 1);

    // torso and coat
    const torso = add(new THREE.CapsuleGeometry(0.22, 0.34, 6, 10), cloak, 0, 1.2, 0);
    torso.scale.set(1.15, 1, 0.78);
    const skirt = add(new THREE.CylinderGeometry(0.27, 0.35, 0.34, 10, 1, true), cloakDark, 0, 0.84, 0);
    skirt.scale.z = 0.8;
    (skirt.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    add(new THREE.BoxGeometry(0.6, 0.09, 0.36), leather, 0, 0.98, 0); // belt
    add(new THREE.BoxGeometry(0.1, 0.1, 0.02), mat(0xc8a24a, 0.4), 0, 0.98, 0.19); // buckle
    add(new THREE.BoxGeometry(0.14, 0.16, 0.1), leatherDark, 0.3, 0.96, 0.1); // pouch
    add(new THREE.BoxGeometry(0.14, 0.16, 0.1), leatherDark, -0.28, 0.96, -0.12);
    // cape flapping behind
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.75, 1, 4), new THREE.MeshStandardMaterial({ color: 0x4d5e33, roughness: 1, side: THREE.DoubleSide, map: cloth }));
    cape.position.set(0, 1.12, -0.19);
    cape.castShadow = true;
    this.body.add(cape);
    this.cape = cape;
    // scarf and collar
    const scarf = add(new THREE.TorusGeometry(0.17, 0.06, 6, 12), mat(0x9a3a2a), 0, 1.52, 0.0);
    scarf.rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.2, 0.24, 0.12, 10, 1, true), fur, 0, 1.55, 0).material = Object.assign(fur.clone(), { side: THREE.DoubleSide });
    // head, beard, hat
    add(new THREE.SphereGeometry(0.15, 14, 12), skin, 0, 1.72, 0.01);
    add(new THREE.SphereGeometry(0.155, 10, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), mat(0x4a3220), 0, 1.71, 0.02); // beard
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.018, 6, 5), mat(0x15110d), s * 0.055, 1.745, 0.135);
    add(new THREE.SphereGeometry(0.025, 6, 5), skin, 0, 1.715, 0.15); // nose
    const hat = add(new THREE.ConeGeometry(0.2, 0.26, 12), hatMat, 0, 1.97, 0);
    hat.rotation.z = 0.08;
    add(new THREE.CylinderGeometry(0.27, 0.27, 0.025, 14), hatMat, 0, 1.83, 0);
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 12), mat(0x3a281a), 0, 1.86, 0); // hat band
    const feather = add(new THREE.ConeGeometry(0.015, 0.2, 4), mat(0xb83a2a), 0.12, 1.98, -0.02);
    feather.rotation.z = -0.5;
    // quiver on the back
    const quiver = add(new THREE.CylinderGeometry(0.06, 0.05, 0.56, 8), leather, -0.14, 1.3, -0.26);
    quiver.rotation.z = 0.22;
    for (let i = 0; i < 4; i++) {
      const sh = add(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 4), mat(0xd8c8a0), -0.2 + i * 0.03, 1.62 - i * 0.005, -0.26);
      sh.rotation.z = 0.22;
      add(new THREE.BoxGeometry(0.004, 0.04, 0.05), mat(0xb23a2e), -0.2 + i * 0.03, 1.72, -0.26);
    }
    // sheath knife on the belt
    add(new THREE.BoxGeometry(0.04, 0.2, 0.05), leatherDark, 0.2, 0.9, 0.2).rotation.x = 0.1;
    // legs with boots
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * 0.13, 0.9, 0);
      const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.5, 4, 8), trousers);
      l.position.y = -0.38;
      l.castShadow = true;
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.26), leatherDark);
      boot.position.set(0, -0.68, 0.04);
      boot.castShadow = true;
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8), fur);
      cuff.position.y = -0.55;
      leg.add(l, boot, cuff);
      this.body.add(leg);
      this.legs.push(leg);
    }
    const rig = new HeldRig(cloak, skin, mat(0x4a3220));
    this.body.add(rig.group);
    rig.setWeapon(weaponById(this.weaponId));
    return rig;
  }

  update(dt: number, input: Input, cam: CameraRig, world: World) {
    if (this.dead) return;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.burst = Math.max(0, this.burst - dt * (NOISE.shot / NOISE.shotDecay));

    const iz = (input.held('KeyW') ? 1 : 0) - (input.held('KeyS') ? 1 : 0);
    const ix = (input.held('KeyD') ? 1 : 0) - (input.held('KeyA') ? 1 : 0);
    const dir = new THREE.Vector3();
    if (ix || iz) {
      dir.set(Math.sin(cam.heading), 0, Math.cos(cam.heading)).multiplyScalar(iz);
      dir.addScaledVector(new THREE.Vector3(-Math.cos(cam.heading), 0, Math.sin(cam.heading)), ix);
      dir.normalize();
    }
    this.moving = dir.lengthSq() > 0;
    this.aiming = input.right && !this.rolling;

    // dodge roll: Ctrl (C works too, since browsers keep Ctrl+W for themselves)
    const rollKey = input.was('ControlLeft') || input.was('ControlRight') || input.was('KeyC');
    if (rollKey && !this.rolling && this.stamina >= PLAYER.rollCost && this.grounded) {
      this.stamina -= PLAYER.rollCost;
      this.regenDelay = PLAYER.staminaRegenDelay;
      this.rollT = PLAYER.rollTime;
      this.invulnerable = Math.max(this.invulnerable, PLAYER.rollInvulnerable);
      this.rollDir.copy(this.moving ? dir : new THREE.Vector3(Math.sin(cam.heading), 0, Math.cos(cam.heading)));
      this.heading = Math.atan2(this.rollDir.x, this.rollDir.z);
      this.drawing = false;
      this.onRoll();
    }

    // jump
    if (input.was('Space') && this.grounded && !this.rolling && this.stamina >= PLAYER.jumpCost) {
      this.vy = PLAYER.jumpSpeed;
      this.grounded = false;
      this.stamina -= PLAYER.jumpCost;
      this.regenDelay = Math.max(this.regenDelay, 0.5);
      this.onJump();
    }
    if (!this.grounded) {
      this.vy -= PLAYER.gravity * dt;
      this.air += this.vy * dt;
      if (this.air <= 0) {
        this.air = 0;
        this.vy = 0;
        this.grounded = true;
        this.burst = Math.max(this.burst, 9);
        this.onLand();
      }
    }

    const wantsSprint = input.held('ShiftLeft') || input.held('ShiftRight');
    if (this.stamina <= 0) this.exhausted = true;
    if (this.stamina > PLAYER.exhaustedUntil) this.exhausted = false;
    this.sprinting = wantsSprint && this.moving && !this.exhausted && !this.aiming && !this.rolling && !this.drawing;

    let speed = 0;
    const move = new THREE.Vector3();
    if (this.rolling) {
      this.rollT -= dt;
      const k = Math.max(0, this.rollT / PLAYER.rollTime);
      speed = PLAYER.rollSpeed * (0.45 + 0.55 * k);
      move.copy(this.rollDir);
    } else if (this.moving) {
      speed = this.aiming ? PLAYER.aimSpeed : this.drawing ? PLAYER.drawSpeed : this.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      move.copy(dir);
    }
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - PLAYER.sprintDrain * dt);
      this.regenDelay = PLAYER.staminaRegenDelay;
    } else if (this.regenDelay > 0) {
      this.regenDelay -= dt;
    } else {
      this.stamina = Math.min(this.stats.maxStamina, this.stamina + PLAYER.staminaRegen * dt);
    }

    this.pos.addScaledVector(move, speed * dt);
    world.collide(this.pos, PLAYER.radius, this.air + 0.15);
    this.pos.y = world.height(this.pos.x, this.pos.z) + this.air;

    // facing: towards the aim when aiming, drawing or just after a shot, otherwise the way we walk
    if (!this.rolling) {
      let target = this.heading;
      if (this.aiming || this.drawing || this.shotCooldown > 0.25) target = cam.heading;
      else if (this.moving) target = Math.atan2(dir.x, dir.z);
      this.heading = lerpAngle(this.heading, target, Math.min(1, dt * (this.aiming || this.drawing ? 18 : 11)));
    }

    const base = this.rolling ? NOISE.roll : this.sprinting ? NOISE.sprint : this.moving ? NOISE.walk * (this.aiming || this.drawing ? 0.5 : 1) : 0;
    this.noise = Math.max(base, this.burst);

    this.animate(dt, speed);
  }

  /** Call when a shot, throw or swing makes noise. */
  fired(noise: number) {
    this.burst = Math.max(this.burst, noise);
  }

  private animate(dt: number, speed: number) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    this.walkPhase += dt * speed * 1.9;
    const swing = this.moving && !this.rolling && this.grounded ? Math.sin(this.walkPhase) * 0.8 : 0;
    if (this.grounded) {
      this.legs[0].rotation.x = swing;
      this.legs[1].rotation.x = -swing;
    } else {
      // legs tucked while airborne
      this.legs[0].rotation.x = -0.6;
      this.legs[1].rotation.x = 0.4;
    }
    if (this.weaponShown !== this.weaponId) {
      this.weaponShown = this.weaponId;
      this.held.setWeapon(weaponById(this.weaponId));
    }
    const w = weaponById(this.weaponId);
    this.held.update(dt, {
      drawing: this.drawing,
      drawP: this.drawP,
      aiming: this.aiming,
      walk: swing,
      sprinting: this.sprinting,
      rolling: this.rolling,
      cooldown: this.shotCooldown,
      ammo: w.ammo > 0 ? this.ammo[w.id] ?? 0 : null,
    });
    // cape flaps with speed
    const flap = Math.min(1, speed / 7);
    const pos = this.cape.geometry.attributes.position as THREE.BufferAttribute;
    const t = performance.now() / 1000;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const k = (0.375 - y) / 0.75; // 0 at the shoulders, 1 at the hem
      pos.setZ(i, -k * (0.05 + 0.3 * flap) + Math.sin(t * 9 + y * 6) * 0.03 * flap * k);
    }
    pos.needsUpdate = true;
    this.cape.geometry.computeVertexNormals();
    this.cape.rotation.x = 0.1 * flap;

    if (this.rolling) {
      const k = 1 - this.rollT / PLAYER.rollTime;
      this.body.rotation.x = k * Math.PI * 2;
      this.body.position.y = Math.sin(k * Math.PI) * 0.15 + 0.35;
      this.body.scale.setScalar(0.85);
      this.body.position.y -= 0.2 * Math.sin(k * Math.PI) * 0 ;
    } else {
      this.body.rotation.x = this.sprinting ? 0.2 : this.drawing ? 0.03 : 0;
      this.body.position.y = 0;
      this.body.scale.setScalar(1);
    }
  }

  damage(amount: number, by: string) {
    if (this.dead || this.isInvulnerable) return false;
    this.hp -= amount;
    this.invulnerable = 0.35;
    this.hurtFlash = 0.5;
    this.drawing = false;
    this.onHurt(amount);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.killedBy = by;
      this.body.rotation.x = -Math.PI / 2;
      this.body.position.y = 0.25;
    }
    return true;
  }

  heal(amount: number) {
    this.hp = Math.min(this.stats.maxHealth, this.hp + amount);
  }
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

let clothTex: THREE.CanvasTexture | null = null;
/** Woven cloth grain, shared by the hunter's clothes. */
function clothTexture(): THREE.CanvasTexture {
  if (clothTex) return clothTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ddd';
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 2) {
    for (let x = 0; x < 64; x += 2) {
      const v = 190 + ((x * 7 + y * 13) % 5) * 12 + (((x >> 1) + (y >> 1)) % 2) * 10;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 2, 2);
    }
  }
  clothTex = new THREE.CanvasTexture(c);
  clothTex.wrapS = clothTex.wrapT = THREE.RepeatWrapping;
  clothTex.repeat.set(3, 3);
  clothTex.colorSpace = THREE.SRGBColorSpace;
  return clothTex;
}
