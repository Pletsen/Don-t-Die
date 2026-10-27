/**
 * Stride-matched quadruped gaits. Each leg follows a phase cycle: a stance part where the foot is planted and the hip
 * swings back exactly as fast as the body moves (no sliding), and a swing part where the knee folds and the leg is
 * brought forward again. Phase offsets per gait are in leg order [FR, FL, BR, BL].
 */
export type GaitName = 'walk' | 'trot' | 'gallop' | 'bound' | 'pace';

export interface Gait {
  offsets: [number, number, number, number];
  duty: number; // share of the cycle a foot is on the ground
  stride: number; // metres per cycle, as a multiple of hip height
  bob: number; // body bob (m, times hip height)
  pitch: number; // spine rock (rad)
  flex: number; // knee fold in swing (rad)
}

export const GAITS: Record<GaitName, Gait> = {
  walk: { offsets: [0, 0.5, 0.75, 0.25], duty: 0.65, stride: 1.25, bob: 0.018, pitch: 0.015, flex: 0.75 },
  pace: { offsets: [0, 0.5, 0, 0.5], duty: 0.6, stride: 1.4, bob: 0.03, pitch: 0.01, flex: 0.7 }, // heavy amble (bear, moose)
  trot: { offsets: [0, 0.5, 0.5, 0], duty: 0.5, stride: 2.0, bob: 0.03, pitch: 0.02, flex: 0.95 },
  gallop: { offsets: [0.6, 0.5, 0.1, 0], duty: 0.36, stride: 3.3, bob: 0.06, pitch: 0.09, flex: 1.15 },
  bound: { offsets: [0.55, 0.5, 0, 0.05], duty: 0.3, stride: 3.8, bob: 0.1, pitch: 0.16, flex: 1.0 },
};

/** Smoothly blended gait parameters, mutated in place (no allocations per frame). */
export class GaitBlend {
  offsets = [0, 0.5, 0.75, 0.25];
  duty = 0.65;
  stride = 1.25;
  bob = 0.02;
  pitch = 0.015;
  flex = 0.75;
  name: GaitName = 'walk';

  blend(target: Gait, k: number) {
    for (let i = 0; i < 4; i++) {
      // offsets wrap around 1: blend the short way
      let d = target.offsets[i] - this.offsets[i];
      d -= Math.round(d);
      this.offsets[i] = (this.offsets[i] + d * k + 1) % 1;
    }
    this.duty += (target.duty - this.duty) * k;
    this.stride += (target.stride - this.stride) * k;
    this.bob += (target.bob - this.bob) * k;
    this.pitch += (target.pitch - this.pitch) * k;
    this.flex += (target.flex - this.flex) * k;
  }
}

export interface LegPose {
  hip: number; // hip pitch (rad), positive swings the foot forward
  knee: number; // knee fold (0..1 of flex)
  stance: boolean;
}

/**
 * Pose of one leg at phase `p` (0..1). `reach` is half the stance sweep in metres, `L` the leg length.
 * Stance: foot planted, hip angle = atan(x / L) with x moving linearly from +reach to -reach.
 */
export function legPose(p: number, duty: number, reach: number, L: number, out: LegPose): LegPose {
  if (p < duty) {
    const u = p / duty;
    out.hip = Math.atan2(reach * (1 - 2 * u), L);
    out.knee = 0;
    out.stance = true;
  } else {
    const u = (p - duty) / (1 - duty);
    const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
    const a = Math.atan2(reach, L);
    out.hip = -a + 2 * a * e;
    out.knee = Math.sin(Math.PI * Math.min(1, u * 1.1));
    out.stance = false;
  }
  return out;
}
