import * as THREE from 'three';
import type { Animal } from '../animals/Animal';
import type { Player } from '../player/Player';
import type { World } from '../world/World';
import type { Wind } from '../world/Wind';
import type { Audio } from './Audio';

/** Which sound each species makes in each situation (manifest ids in public/sfx/manifest.json). */
const VOICE: Record<string, { alert?: string; chase?: string; windup?: string; hurt?: string; flee?: string; idle?: string }> = {
  hare: { flee: 'animal_flee', hurt: 'hare_squeal' },
  fasan: { flee: 'bird_flush', hurt: 'animal_hurt' },
  raadyr: { alert: 'animal_alert', flee: 'animal_flee', hurt: 'animal_hurt' },
  hvidhjort: { alert: 'animal_alert', flee: 'animal_flee', hurt: 'animal_hurt', idle: 'deer_call' },
  raev: { alert: 'fox_bark', chase: 'fox_bark', windup: 'wolf_growl', hurt: 'animal_hurt' },
  vildsvin: { alert: 'boar_grunt', chase: 'boar_squeal', windup: 'boar_grunt', hurt: 'boar_squeal', idle: 'boar_grunt' },
  elg: { alert: 'moose_grunt', chase: 'moose_bellow', windup: 'moose_grunt', hurt: 'moose_grunt', idle: 'moose_grunt' },
  kronhjort: { alert: 'animal_alert', chase: 'deer_roar', windup: 'deer_roar', hurt: 'animal_hurt', idle: 'deer_call' },
  ulv: { alert: 'wolf_growl', chase: 'wolf_howl', windup: 'wolf_attack', hurt: 'wolf_hurt', idle: 'wolf_howl' },
  bjorn: { alert: 'bear_growl', chase: 'bear_roar', windup: 'bear_growl', hurt: 'bear_growl' },
};

/** Pitch per species, so the fox bark can stand in higher and big animals sound bigger. */
const RATE: Record<string, number> = { raev: 1.15, hvidhjort: 0.9, elg: 0.85, bjorn: 0.95, hare: 1.2 };

const HOSTILE = new Set(['chase', 'windup', 'strike', 'recover']);

interface Track {
  state: string;
  hp: number;
  idleT: number;
}

/**
 * Decides what is heard: ambience by time of day, wind, the campfire at the cave, music that tenses up when something
 * hunts you, heartbeat and breath, footsteps, and animal voices (picked from their state changes).
 */
export class AudioDirector {
  private tracked = new Map<Animal, Track>();
  private stepDist = 0;
  private oneShotT = 8;
  private tod = 0;
  private boss = false;
  private tension = 0;
  private bossEngaged = false;
  private v = new THREE.Vector3();
  private lastPos = new THREE.Vector3();

  constructor(private audio: Audio) {}

  startLevel(tod: number, cavePos: THREE.Vector3, bossLevel: boolean) {
    this.tracked.clear();
    this.tod = tod;
    this.boss = bossLevel;
    this.tension = 0;
    this.bossEngaged = false;
    this.audio.stopAllLoops();
    const day = 1 - smooth(0.3, 0.55, tod);
    const dusk = Math.max(0, 1 - Math.abs(tod - 0.5) / 0.22);
    const night = smooth(0.5, 0.75, tod);
    this.audio.loop('amb_day', 'amb_day', day, undefined, 2);
    this.audio.loop('amb_dusk', 'amb_dusk', dusk, undefined, 2);
    this.audio.loop('amb_night', 'amb_night', night, undefined, 2);
    this.audio.loop('fire', 'amb_fire', 1, cavePos.clone().setY(cavePos.y + 1), 1);
    this.audio.loop('music_explore', 'music_explore', 1, undefined, 3);
  }

  /** Menus: just the ambience and calm music. */
  menu(tod: number) {
    this.tod = tod;
    this.audio.stopAllLoops(['amb_day', 'amb_dusk', 'amb_night', 'music_explore']);
    this.audio.loop('amb_day', 'amb_day', 1 - smooth(0.3, 0.55, tod), undefined, 2);
    this.audio.loop('amb_night', 'amb_night', smooth(0.5, 0.75, tod), undefined, 2);
    this.audio.loop('music_explore', 'music_explore', 0.8, undefined, 3);
  }

  setBossEngaged(on: boolean) {
    this.bossEngaged = on;
  }

  update(dt: number, player: Player, animals: Animal[], wind: Wind, world: World, maxHp: number) {
    const a = this.audio;
    a.loop('wind', 'amb_wind', Math.min(1, 0.25 + wind.strength * 0.55));

    // music: explore -> tension when something hunts you -> boss
    let hunted = false;
    for (const an of animals) {
      if (an.dead) continue;
      if (HOSTILE.has(an.state) && an.pos.distanceTo(player.pos) < 70) hunted = true;
    }
    this.tension += ((hunted ? 1 : 0) - this.tension) * Math.min(1, dt * (hunted ? 1.5 : 0.25));
    const bossOn = this.boss && this.bossEngaged;
    a.loop('music_explore', 'music_explore', bossOn ? 0 : 1 - this.tension, undefined, 2);
    a.loop('music_tension', 'music_tension', bossOn ? 0 : this.tension, undefined, 1.5);
    a.loop('music_boss', 'music_boss', bossOn ? 1 : 0, undefined, 2);

    // body: heartbeat and breathing
    const hpR = player.hp / maxHp;
    a.loop('heart_slow', 'heartbeat_slow', !player.dead && hpR < 0.35 && hpR >= 0.2 ? 1 : 0);
    a.loop('heart_fast', 'heartbeat_fast', !player.dead && hpR < 0.2 ? 1 : 0);
    a.loop('breath', 'breath_sprint', !player.dead && (player.stamina < 30 || player.sprinting) ? Math.min(1, (60 - player.stamina) / 40) : 0, undefined, 1);

    // footsteps from distance walked
    const moved = Math.hypot(player.pos.x - this.lastPos.x, player.pos.z - this.lastPos.z);
    this.lastPos.copy(player.pos);
    if (player.grounded && player.moving && !player.rolling && !player.dead && moved < 2) {
      this.stepDist += moved;
      const stride = player.sprinting ? 1.05 : 0.75;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        const offTrail = Math.abs(player.pos.x - world.trailX(player.pos.z)) > 3;
        a.play(offTrail ? 'step_leaves' : 'step_grass', { volume: player.sprinting ? 1.25 : player.drawing || player.aiming ? 0.55 : 0.9 });
      }
    }

    // animal voices on state changes
    for (const an of animals) {
      let t = this.tracked.get(an);
      if (!t) {
        t = { state: an.state, hp: an.hp, idleT: 4 + Math.random() * 20 };
        this.tracked.set(an, t);
      }
      const voice = VOICE[an.def.id] ?? {};
      const pos = an.hitCenter();
      const rate = RATE[an.def.id] ?? 1;
      const dist = pos.distanceTo(player.pos);
      if (an.hp < t.hp - 0.5 && !an.dead) a.play(voice.hurt ?? 'animal_hurt', { pos, rate });
      if (an.state !== t.state && dist < 90) {
        if (an.state === 'dead') a.play('animal_death_fall', { pos, rate: an.def.radius > 1 ? 0.8 : 1.1 });
        else if (an.state === 'alert' && voice.alert) a.play(voice.alert, { pos, rate, volume: 0.8 });
        else if (an.state === 'chase' && t.state !== 'recover' && voice.chase) a.play(voice.chase, { pos, rate });
        else if (an.state === 'windup' && voice.windup) a.play(voice.windup, { pos, rate });
        else if (an.state === 'flee' && voice.flee) a.play(voice.flee, { pos, rate });
      }
      if (an.state === 'idle' && voice.idle && !an.dead) {
        t.idleT -= dt;
        if (t.idleT <= 0) {
          t.idleT = 15 + Math.random() * 30;
          const nightOnly = voice.idle === 'wolf_howl' && this.tod < 0.4;
          if (!nightOnly && dist < 120) a.play(voice.idle, { pos, rate, volume: 0.8 });
        }
      }
      t.state = an.state;
      t.hp = an.hp;
    }

    // ambient one-shots placed around the hunter
    this.oneShotT -= dt;
    if (this.oneShotT <= 0) {
      this.oneShotT = 10 + Math.random() * 18;
      const ang = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 30;
      this.v.set(player.pos.x + Math.cos(ang) * r, player.pos.y + 6, player.pos.z + Math.sin(ang) * r);
      if (this.tod > 0.55) a.play(Math.random() < 0.7 ? 'owl_hoot' : 'wolf_pack_distant', { pos: this.v });
      else if (wind.strength > 1.05 && Math.random() < 0.5) a.play('tree_creak', { pos: this.v });
      else a.play('raven_call', { pos: this.v });
    }
  }
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
