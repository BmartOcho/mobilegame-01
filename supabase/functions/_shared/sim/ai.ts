import type { AimInput, CastleState, ShotInput, WindSpec } from './types.ts';
import { runShot, type Rapier } from './sim.ts';
import { mulberry32 } from './rng.ts';

export interface AiAimOptions {
  /** 0..1, controls aiming noise. */
  skill: number;
  seed: number;
  /** Called between candidate sims so a UI can stay responsive. */
  yieldFn?: () => Promise<void>;
}

/**
 * Sweep release angles with impact-only sims, pick the best, add
 * skill-dependent noise. Deterministic for a given seed, so the client can
 * show the shot immediately and the server can verify it.
 */
export async function aiAim(R: Rapier, base: Omit<ShotInput, 'aim'>, castle: CastleState, wind: WindSpec, opts: AiAimOptions): Promise<AimInput> {
  const rnd = mulberry32(opts.seed);
  const targetX = castle.originX + 4 + rnd() * 6;
  const noise = (rnd() + rnd() + rnd() - 1.5) * 1.6;
  const candidates = [24, 32, 40, 50];
  const score = (a: number) => {
    const r = runShot(R, { ...base, aim: { releaseAngleDeg: a }, wind }, castle, { stopAtImpact: true });
    return (r.impact?.target === 'castle' ? 50 : 0) - Math.abs(r.range - targetX);
  };
  let best = { angle: 40, score: -Infinity };
  for (const a of candidates) {
    const s = score(a);
    if (s > best.score) best = { angle: a, score: s };
    if (opts.yieldFn) await opts.yieldFn();
  }
  const refine = best.angle + (best.angle <= 24 ? -4 : 4) * (rnd() < 0.5 ? 1 : -1);
  const s = score(refine);
  if (s > best.score) best = { angle: refine, score: s };
  const sd = 9 - 8 * Math.max(0, Math.min(1, opts.skill));
  return { releaseAngleDeg: Math.max(10, Math.min(110, best.angle + noise * sd)) };
}
