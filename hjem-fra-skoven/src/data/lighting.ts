/**
 * Light from afternoon (0) through golden hour, dusk and blue hour to night (1).
 * Each level has a `tod` between 0 and 1; values are blended between the keyframes.
 * Colours are sRGB hex (three converts them to linear). Values were tuned with the composer chain
 * (bloom, grade, ACES tone mapping in OutputPass) in place.
 */
export interface Lighting {
  sunElevation: number; // degrees
  sunAzimuth: number; // radians; -0.55 = ahead-left of the trail (sun), 2.4 = behind-right (moon)
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fogColor: number;
  fogDensity: number;
  skyTop: number;
  skyHorizon: number;
  exposure: number;
  /** 0 = sun, 1 = moon (disc look, star visibility). */
  moon: number;
  // colour grade suggestion for the lead's grade pass
  gradeR: number;
  gradeG: number;
  gradeB: number;
  gradeSat: number;
  gradeVignette: number;
  /** Small blue black lift so night blacks are not crushed. */
  gradeLift: number;
}

const KEYS: { at: number; l: Lighting }[] = [
  {
    at: 0, // late summer afternoon
    l: {
      sunElevation: 32, sunAzimuth: -0.55, sunColor: 0xffe2b0, sunIntensity: 3.1,
      hemiSky: 0x9fbfe0, hemiGround: 0x4a3f2a, hemiIntensity: 0.8,
      fogColor: 0xc4cbbd, fogDensity: 0.009, skyTop: 0x4f86c6, skyHorizon: 0xe6dcc4, exposure: 1.0, moon: 0,
      gradeR: 1.03, gradeG: 1.0, gradeB: 0.95, gradeSat: 1.05, gradeVignette: 0.36, gradeLift: 0,
    },
  },
  {
    at: 0.3, // golden hour
    l: {
      sunElevation: 15, sunAzimuth: -0.55, sunColor: 0xffc27a, sunIntensity: 2.7,
      hemiSky: 0x9aa8c0, hemiGround: 0x4a3a26, hemiIntensity: 0.65,
      fogColor: 0xd0b08c, fogDensity: 0.012, skyTop: 0x4a6fa8, skyHorizon: 0xf2c48a, exposure: 1.0, moon: 0,
      gradeR: 1.06, gradeG: 0.99, gradeB: 0.92, gradeSat: 1.08, gradeVignette: 0.4, gradeLift: 0,
    },
  },
  {
    at: 0.5, // dusk: the sun is on the horizon
    l: {
      sunElevation: 2, sunAzimuth: -0.55, sunColor: 0xff7a3c, sunIntensity: 1.5,
      hemiSky: 0x6a6a90, hemiGround: 0x2a2420, hemiIntensity: 0.5,
      fogColor: 0x7e6464, fogDensity: 0.018, skyTop: 0x2a3560, skyHorizon: 0xf09a60, exposure: 1.05, moon: 0,
      gradeR: 1.08, gradeG: 0.97, gradeB: 0.9, gradeSat: 1.1, gradeVignette: 0.44, gradeLift: 0,
    },
  },
  {
    at: 0.68, // blue hour: the moon has risen behind-right
    l: {
      sunElevation: 12, sunAzimuth: 2.4, sunColor: 0x7088c8, sunIntensity: 0.45,
      hemiSky: 0x3a4a78, hemiGround: 0x14161a, hemiIntensity: 0.42,
      fogColor: 0x1e2a40, fogDensity: 0.025, skyTop: 0x0d1430, skyHorizon: 0x34466c, exposure: 1.1, moon: 1,
      gradeR: 0.92, gradeG: 0.97, gradeB: 1.08, gradeSat: 0.85, gradeVignette: 0.5, gradeLift: 0.003,
    },
  },
  {
    at: 1, // night
    l: {
      sunElevation: 40, sunAzimuth: 2.4, sunColor: 0x9db4ff, sunIntensity: 0.7,
      hemiSky: 0x2a3a60, hemiGround: 0x0a0d0c, hemiIntensity: 0.35,
      fogColor: 0x0c1420, fogDensity: 0.03, skyTop: 0x02040c, skyHorizon: 0x101a2c, exposure: 1.15, moon: 1,
      gradeR: 0.85, gradeG: 0.95, gradeB: 1.12, gradeSat: 0.75, gradeVignette: 0.55, gradeLift: 0.004,
    },
  },
];

const COLOR_KEYS: (keyof Lighting)[] = ['sunColor', 'hemiSky', 'hemiGround', 'fogColor', 'skyTop', 'skyHorizon'];

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixColor = (a: number, b: number, t: number) => {
  const r = mix((a >> 16) & 255, (b >> 16) & 255, t);
  const g = mix((a >> 8) & 255, (b >> 8) & 255, t);
  const bl = mix(a & 255, b & 255, t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};

export function lightingAt(tod: number): Lighting {
  const t = Math.min(1, Math.max(0, tod));
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].at) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const k = Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at)));
  const out = {} as Lighting;
  (Object.keys(a.l) as (keyof Lighting)[]).forEach((key) => {
    out[key] = COLOR_KEYS.includes(key) ? mixColor(a.l[key], b.l[key], k) : mix(a.l[key], b.l[key], k);
  });
  // between dusk and blue hour the key light swaps from the setting sun to the rising moon:
  // jump the azimuth once the sun has faded instead of sweeping it across the sky
  if (a.l.sunAzimuth !== b.l.sunAzimuth) {
    out.sunAzimuth = k < 0.5 ? a.l.sunAzimuth : b.l.sunAzimuth;
    out.sunIntensity *= 0.35 + 0.65 * Math.abs(2 * k - 1);
    out.sunColor = k < 0.5 ? mixColor(a.l.sunColor, 0x8a7a90, k * 2) : mixColor(0x8a7a90, b.l.sunColor, k * 2 - 1);
  }
  return out;
}

/** 0 by dusk, 1 at full night. Drives the lantern, fireflies, stars and how dark the vegetation is painted. */
export function nightAt(tod: number): number {
  const t = Math.min(1, Math.max(0, (tod - 0.5) / 0.4));
  return t * t * (3 - 2 * t);
}
