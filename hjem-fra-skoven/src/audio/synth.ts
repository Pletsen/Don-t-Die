/**
 * Procedural sounds for the few events without a free recording (roe deer bark, pheasant call) and a soft fallback
 * blip if a file fails to load. Rendered once into AudioBuffers (no OfflineAudioContext needed).
 */
export type Recipe = (t: number, rnd: () => number) => number;

function env(t: number, a: number, d: number): number {
  if (t < a) return t / a;
  return Math.exp(-(t - a) / d);
}

/** One-pole low/high pass helpers keep the noise from sounding like static. */
function filtered(rate: number, length: number, gen: (t: number, white: number) => number, lp = 0.2): Float32Array {
  const out = new Float32Array(length);
  let y = 0;
  let s = 1234567;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const x = gen(t, rnd());
    y += (x - y) * lp;
    out[i] = y;
  }
  return out;
}

/** Roe deer alarm bark: a hoarse, short "bö" around 600-900 Hz, twice. */
function deerBark(rate: number): Float32Array {
  const dur = 0.95;
  return filtered(rate, Math.floor(rate * dur), (t, w) => {
    const bark = (t0: number) => {
      const u = t - t0;
      if (u < 0 || u > 0.32) return 0;
      const f = 780 - 420 * u;
      const tone = Math.sin(2 * Math.PI * f * u) * 0.55 + Math.sin(2 * Math.PI * f * 2.02 * u) * 0.25;
      return (tone + w * 0.55) * env(u, 0.015, 0.09);
    };
    return bark(0) + bark(0.55) * 0.85;
  }, 0.35);
}

/** Pheasant crow: two harsh, rising "kork-kok" squawks. */
function pheasantCall(rate: number): Float32Array {
  const dur = 0.6;
  return filtered(rate, Math.floor(rate * dur), (t, w) => {
    const squawk = (t0: number, f0: number) => {
      const u = t - t0;
      if (u < 0 || u > 0.16) return 0;
      const f = f0 + 900 * u;
      const ph = 2 * Math.PI * f * u;
      const saw = 2 * ((ph / (2 * Math.PI)) % 1) - 1;
      return (saw * 0.6 + w * 0.35) * env(u, 0.008, 0.05);
    };
    return squawk(0, 1050) + squawk(0.22, 1200) * 0.9;
  }, 0.5);
}

/** Soft blip used when a recording is missing. */
function fallback(rate: number): Float32Array {
  const len = Math.floor(rate * 0.12);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / rate;
    out[i] = Math.sin(2 * Math.PI * (420 - 600 * t) * t) * env(t, 0.004, 0.035) * 0.5;
  }
  return out;
}

export const SYNTH: Record<string, { make: (rate: number) => Float32Array; volume: number; category: 'sfx'; spatial: boolean; refDistance: number; pitchVar: number }> = {
  deer_bark: { make: deerBark, volume: 0.75, category: 'sfx', spatial: true, refDistance: 25, pitchVar: 0.06 },
  pheasant_call: { make: pheasantCall, volume: 0.65, category: 'sfx', spatial: true, refDistance: 20, pitchVar: 0.05 },
  fallback: { make: fallback, volume: 0.3, category: 'sfx', spatial: false, refDistance: 6, pitchVar: 0.1 },
};
