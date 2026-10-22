import type { WindSpec } from './types.ts';
import { mulberry32 } from './rng.ts';

const REF_HEIGHT = 10;
const SHEAR_EXP = 0.14; // open terrain power-law exponent

interface Gust { amp: number; freq: number; phase: number }

/**
 * Deterministic wind field: logarithmic-ish shear profile (power law) plus a
 * sum of low-frequency sinusoids for gusts. Only Math.sin is used, which is
 * not bit-identical across engines, so wind is sampled on the client and
 * server with the same code *and* the server result is authoritative.
 */
export class WindField {
  private gusts: Gust[] = [];
  constructor(public spec: WindSpec) {
    const rnd = mulberry32(spec.seed);
    const n = 5;
    const scale = (0.6 + Math.abs(spec.base) * 0.25) * spec.gustiness;
    for (let i = 0; i < n; i++) {
      this.gusts.push({
        amp: scale * (0.3 + rnd() * 0.7) / (i + 1),
        freq: 0.05 + rnd() * 0.35 * (i + 1),
        phase: rnd() * Math.PI * 2,
      });
    }
  }

  /** Horizontal wind speed at height y (m) and time t (s), shooter frame. */
  at(y: number, t: number): number {
    const h = y < 0.5 ? 0.5 : y;
    const shear = Math.pow(h / REF_HEIGHT, SHEAR_EXP);
    let g = 0;
    for (const k of this.gusts) g += k.amp * Math.sin(2 * Math.PI * k.freq * t + k.phase);
    return (this.spec.base + g) * shear;
  }

  /** Mild vertical component from gusts (thermals), keeps flight 2D-interesting. */
  vertical(t: number): number {
    const g = this.gusts[0];
    return g ? 0.25 * g.amp * Math.sin(2 * Math.PI * g.freq * 0.7 * t + g.phase * 1.3) : 0;
  }
}
