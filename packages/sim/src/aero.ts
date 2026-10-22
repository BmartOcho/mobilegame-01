import { AIR_DENSITY } from './catalog.ts';

export interface AeroBody {
  radius: number;
  cd: number;
}

/**
 * Quadratic drag + Magnus lift for a sphere in 2D.
 *  F_d = -1/2 rho Cd A |v_rel| v_rel
 *  F_m = 1/2 rho A C_L |v_rel|^2 * perp(v_rel) * sign(omega)
 * with C_L from the spin ratio S = r*omega/|v| (empirical, capped).
 */
export function aeroForce(
  b: AeroBody,
  vx: number, vy: number,
  windX: number, windY: number,
  omega: number,
): { fx: number; fy: number } {
  const rx = vx - windX;
  const ry = vy - windY;
  const speed = Math.hypot(rx, ry);
  if (speed < 1e-6) return { fx: 0, fy: 0 };
  const area = Math.PI * b.radius * b.radius;
  const q = 0.5 * AIR_DENSITY * area * speed;
  let fx = -q * b.cd * rx;
  let fy = -q * b.cd * ry;

  // Magnus
  const spinRatio = Math.abs(omega) * b.radius / speed;
  if (spinRatio > 1e-4) {
    const cl = Math.min(0.28, 0.45 * spinRatio);
    const lift = q * cl * speed; // 1/2 rho A C_L v^2
    // omega x v in 2D: omega * (-vy, vx)
    const s = omega > 0 ? 1 : -1;
    fx += lift * (-ry / speed) * s;
    fy += lift * (rx / speed) * s;
  }
  return { fx, fy };
}
