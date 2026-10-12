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
  rollTime: 0.52,
  rollSpeed: 10,
  rollInvulnerable: 0.38,
  radius: 0.45,
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
  sensitivity: 0.0022,
  hip: { distance: 3.4, shoulder: 0.7, height: 1.65, fov: 68 },
  aim: { distance: 1.9, shoulder: 0.55, height: 1.6, fov: 48 },
};

/** The wind swings slowly. Strength 1 means a clear effect, 1.5 is a gale. */
export const WIND = {
  swingAngle: 0.7, // radians the wind direction wanders
  swingSpeed: 0.045,
};
