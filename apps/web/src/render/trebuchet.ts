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
  /** 0..1 how much of the sling is attached/drawn (setup animation). */
  slingAlpha?: number;
}

export function poseFromStatic(T: TrebuchetConfig, P: ProjectileConfig, cockAngleDeg?: number): { geo: TrebGeo; pose: TrebPose; stat: StaticPose } {
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
  return { geo, pose, stat: s };
}

/** Pose for an arbitrary beam angle with the counterweight hanging naturally (setup animation). */
export function poseAtBeamAngle(geo: TrebGeo, phi: number, base: TrebPose): TrebPose {
  const h = geo.pivotHeight;
  const ux = Math.cos(phi), uy = Math.sin(phi);
  const sx = -geo.shortArm * ux, sy = h - geo.shortArm * uy;
  let cw;
  if (geo.hangerLength > 0) cw = { x: sx, y: sy - geo.hangerLength - geo.cwHalf, angle: 0 };
  else { const nx = -Math.sin(phi), ny = Math.cos(phi); cw = { x: sx + geo.cwHalf * nx, y: sy + geo.cwHalf * ny, angle: phi }; }
  return { ...base, beam: { x: 0, y: h, angle: phi }, cw };
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

function polyLocal(g: Graphics, cam: Camera, ox: number, oy: number, a: number, pts: [number, number][], fill: number, stroke?: { color: number; width?: number }) {
  const out: number[] = [];
  for (const [lx, ly] of pts) { const [rx, ry] = rot(lx, ly, a); out.push(cam.sx(ox + rx), cam.sy(oy + ry)); }
  g.poly(out).fill(fill);
  if (stroke) g.poly(out).stroke({ color: stroke.color, width: stroke.width ?? 1 });
}

function shadow(g: Graphics, cam: Camera, x: number, y: number, w: number) {
  const a = Math.max(0, 0.35 - y * 0.02);
  if (a <= 0) return;
  g.ellipse(cam.sx(x), cam.sy(0) + 2, Math.max(2, w * cam.zoom * (0.7 + y * 0.03)), Math.max(1.5, w * cam.zoom * 0.18)).fill({ color: 0x000000, alpha: a });
}

export function drawTrebuchet(g: Graphics, cam: Camera, geo: TrebGeo, pose: TrebPose, T: TrebuchetConfig, P: ProjectileConfig, opts: { showSling?: boolean } = {}) {
  const beamCol = PALETTE[T.beamMaterial];
  const frameCol = PALETTE[T.frameMaterial];
  const halfSpan = geo.pivotHeight * 0.55;
  const fx = pose.frame.x, fy = pose.frame.y, fa = pose.frame.angle;
  const sillY = geo.wheels ? geo.wheelRadius + 0.15 : 0.15;
  const W = (lx: number, ly: number): [number, number] => { const [rx, ry] = rot(lx, ly, fa); return [fx + rx, fy + ry]; };

  shadow(g, cam, pose.proj.x, pose.proj.y, geo.projectileRadius * 2.2);
  shadow(g, cam, pose.cw.x, pose.cw.y - geo.cwHalf, geo.cwHalf * 2.2);

  // Trough along the ground (the stone slides in it during the pull)
  const [tx0, ty0] = W(halfSpan * 0.4, 0.08);
  rotRect(g, cam, tx0, ty0, halfSpan * 2.6, 0.16, fa, shade(frameCol, 0.55));
  rotRect(g, cam, tx0, ty0 + 0.08, halfSpan * 2.6, 0.04, fa, shade(frameCol, 0.4));

  // Frame: sill, stakes, A-legs with inner braces, cross brace, winch drum
  const [sx, sy] = W(0, sillY);
  rotRect(g, cam, sx, sy, halfSpan * 2, 0.3, fa, shade(frameCol, 0.85), { color: shade(frameCol, 0.55) });
  if (!geo.wheels) for (const side of [-1, 1]) { const [kx, ky] = W(side * halfSpan * 0.95, -0.2); rotRect(g, cam, kx, ky, 0.12, 0.7, fa + 0.15 * side, PALETTE.iron_dark); }
  const legW = 0.28;
  for (const side of [-1, 1]) {
    const [bx, by] = W(side * halfSpan * 0.9, sillY);
    const [px, py] = W(side * 0.22, geo.pivotHeight);
    rotRect(g, cam, (bx + px) / 2, (by + py) / 2, Math.hypot(px - bx, py - by), legW, Math.atan2(py - by, px - bx), frameCol, { color: shade(frameCol, 0.6) });
    const [ix, iy] = W(side * halfSpan * 0.45, sillY);
    const [jx, jy] = W(side * 0.3, geo.pivotHeight * 0.55);
    rotRect(g, cam, (ix + jx) / 2, (iy + jy) / 2, Math.hypot(jx - ix, jy - iy), 0.16, Math.atan2(jy - iy, jx - ix), shade(frameCol, 0.8));
  }
  const [c1x, c1y] = W(-halfSpan * 0.45, geo.pivotHeight * 0.5);
  const [c2x, c2y] = W(halfSpan * 0.45, geo.pivotHeight * 0.5);
  rotRect(g, cam, (c1x + c2x) / 2, (c1y + c2y) / 2, Math.hypot(c2x - c1x, c2y - c1y), 0.2, fa, shade(frameCol, 0.75));
  const [wx, wy] = W(halfSpan * 0.6, sillY + 0.9);
  circle(g, cam, wx, wy, 0.32, shade(frameCol, 0.6), PALETTE.iron_dark);
  circle(g, cam, wx, wy, 0.1, PALETTE.iron_dark);

  for (const w of pose.wheels) {
    circle(g, cam, w.x, w.y, geo.wheelRadius, shade(frameCol, 0.7), PALETTE.iron_dark);
    for (let i = 0; i < 4; i++) {
      const a = w.angle + (i * Math.PI) / 4;
      line(g, cam, w.x - Math.cos(a) * geo.wheelRadius, w.y - Math.sin(a) * geo.wheelRadius, w.x + Math.cos(a) * geo.wheelRadius, w.y + Math.sin(a) * geo.wheelRadius, PALETTE.iron_dark, 2);
    }
    circle(g, cam, w.x, w.y, geo.wheelRadius * 0.22, PALETTE.iron_dark);
  }

  // Beam: tapered, grain lines, iron bands, finger
  const bx = pose.beam.x, by = pose.beam.y, ba = pose.beam.angle;
  const t = geo.beamThickness, La = geo.longArm, Ls = geo.shortArm;
  polyLocal(g, cam, bx, by, ba, [[-Ls, -t * 0.65], [0, -t * 0.55], [La, -t * 0.28], [La, t * 0.28], [0, t * 0.55], [-Ls, t * 0.65]], beamCol, { color: shade(beamCol, 0.5) });
  polyLocal(g, cam, bx, by, ba, [[-Ls * 0.9, -t * 0.2], [La * 0.95, -t * 0.08], [La * 0.95, -t * 0.02], [-Ls * 0.9, -t * 0.08]], shade(beamCol, 0.82));
  polyLocal(g, cam, bx, by, ba, [[-Ls * 0.9, t * 0.25], [La * 0.95, t * 0.1], [La * 0.95, t * 0.16], [-Ls * 0.9, t * 0.35]], shade(beamCol, 0.82));
  for (const lx of [-Ls * 0.8, -0.5, 0.5, La * 0.45, La * 0.92]) {
    const tt = lx < 0 ? t * 0.65 : t * (0.55 - 0.27 * (lx / La));
    polyLocal(g, cam, bx, by, ba, [[lx - 0.07, -tt - 0.02], [lx + 0.07, -tt - 0.02], [lx + 0.07, tt + 0.02], [lx - 0.07, tt + 0.02]], PALETTE.iron_dark);
  }
  const [tx, ty] = rot(La, 0, ba);
  const tipX = bx + tx, tipY = by + ty;
  const [fgx, fgy] = rot(0.45, t * 0.9, ba);
  line(g, cam, tipX, tipY, tipX + fgx, tipY + fgy, PALETTE.iron_dark, 3);

  // Counterweight + hanger
  const [sex, sey] = rot(-Ls, 0, ba);
  const shortEndX = bx + sex, shortEndY = by + sey;
  if (geo.hangerLength > 0) {
    for (const off of [0.18, -0.18]) { const [hx, hy] = rot(off, geo.cwHalf, pose.cw.angle); line(g, cam, shortEndX, shortEndY, pose.cw.x + hx, pose.cw.y + hy, PALETTE.iron_dark, 3); }
    const [hx, hy] = rot(0, geo.cwHalf, pose.cw.angle);
    line(g, cam, shortEndX, shortEndY, pose.cw.x + hx, pose.cw.y + hy, shade(frameCol, 0.9), 2);
  }
  const ch = geo.cwHalf, ca = pose.cw.angle;
  rotRect(g, cam, pose.cw.x, pose.cw.y, ch * 2, ch * 2, ca, shade(frameCol, 0.7), { color: PALETTE.iron_dark, width: 2 });
  for (const f of [-0.5, 0, 0.5]) { const [ox, oy] = rot(0, ch * f, ca); line(g, cam, pose.cw.x - ch * Math.cos(ca) + ox, pose.cw.y - ch * Math.sin(ca) + oy, pose.cw.x + ch * Math.cos(ca) + ox, pose.cw.y + ch * Math.sin(ca) + oy, shade(frameCol, 0.45), 1.5); }
  for (const f of [-0.75, 0.75]) { const [ox, oy] = rot(ch * f, 0, ca); rotRect(g, cam, pose.cw.x + ox, pose.cw.y + oy, 0.1, ch * 2, ca, PALETTE.iron_dark); }
  for (let i = -2; i <= 2; i++) { const [ox, oy] = rot(ch * 0.35 * i, ch + 0.08, ca); circle(g, cam, pose.cw.x + ox, pose.cw.y + oy, 0.16, PALETTE.cw, shade(PALETTE.cw, 0.6)); }

  // Axle
  circle(g, cam, bx, by, Math.max(0.2, t * 0.55), PALETTE.iron_dark, 0x111111);
  circle(g, cam, bx, by, Math.max(0.08, t * 0.2), 0x6a6a6a);

  // Sling (two cords + pouch) and projectile
  const pc = PALETTE[P.kind];
  const sa = pose.slingAlpha ?? 1;
  if (!pose.proj.released && opts.showSling !== false && sa > 0) {
    const px = pose.proj.x, py = pose.proj.y;
    const r = geo.projectileRadius;
    const dx = px - tipX, dy = py - tipY; const dl = Math.hypot(dx, dy) || 1;
    const nx = (-dy / dl) * r * 0.9, ny = (dx / dl) * r * 0.9;
    const ex = tipX + dx * sa, ey = tipY + dy * sa;
    g.moveTo(cam.sx(tipX), cam.sy(tipY)).lineTo(cam.sx(ex + nx * sa), cam.sy(ey + ny * sa)).stroke({ color: PALETTE.rope, width: 2 });
    g.moveTo(cam.sx(tipX), cam.sy(tipY)).lineTo(cam.sx(ex - nx * sa), cam.sy(ey - ny * sa)).stroke({ color: PALETTE.rope, width: 2 });
    if (sa >= 1) g.ellipse(cam.sx(px), cam.sy(py - r * 0.35), Math.max(2, r * 1.25 * cam.zoom), Math.max(1.5, r * 0.55 * cam.zoom)).fill(shade(PALETTE.rope, 0.6));
  }
  circle(g, cam, pose.proj.x, pose.proj.y, geo.projectileRadius, pc, shade(pc, 0.5), 3.5);
  const [hlx, hly] = rot(-geo.projectileRadius * 0.35, geo.projectileRadius * 0.35, pose.proj.angle);
  circle(g, cam, pose.proj.x + hlx, pose.proj.y + hly, geo.projectileRadius * 0.3, shade(pc, 1.35), undefined, 1.5);
}

function hash(n: number): number { let h = (n * 2654435761) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; }

/** Castle blocks from a render state. */
export function drawBlocks(g: Graphics, cam: Camera, blocks: RenderState['blocks'], kinds: Map<number, string>, time = 0) {
  for (const b of blocks) {
    const kind = kinds.get(b.id);
    let col: number = PALETTE[b.material];
    if (kind === 'banner') {
      rotRect(g, cam, b.x, b.y, b.w, b.h, b.angle, 0x4a3b2a);
      const [px, py] = rot(0.15, b.h * 0.42, b.angle);
      const wave = Math.sin(time * 6 + b.x) * 0.12;
      polyLocal(g, cam, b.x + px, b.y + py, b.angle, [[0, 0.1], [1.05, 0.22 + wave], [0.8, 0], [1.05, -0.22 + wave], [0, -0.1]], 0xc8553d, { color: 0x8a3524 });
      continue;
    }
    if (kind === 'keep') col = shade(col, 1.08);
    const f = 0.65 + 0.35 * Math.max(0, Math.min(1, b.hp));
    const base = shade(col, f);
    rotRect(g, cam, b.x, b.y, b.w, b.h, b.angle, base, { color: shade(col, 0.45) });
    const [ux, uy] = rot(0, b.h * 0.42, b.angle);
    const [hx, hy] = rot(b.w * 0.46, 0, b.angle);
    line(g, cam, b.x - hx + ux, b.y - hy + uy, b.x + hx + ux, b.y + hy + uy, shade(base, 1.18), 1.5);
    const r1 = hash(b.id), r2 = hash(b.id + 977);
    const [s1x, s1y] = rot((r1 - 0.5) * b.w * 0.6, (r2 - 0.5) * b.h * 0.5, b.angle);
    circle(g, cam, b.x + s1x, b.y + s1y, 0.05, shade(base, 0.8), undefined, 1);
    if (kind === 'keep' && b.id % 5 === 0) { const [wx, wy] = rot(0, 0.02, b.angle); rotRect(g, cam, b.x + wx, b.y + wy, 0.14, b.h * 0.55, b.angle, 0x1c1a22); }
    if (b.hp < 0.6) {
      const [cx1, cy1] = rot(-b.w * 0.2, -b.h * 0.3, b.angle);
      const [cx2, cy2] = rot(b.w * 0.05, b.h * 0.1, b.angle);
      const [cx3, cy3] = rot(b.w * 0.3, b.h * 0.4, b.angle);
      line(g, cam, b.x + cx1, b.y + cy1, b.x + cx2, b.y + cy2, shade(col, 0.3), 1.5);
      line(g, cam, b.x + cx2, b.y + cy2, b.x + cx3, b.y + cy3, shade(col, 0.3), 1.5);
    }
  }
}

/** The outer arm after a snap: a tapered splintered stub flying on its own. */
export function drawBeamPiece(g: Graphics, cam: Camera, piece: { x: number; y: number; angle: number; length: number }, material: TrebuchetConfig['beamMaterial'], t: number) {
  const col = PALETTE[material];
  const L = piece.length;
  polyLocal(g, cam, piece.x, piece.y, piece.angle, [[-L / 2, -t * 0.45], [-L / 2 + 0.25, -t * 0.2], [-L / 2 + 0.1, t * 0.1], [-L / 2 + 0.3, t * 0.45], [L / 2, t * 0.28], [L / 2, -t * 0.28]], col, { color: shade(col, 0.5) });
  const [fx, fy] = rot(L / 2, 0, piece.angle);
  const [gx, gy] = rot(0.45, t * 0.9, piece.angle);
  line(g, cam, piece.x + fx, piece.y + fy, piece.x + fx + gx, piece.y + fy + gy, PALETTE.iron_dark, 3);
}
