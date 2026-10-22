import { AIR_DENSITY, AIR_VISCOSITY } from './catalog.ts';

export interface AeroBody {
  radius: number;
  /** Subcritical Cd. */
  cd: number;
  smooth?: boolean;
}

/**
 * Sphere drag coefficient vs Reynolds number. Smooth spheres undergo the drag
 * crisis near Re ~ 3e5 (Cd 0.47 -> ~0.18, Achenbach 1972); rough surfaces
 * trip the boundary layer early so the drop is smaller and starts near 1e5.
 * Piecewise-linear so it is deterministic across engines.
 */
export function dragCoefficient(b: AeroBody, speed: number): number {
  const re = (AIR_DENSITY * speed * 2 * b.radius) / AIR_VISCOSITY;
  if (b.smooth) {
    if (re < 2.0e5) return b.cd;
    if (re < 4.0e5) return b.cd + (0.18 - b.cd) * ((re - 2.0e5) / 2.0e5);
    return 0.18 + Math.min(0.08, (re - 4.0e5) / 4.0e6 * 0.08);
  }
  const low = b.cd, high = b.cd * 0.7;
  if (re < 1.0e5) return low;
  if (re < 2.5e5) return low + (high - low) * ((re - 1.0e5) / 1.5e5);
  return high;
}

/** Drag torque on a slab rotating about one end: tau = -1/2 rho Cd t (L^4/4) w|w|. */
export function beamDragTorque(thickness: number, longArm: number, shortArm: number, omega: number): number {
  const CD_SLAB = 1.5;
  const k = 0.5 * AIR_DENSITY * CD_SLAB * thickness * (Math.pow(longArm, 4) + Math.pow(shortArm, 4)) / 4;
  return -k * omega * Math.abs(omega);
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
  const cd = dragCoefficient(b, speed);
  let fx = -q * cd * rx;
  let fy = -q * cd * ry;

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
