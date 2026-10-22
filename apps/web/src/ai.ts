import { aiAim, DEFAULT_TREBUCHET, DEFAULT_CASTLE, type TrebuchetConfig, type CastleConfig, type ProjectileConfig, type Rapier, mulberry32, hashString } from '@siege/sim';
import type { Opponent, AimContext } from './opponent';

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

const NAMES = ['Baron Vexley', 'Dame Orla', 'The Mad Earl', 'Sir Hollowell', 'Countess Ravn', 'Grimsby the Younger', 'Lord Pike'];

/** An AI lord whose kit scales with the player's rating. */
export function makeAiOpponent(R: Rapier, playerRating: number, seedStr: string): Opponent {
  const rnd = mulberry32(hashString(seedStr));
  const tier = Math.max(0, Math.min(1, (playerRating - 900) / 900)); // 0 at 900, 1 at 1800
  const trebuchet: TrebuchetConfig = {
    ...DEFAULT_TREBUCHET,
    counterweightMass: Math.round(DEFAULT_TREBUCHET.counterweightMass * (1 + tier * 1.6)),
    longArm: DEFAULT_TREBUCHET.longArm + tier * 2,
    pivotHeight: DEFAULT_TREBUCHET.pivotHeight + tier * 1.5,
    beamMaterial: tier > 0.6 ? 'ash' : tier > 0.3 ? 'oak' : 'pine',
    wheels: tier > 0.5,
  };
  const projectile: ProjectileConfig = tier > 0.7 ? { kind: 'iron', mass: 40 } : { kind: 'stone', mass: 25 + Math.round(tier * 30) };
  const castle: CastleConfig = {
    ...DEFAULT_CASTLE,
    material: tier > 0.65 ? 'granite' : tier > 0.3 ? 'limestone' : 'timber',
    wallHeight: DEFAULT_CASTLE.wallHeight + Math.round(tier * 3),
    towerHeight: DEFAULT_CASTLE.towerHeight + Math.round(tier * 4),
    keepHeight: DEFAULT_CASTLE.keepHeight + Math.round(tier * 2),
    towers: tier > 0.8 ? 3 : 2,
  };
  const skill = 0.25 + tier * 0.65;
  const name = NAMES[Math.floor(rnd() * NAMES.length)];
  return {
    name,
    rating: Math.round(playerRating + (rnd() - 0.5) * 120),
    castle, trebuchet, projectile,
    aim: (ctx: AimContext) => aiAim(ctx.R, { trebuchet, projectile, wind: ctx.wind }, ctx.castle, ctx.wind, { skill, seed: hashString(seedStr + ':' + ctx.round), yieldFn: yieldFrame }),
  };
}
