import { Graphics } from 'pixi.js';
import type { Camera } from './camera';
import { rotRect, line, circle, PALETTE, shade } from './draw';
import type { TrebuchetConfig, ProjectileConfig, RenderState, StaticPose } from '@siege/sim';
import { cockedPose, projectileRadius } from '@siege/sim';

export interface TrebGeo {
  pivotHeight: number; longArm: number; shortArm: number; beamThickness: number;
  cwHalf: number; hangerLength: number; projectileRadius: number; wheels: boolean; wheelRadius: number;
}

export interface TrebPose {
  frame: { x: number; y: number; angle: number };
  beam: { x: number; y: number; angle: number };
  cw: { x: number; y: number; angle: number };
  wheels: { x: number; y: number; angle: number }[];
  proj: { x: number; y: number; angle: number; released: boolean };
}

export function poseFromStatic(T: TrebuchetConfig, P: ProjectileConfig, cockAngleDeg?: number): { geo: TrebGeo; pose: TrebPose } {
  const s: StaticPose = cockedPose(T, P, cockAngleDeg);
  const halfSpan = T.pivotHeight * 0.55;
  const geo: TrebGeo = {
    pivotHeight: T.pivotHeight, longArm: T.longArm, shortArm: T.shortArm, beamThickness: T.beamThickness,
    cwHalf: s.cw.half, hangerLength: T.hangerLength, projectileRadius: projectileRadius(P), wheels: T.wheels, wheelRadius: s.wheelRadius,
  };
  const pose: TrebPose = {
    frame: { x: 0, y: 0, angle: 0 },
    beam: { x: 0, y: T.pivotHeight, angle: s.beamAngle },
    cw: { x: s.cw.x, y: s.cw.y, angle: s.cw.angle },
    wheels: T.wheels ? [-1, 1].map((sx) => ({ x: sx * halfSpan * 0.8, y: s.wheelRadius, angle: 0 })) : [],
    proj: { x: s.projectile.x, y: s.projectile.y, angle: 0, released: false },
  };
  return { geo, pose };
}

export function poseFromRender(r: RenderState): TrebPose {
  return {
    frame: r.frame, beam: r.beam, cw: r.counterweight, wheels: r.wheels,
    proj: { x: r.projectile.x, y: r.projectile.y, angle: r.projectile.angle, released: r.projectile.released },
  };
}

function rot(x: number, y: number, a: number): [number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

export function drawTrebuchet(g: Graphics, cam: Camera, geo: TrebGeo, pose: TrebPose, T: TrebuchetConfig, P: ProjectileConfig, opts: { showSling?: boolean } = {}) {
  const beamCol = PALETTE[T.beamMaterial];
  const frameCol = PALETTE[T.frameMaterial];
  const halfSpan = geo.pivotHeight * 0.55;
  const fx = pose.frame.x, fy = pose.frame.y, fa = pose.frame.angle;
  const sillY = geo.wheels ? geo.wheelRadius + 0.15 : 0.15;
  const W = (lx: number, ly: number): [number, number] => { const [rx, ry] = rot(lx, ly, fa); return [fx + rx, fy + ry]; };

  // Frame: sill, two A-legs each side (drawn as one pair in side view), cross brace.
  const [sx, sy] = W(0, sillY);
  rotRect(g, cam, sx, sy, halfSpan * 2, 0.3, fa, shade(frameCol, 0.85));
  const legW = 0.28;
  for (const side of [-1, 1]) {
    const [bx, by] = W(side * halfSpan * 0.9, sillY);
    const [px, py] = W(side * 0.22, geo.pivotHeight);
    const len = Math.hypot(px - bx, py - by);
    const ang = Math.atan2(py - by, px - bx);
    rotRect(g, cam, (bx + px) / 2, (by + py) / 2, len, legW, ang, frameCol, { color: shade(frameCol, 0.6) });
  }
  const [c1x, c1y] = W(-halfSpan * 0.45, geo.pivotHeight * 0.5);
  const [c2x, c2y] = W(halfSpan * 0.45, geo.pivotHeight * 0.5);
  rotRect(g, cam, (c1x + c2x) / 2, (c1y + c2y) / 2, Math.hypot(c2x - c1x, c2y - c1y), 0.2, fa, shade(frameCol, 0.75));

  // Wheels
  for (const w of pose.wheels) {
    circle(g, cam, w.x, w.y, geo.wheelRadius, shade(frameCol, 0.7), PALETTE.iron_dark);
    for (let i = 0; i < 4; i++) {
      const a = w.angle + (i * Math.PI) / 4;
      line(g, cam, w.x - Math.cos(a) * geo.wheelRadius, w.y - Math.sin(a) * geo.wheelRadius, w.x + Math.cos(a) * geo.wheelRadius, w.y + Math.sin(a) * geo.wheelRadius, PALETTE.iron_dark, 2);
    }
  }

  // Beam
  const bx = pose.beam.x, by = pose.beam.y, ba = pose.beam.angle;
  const mid = (geo.longArm - geo.shortArm) / 2;
  const [mx, my] = rot(mid, 0, ba);
  rotRect(g, cam, bx + mx, by + my, geo.longArm + geo.shortArm, geo.beamThickness, ba, beamCol, { color: shade(beamCol, 0.55) });
  // Iron banding + finger at the tip
  const [tx, ty] = rot(geo.longArm, 0, ba);
  const tipX = bx + tx, tipY = by + ty;
  const [fgx, fgy] = rot(0.35, geo.beamThickness * 0.9, ba);
  line(g, cam, tipX, tipY, tipX + fgx, tipY + fgy, PALETTE.iron_dark, 3);

  // Counterweight + hanger
  const [sex, sey] = rot(-geo.shortArm, 0, ba);
  const shortEndX = bx + sex, shortEndY = by + sey;
  if (geo.hangerLength > 0) {
    const [hx, hy] = rot(0, geo.cwHalf, pose.cw.angle);
    line(g, cam, shortEndX, shortEndY, pose.cw.x + hx, pose.cw.y + hy, PALETTE.iron_dark, 4);
    line(g, cam, shortEndX, shortEndY, pose.cw.x + hx, pose.cw.y + hy, shade(frameCol, 0.9), 2);
  }
  rotRect(g, cam, pose.cw.x, pose.cw.y, geo.cwHalf * 2, geo.cwHalf * 2, pose.cw.angle, PALETTE.cw, { color: PALETTE.iron_dark, width: 2 });
  const [b1x, b1y] = rot(0, geo.cwHalf * 0.35, pose.cw.angle);
  line(g, cam, pose.cw.x - b1x * 0 - geo.cwHalf * Math.cos(pose.cw.angle), pose.cw.y + b1y - geo.cwHalf * Math.sin(pose.cw.angle), pose.cw.x + geo.cwHalf * Math.cos(pose.cw.angle), pose.cw.y + b1y + geo.cwHalf * Math.sin(pose.cw.angle), PALETTE.iron_dark, 2);

  // Axle
  circle(g, cam, bx, by, Math.max(0.18, geo.beamThickness * 0.5), PALETTE.iron_dark, 0x111111);

  // Sling + projectile
  if (!pose.proj.released && opts.showSling !== false) {
    line(g, cam, tipX, tipY, pose.proj.x, pose.proj.y, PALETTE.rope, 2);
  }
  const pc = PALETTE[P.kind];
  circle(g, cam, pose.proj.x, pose.proj.y, geo.projectileRadius, pc, shade(pc, 0.5), 3.5);
}

/** Castle blocks from a render state. */
export function drawBlocks(g: Graphics, cam: Camera, blocks: RenderState['blocks'], kinds: Map<number, string>) {
  for (const b of blocks) {
    const kind = kinds.get(b.id);
    let col: number = PALETTE[b.material];
    if (kind === 'banner') {
      // Pole + pennant
      rotRect(g, cam, b.x, b.y, b.w, b.h, b.angle, 0x4a3b2a);
      const [px, py] = rot(0.55, b.h * 0.3, b.angle);
      rotRect(g, cam, b.x + px, b.y + py, 1.0, 0.45, b.angle, 0xc8553d);
      continue;
    }
    if (kind === 'keep') col = shade(col, 1.08);
    const f = 0.65 + 0.35 * Math.max(0, Math.min(1, b.hp));
    rotRect(g, cam, b.x, b.y, b.w, b.h, b.angle, shade(col, f), { color: shade(col, 0.5) });
    if (b.hp < 0.6) {
      const [cx1, cy1] = rot(-b.w * 0.2, -b.h * 0.3, b.angle);
      const [cx2, cy2] = rot(b.w * 0.15, b.h * 0.35, b.angle);
      line(g, cam, b.x + cx1, b.y + cy1, b.x + cx2, b.y + cy2, shade(col, 0.35), 1.5);
    }
  }
}
