/**
 * Player settings, stored in the save and readable from anywhere.
 * `settings` is a live object: the settings menu mutates it, and systems read it each time they need a value.
 */
export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type Difficulty = 'let' | 'normal' | 'svaer';

export interface Settings {
  sensitivity: number; // multiplier on CAMERA.sensitivity, 0.3..3
  invertY: boolean;
  fov: number; // degrees, hip-fire field of view
  master: number; // 0..1
  sfx: number;
  music: number;
  ambience: number;
  quality: Quality;
  difficulty: Difficulty;
  blood: boolean; // false = dust instead of blood
  muted: boolean; // M toggles; remembered in the save
  autoQuality: boolean; // lower the quality by itself when the measured FPS is too low
  showFps: boolean;
}

export function defaultSettings(): Settings {
  return {
    sensitivity: 1,
    invertY: false,
    fov: 68,
    master: 0.8,
    sfx: 0.9,
    music: 0.6,
    ambience: 0.8,
    quality: new URLSearchParams(typeof location !== 'undefined' ? location.search : '').has('lite') ? 'low' : 'high',
    difficulty: 'normal',
    blood: true,
    muted: false,
    autoQuality: true,
    showFps: false,
  };
}

export const settings: Settings = defaultSettings();

/** What each quality level turns on. Systems read `qualityProfile()` when they build things. */
export interface QualityProfile {
  pixelRatioMax: number;
  msaa: number;
  bloom: boolean;
  shadowMap: number;
  vegetation: number; // multiplier on grass / ferns / bushes
  viewScale: number; // multiplier on view distance
}

/** Quality steps from lowest to highest, used by the automatic FPS-based selection. */
export const QUALITY_ORDER: Quality[] = ['low', 'medium', 'high', 'ultra'];

export function qualityProfile(q: Quality = settings.quality): QualityProfile {
  if (q === 'low') return { pixelRatioMax: 1, msaa: 0, bloom: false, shadowMap: 1024, vegetation: 0.35, viewScale: 0.75 };
  if (q === 'medium') return { pixelRatioMax: 1.25, msaa: 0, bloom: true, shadowMap: 2048, vegetation: 0.65, viewScale: 0.9 };
  if (q === 'high') return { pixelRatioMax: 1.5, msaa: 4, bloom: true, shadowMap: 2048, vegetation: 1, viewScale: 1 };
  return { pixelRatioMax: 2, msaa: 4, bloom: true, shadowMap: 4096, vegetation: 1.25, viewScale: 1.15 };
}
