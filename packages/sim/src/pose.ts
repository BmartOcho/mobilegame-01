import type { TrebuchetConfig, ProjectileConfig } from './types.ts';
import { projectileRadius, clamp } from './catalog.ts';

const COUNTERWEIGHT_DENSITY = 2200;

export interface StaticPose {
  cockAngle: number;
  beamAngle: number;
  pivot: { x: number; y: number };
  tip: { x: number; y: number };
  shortEnd: { x: number; y: number };
  cw: { x: number; y: number; angle: number; half: number };
  projectile: { x: number; y: number; r: number };
  wheelRadius: number;
}

/**
 * The cocked (pre-fire) pose, computed without the physics engine so the
 * build screen can draw the machine instantly. Mirrors ShotSim.buildTrebuchet.
 */
export function cockedPose(T: TrebuchetConfig, P: ProjectileConfig, cockAngleDeg?: number): StaticPose {
  const La = T.longArm, Ls = T.shortArm, h = T.pivotHeight;
  let sinMax = (h - 0.6) / La;
  sinMax = clamp(sinMax, Math.sin((10 * Math.PI) / 180), Math.sin((75 * Math.PI) / 180));
  let theta = Math.asin(sinMax);
  if (cockAngleDeg !== undefined) theta = clamp((cockAngleDeg * Math.PI) / 180, (10 * Math.PI) / 180, theta);
  const phi0 = Math.PI + theta;
  const ux = Math.cos(phi0), uy = Math.sin(phi0);
  const tip = { x: La * ux, y: h + La * uy };
  const shortEnd = { x: -Ls * ux, y: h - Ls * uy };
  const half = Math.cbrt(T.counterweightMass / COUNTERWEIGHT_DENSITY) / 2;
  let cw;
  if (T.hangerLength > 0) cw = { x: shortEnd.x, y: shortEnd.y - T.hangerLength - half, angle: 0, half };
  else { const nx = -Math.sin(phi0), ny = Math.cos(phi0); cw = { x: shortEnd.x + half * nx, y: shortEnd.y + half * ny, angle: phi0, half }; }
  const r = projectileRadius(P);
  const drop = tip.y - r;
  let px: number, py: number;
  if (T.slingLength > drop) { px = tip.x + Math.sqrt(T.slingLength * T.slingLength - drop * drop); py = r; }
  else { px = tip.x; py = Math.max(r, tip.y - T.slingLength); }
  return { cockAngle: theta, beamAngle: phi0, pivot: { x: 0, y: h }, tip, shortEnd, cw, projectile: { x: px, y: py, r }, wheelRadius: 0.55 };
}
