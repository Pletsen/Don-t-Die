import { WIND } from '../data/balance';

/** Wind that slowly swings around the level's base direction. Scent travels along it. */
export class Wind {
  angle: number;
  strength: number;
  /** Unit vector (x, z) the wind blows TOWARDS. */
  dx = 0;
  dz = 0;
  private t = 0;
  private phase: number;

  constructor(private baseAngle: number, private baseStrength: number) {
    this.angle = baseAngle;
    this.strength = baseStrength;
    this.phase = baseAngle * 3.1;
    this.update(0);
  }

  update(dt: number) {
    this.t += dt;
    const s = WIND.swingSpeed;
    this.angle =
      this.baseAngle +
      WIND.swingAngle * (0.7 * Math.sin(this.t * s + this.phase) + 0.3 * Math.sin(this.t * s * 2.7 + 1.3));
    this.strength = this.baseStrength * (0.85 + 0.25 * Math.sin(this.t * 0.09 + this.phase * 2));
    this.dx = Math.sin(this.angle);
    this.dz = Math.cos(this.angle);
  }

  label(): string {
    return this.strength < 0.7 ? 'svag vind' : this.strength < 1.1 ? 'jævn vind' : 'hård vind';
  }
}
