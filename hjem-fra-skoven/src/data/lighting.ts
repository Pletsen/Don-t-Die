/**
 * Light from afternoon (0) through dusk (0.5) to night (1).
 * Each level has a `tod` between 0 and 1; values are blended between the keyframes.
 */
export interface Lighting {
  sunElevation: number; // degrees
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
}

const KEYS: { at: number; l: Lighting }[] = [
  {
    at: 0,
    l: { sunElevation: 34, sunColor: 0xffdca8, sunIntensity: 2.9, hemiSky: 0xa9c6e6, hemiGround: 0x3b4a2c, hemiIntensity: 1.0, fogColor: 0xb4c3c2, fogDensity: 0.011, skyTop: 0x5f90c9, skyHorizon: 0xd2dccf, exposure: 1.0 },
  },
  {
    at: 0.5,
    l: { sunElevation: 7, sunColor: 0xff8f4f, sunIntensity: 1.9, hemiSky: 0x7a7392, hemiGround: 0x2d2b26, hemiIntensity: 0.6, fogColor: 0x7a6563, fogDensity: 0.02, skyTop: 0x2c3558, skyHorizon: 0xe58d57, exposure: 0.95 },
  },
  {
    at: 1,
    l: { sunElevation: 38, sunColor: 0x8da6ff, sunIntensity: 0.55, hemiSky: 0x24304f, hemiGround: 0x0b0f0c, hemiIntensity: 0.42, fogColor: 0x0b1017, fogDensity: 0.036, skyTop: 0x03050c, skyHorizon: 0x0e1626, exposure: 1.0 },
  },
];

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixColor = (a: number, b: number, t: number) => {
  const r = mix((a >> 16) & 255, (b >> 16) & 255, t);
  const g = mix((a >> 8) & 255, (b >> 8) & 255, t);
  const bl = mix(a & 255, b & 255, t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};

export function lightingAt(tod: number): Lighting {
  const t = Math.min(1, Math.max(0, tod));
  const i = t < 0.5 ? 0 : 1;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const k = (t - a.at) / (b.at - a.at);
  const out = {} as Lighting;
  (Object.keys(a.l) as (keyof Lighting)[]).forEach((key) => {
    const isColor = key === 'sunColor' || key === 'hemiSky' || key === 'hemiGround' || key === 'fogColor' || key === 'skyTop' || key === 'skyHorizon';
    out[key] = isColor ? mixColor(a.l[key], b.l[key], k) : mix(a.l[key], b.l[key], k);
  });
  return out;
}
