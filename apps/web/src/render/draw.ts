import { Graphics } from 'pixi.js';
import type { Camera } from './camera';

/** Rotated rectangle in world units, centre (cx,cy), rotation a (radians, CCW). */
export function rotRect(g: Graphics, cam: Camera, cx: number, cy: number, w: number, h: number, a: number, fill: number, stroke?: { color: number; width?: number }) {
  const c = Math.cos(a), s = Math.sin(a);
  const hw = w / 2, hh = h / 2;
  const pts: number[] = [];
  for (const [lx, ly] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as const) {
    const wx = cx + lx * c - ly * s;
    const wy = cy + lx * s + ly * c;
    pts.push(cam.sx(wx), cam.sy(wy));
  }
  g.poly(pts).fill(fill);
  if (stroke) g.poly(pts).stroke({ color: stroke.color, width: stroke.width ?? 1 });
}

export function line(g: Graphics, cam: Camera, x1: number, y1: number, x2: number, y2: number, color: number, width: number) {
  g.moveTo(cam.sx(x1), cam.sy(y1)).lineTo(cam.sx(x2), cam.sy(y2)).stroke({ color, width });
}

export function circle(g: Graphics, cam: Camera, x: number, y: number, r: number, fill: number, stroke?: number, minPx = 1.5) {
  g.circle(cam.sx(x), cam.sy(y), Math.max(minPx, r * cam.zoom)).fill(fill);
  if (stroke !== undefined) g.circle(cam.sx(x), cam.sy(y), Math.max(minPx, r * cam.zoom)).stroke({ color: stroke, width: 1 });
}

export function shade(color: number, f: number): number {
  const r = Math.min(255, Math.max(0, ((color >> 16) & 255) * f)) | 0;
  const g = Math.min(255, Math.max(0, ((color >> 8) & 255) * f)) | 0;
  const b = Math.min(255, Math.max(0, (color & 255) * f)) | 0;
  return (r << 16) | (g << 8) | b;
}

export const PALETTE = {
  pine: 0xc9a46a, oak: 0x8c5a2b, ash: 0xd8c39a, ironbound: 0x5a4a3a,
  timber: 0x9a6b3a, limestone: 0xd6c9a8, granite: 0x7d7f86,
  stone: 0x8e8a7e, iron: 0x3c3f45, firepot: 0xb5572e, lead: 0x5b6070,
  rope: 0xd9c08a, iron_dark: 0x2a2c30, cw: 0x6b6256,
  sky1: 0x5d7fb0, sky2: 0xd7b58c, hill: 0x3e6f4a, hill2: 0x2c5338, ground: 0x6b7f3e, dirt: 0x4b3a2a,
} as const;
