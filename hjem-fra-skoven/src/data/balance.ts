/** Player and bow numbers. Everything here can be tweaked without touching the logic. */
export const PLAYER = {
  maxHealth: 100,
  maxStamina: 100,
  walkSpeed: 4.2,
  sprintSpeed: 7.4,
  aimSpeed: 2.4,
  sprintDrain: 20, // stamina per second
  staminaRegen: 17, // per second
  staminaRegenDelay: 0.9, // seconds after sprinting/rolling
  exhaustedUntil: 22, // after hitting 0 you cannot sprint until stamina is back above this
  rollCost: 24,
  jumpSpeed: 5.6, // apex about 0.65 m
  gravity: 24,
  fallGravityMul: 1.7, // heavier on the way down: a snappy fall
  coyoteTime: 0.1, // seconds after leaving the ground a jump still works
  jumpBuffer: 0.12, // seconds a jump press is remembered before landing
  jumpCost: 6,
  drawSpeed: 3.0, // walking speed while drawing a bow or winding up a throw
  accel: 14, // ground acceleration rate (1/s, exponential): 0 → walk in about 0.2 s
  decel: 10, // ground stopping rate
  airAccel: 2.5, // air control: the jump carries its momentum
  rollTime: 0.52,
  rollSpeed: 10,
  rollInvulnerable: 0.38,
  rollFovPunch: 4, // degrees
  radius: 0.45,
  knockbackBase: 4, // m/s pushed away from an animal that hits you
  knockbackPerDamage: 0.06,
  knockbackMax: 7,
  knockbackDecay: 10, // 1/s
  staggerTime: 0.22, // seconds of no drawing and half speed after a hit
  strideBase: 1.2, // metres per gait cycle at standstill...
  stridePerSpeed: 0.25, // ...plus this much per m/s
  eatHeal: 26, // health per piece of meat
  startingMeatPack: 2, // meat brought from the cave (a copy, the bank is only changed when you get home)
  pickupRange: 3.0,
};

/** Metres of noise that animals can hear. Shots are very loud. */
export const NOISE = {
  walk: 6,
  sprint: 19,
  roll: 12,
  shot: 34,
  shotDecay: 1.6, // seconds
};

export const CAMERA = {
  sensitivity: 0.0022, // radians per pixel, times settings.sensitivity
  hip: { distance: 3.4, shoulder: 0.7, height: 1.65, fov: 68 }, // hip fov is replaced by settings.fov
  aim: { distance: 1.9, shoulder: 0.75, height: 1.7, fov: 48 }, // aim fov scales with settings.fov
  aimRate: 10, // blend speed hip <-> aim (1/s)
  pitchMin: -0.55,
  pitchMax: 0.85,
  /** Looking up pulls the camera in and up so the hunter does not fill the screen. */
  pitchFraming: { dist: 0.35, height: 0.25, shoulder: 0.15 },
  collisionPad: 0.3, // metres added to tree/rock colliders
  minDistance: 0.45,
  easeOut: 4, // how fast the camera moves back out after a collision (1/s)
  sprintFov: 5,
  sprintDistance: 0.25,
  pivotSpring: { ground: 14, air: 5 }, // ω of the vertical follow
  shake: { decay: 1.5, yaw: 0.04, pitch: 0.04, roll: 0.055, pos: 0.04, freq: 22, push: 0.35 },
  death: { height: 2.4, distance: 3.8, orbit: 0.22 }, // low enough to stay under the tree crowns
};

/** The wind swings slowly. Strength 1 means a clear effect, 1.5 is a gale. */
export const WIND = {
  swingAngle: 0.7, // radians the wind direction wanders
  swingSpeed: 0.045,
};
