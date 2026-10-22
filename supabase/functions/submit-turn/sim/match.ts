import type { WindSpec } from './types.ts';
import { mulberry32, hashString } from './rng.ts';

export const MAX_ROUNDS = 4;
/** A castle at or below this integrity has fallen. */
export const LOSE_AT = 0.4;

/** Per-round wind, identical for both players (shooter frame) and on the server. */
export function matchWind(seed: string, round: number): WindSpec {
  const rnd = mulberry32(hashString(`${seed}:wind:${round}`));
  return { base: (rnd() * 2 - 1) * 9, gustiness: 0.2 + rnd() * 0.6, seed: hashString(`${seed}:gust:${round}`) };
}

export function matchOutcome(myIntegrity: number, theirIntegrity: number): boolean | null {
  if (myIntegrity > theirIntegrity + 0.005) return true;
  if (theirIntegrity > myIntegrity + 0.005) return false;
  return null;
}
