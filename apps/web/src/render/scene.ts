import { Graphics } from 'pixi.js';
import type { Camera } from './camera';
import { PALETTE, shade } from './draw';

/** Parallax backdrop drawn in screen space from the camera. */
export function drawBackdrop(g: Graphics, cam: Camera, t: number) {
  const W = cam.width, H = cam.height;
  const horizonY = cam.sy(0);
  // Sky bands
  const bands = 28;
  for (let i = 0; i < bands; i++) {
    const y0 = (horizonY * i) / bands;
    const f = i / (bands - 1);
    const col = mix(PALETTE.sky1, PALETTE.sky2, f);
    g.rect(0, y0, W, horizonY / bands + 1).fill(col);
  }
  // Sun
  g.circle(W * 0.78, horizonY * 0.28, Math.min(W, H) * 0.05).fill(0xfff1c9);
  // Clouds drift with wind-ish time
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 331 + t * 6 - cam.x * cam.zoom * 0.05) % (W + 300)) - 150;
    const cy = horizonY * (0.15 + 0.12 * ((i * 7) % 3));
    g.ellipse(cx, cy, 70 + i * 10, 18).fill({ color: 0xffffff, alpha: 0.5 });
    g.ellipse(cx + 40, cy - 8, 40, 14).fill({ color: 0xffffff, alpha: 0.5 });
  }
  // Far hills (parallax 0.15)
  drawHills(g, W, horizonY, -cam.x * cam.zoom * 0.15, 0.12 * H, PALETTE.hill2, 17);
  drawHills(g, W, horizonY, -cam.x * cam.zoom * 0.3, 0.07 * H, PALETTE.hill, 29);
  // Ground
  g.rect(0, horizonY, W, H - horizonY).fill(PALETTE.ground);
  g.rect(0, horizonY + 10 * (cam.zoom / 20), W, H).fill(shade(PALETTE.ground, 0.85));
  g.rect(0, horizonY, W, 2).fill(shade(PALETTE.ground, 0.6));
}

function drawHills(g: Graphics, W: number, horizonY: number, offset: number, amp: number, color: number, seed: number) {
  const pts: number[] = [0, horizonY];
  const step = 40;
  for (let x = 0; x <= W + step; x += step) {
    const u = (x - offset) / 260;
    const y = horizonY - amp * (0.55 + 0.45 * Math.sin(u + seed) * Math.cos(u * 0.37 + seed * 0.5)) ;
    pts.push(x, y);
  }
  pts.push(W, horizonY);
  g.poly(pts).fill(color);
}

function mix(a: number, b: number, f: number): number {
  const ch = (s: number) => ((((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f) | 0) << s;
  return ch(16) | ch(8) | ch(0);
}

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: number; spin: number; a: number }

export class Particles {
  list: Particle[] = [];
  burst(x: number, y: number, vx: number, vy: number, color: number, n: number, speed: number, size: number) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random() * 0.9);
      this.list.push({ x, y, vx: vx * 0.6 + Math.cos(ang) * sp, vy: vy * 0.6 + Math.sin(ang) * sp + speed * 0.4, life: 0, max: 0.9 + Math.random() * 1.2, size: size * (0.5 + Math.random()), color, spin: (Math.random() - 0.5) * 8, a: Math.random() * Math.PI });
    }
    if (this.list.length > 900) this.list.splice(0, this.list.length - 900);
  }
  update(dt: number) {
    for (const p of this.list) { p.life += dt; p.vy -= 9.81 * dt; p.vx *= 0.995; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.spin * dt; if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.2; p.vx *= 0.6; } }
    this.list = this.list.filter((p) => p.life < p.max);
  }
  draw(g: Graphics, cam: Camera) {
    for (const p of this.list) {
      const f = 1 - p.life / p.max;
      const s = Math.max(1.5, p.size * cam.zoom);
      g.rect(cam.sx(p.x) - s / 2, cam.sy(p.y) - s / 2, s, s).fill({ color: p.color, alpha: Math.min(1, f * 1.5) });
    }
  }
}
