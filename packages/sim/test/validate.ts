// Validation against published trebuchet data.
//
// Anchors:
//  * Warwick Castle's "Ursa" (18 m, 4.5 t counterweight) threw a >13 kg stone a
//    certified 228 m (Coventry Telegraph / Guinness).
//  * Horsdal, "The swinging counterweight trebuchet" (arXiv 2502.19442,
//    2510.21869): measured efficiency ~69-75 % of the counterweight's
//    potential-energy drop ends up in the projectile for a tuned hinged
//    machine, ~80 % ideal without friction.
//  * Sphere drag at Re ~ 1e6, Cd ~ 0.5: a 25 kg stone at ~35 m/s loses a few
//    percent of range to drag; lighter shot is more wind-sensitive.
import { initPhysics, runShot, freshCastleState, DEFAULT_TREBUCHET, DEFAULT_PROJECTILE, G, type ShotInput, type TrebuchetConfig, type ProjectileConfig } from '../src/index.ts';

const R = await initPhysics();
const far = freshCastleState({ material: 'timber', wallHeight: 2, towerHeight: 4, wallThickness: 1, keepHeight: 0, towers: 2 }, 900);
let failures = 0;
const check = (name: string, ok: boolean, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); if (!ok) failures++; };
const still = { base: 0, gustiness: 0, seed: 1 };

function cockAngle(T: TrebuchetConfig) {
  return Math.asin(Math.min(Math.sin(75 * Math.PI / 180), Math.max(Math.sin(10 * Math.PI / 180), (T.pivotHeight - 0.6) / T.longArm)));
}
function best(input: Omit<ShotInput, 'aim'>) {
  const T = input.trebuchet;
  const pe = T.counterweightMass * G * T.shortArm * (1 + Math.sin(cockAngle(T)));
  let b = { range: 0, speed: 0, angle: 0, eff: 0 };
  for (let a = 20; a <= 55; a += 5) {
    const r = runShot(R, { ...input, aim: { releaseAngleDeg: a } }, far, { stopAtImpact: true });
    if (r.release && r.range > b.range) b = { range: r.range, speed: r.release.speed, angle: a, eff: (0.5 * input.projectile.mass * r.release.speed ** 2) / pe };
  }
  return b;
}

// 1. Efficiency: stock machine is deliberately unoptimised; a tuned one must reach the published band.
const stock = best({ trebuchet: DEFAULT_TREBUCHET, projectile: DEFAULT_PROJECTILE, wind: still });
// Tuned: light beam, long short-arm, 1.5 t counterweight (an 18 cm pine beam snaps above that).
const tuned = best({ trebuchet: { ...DEFAULT_TREBUCHET, counterweightMass: 1500, beamThickness: 0.18, shortArm: 1.8, hangerLength: 1.4, slingLength: 5.5 }, projectile: DEFAULT_PROJECTILE, wind: still });
const fixedCw = best({ trebuchet: { ...DEFAULT_TREBUCHET, counterweightMass: 1500, beamThickness: 0.18, shortArm: 1.8, hangerLength: 0, slingLength: 5.5 }, projectile: DEFAULT_PROJECTILE, wind: still });
console.log(`stock: ${stock.speed.toFixed(1)} m/s, ${stock.range.toFixed(0)} m, eff ${(stock.eff * 100).toFixed(0)}% | tuned: ${tuned.speed.toFixed(1)} m/s, ${tuned.range.toFixed(0)} m, eff ${(tuned.eff * 100).toFixed(0)}% | fixed CW: eff ${(fixedCw.eff * 100).toFixed(0)}%`);
check('stock machine efficiency 30-50% (room to upgrade)', stock.eff > 0.3 && stock.eff < 0.5, `${(stock.eff * 100).toFixed(0)}%`);
check('tuned hinged machine reaches 55-80% (Horsdal: 69-75% measured, 80% ideal)', tuned.eff > 0.55 && tuned.eff < 0.8, `${(tuned.eff * 100).toFixed(0)}%`);
check('hinged counterweight beats fixed counterweight', tuned.eff > fixedCw.eff, `${(tuned.eff * 100).toFixed(0)}% vs ${(fixedCw.eff * 100).toFixed(0)}%`);

// 2. Scale: Ursa
const ursa: TrebuchetConfig = { pivotHeight: 12, longArm: 14, shortArm: 3.5, beamMaterial: 'oak', beamThickness: 0.35, frameMaterial: 'oak', counterweightMass: 4500, hangerLength: 3, slingLength: 12, wheels: false };
const u = best({ trebuchet: ursa, projectile: { kind: 'stone', mass: 13 }, wind: still });
console.log(`Ursa-class 13 kg: ${u.speed.toFixed(1)} m/s, ${u.range.toFixed(0)} m (recorded 228 m)`);
check('Ursa-class range within 20% of the recorded 228 m', Math.abs(u.range - 228) / 228 < 0.2, `${u.range.toFixed(0)} m`);
check('stock medium machine 25 kg range 90-160 m', stock.range > 90 && stock.range < 160, `${stock.range.toFixed(0)} m`);

// 2b. Horsdal's full-scale estimate: 10 m arm, 7232 kg counterweight, 96 kg stone -> 286 m with drag and friction.
const hz: TrebuchetConfig = { pivotHeight: 9, longArm: 10, shortArm: 2.5, beamMaterial: 'oak', beamThickness: 0.32, frameMaterial: 'oak', counterweightMass: 7232, hangerLength: 2.2, slingLength: 9, wheels: false };
const h = best({ trebuchet: hz, projectile: { kind: 'stone', mass: 96 }, wind: still });
console.log(`Horsdal full-scale 96 kg: ${h.speed.toFixed(1)} m/s, ${h.range.toFixed(0)} m (paper: 286 m)`);
check('Horsdal full-scale range within 25% of the paper\'s 286 m', Math.abs(h.range - 286) / 286 < 0.25, `${h.range.toFixed(0)} m`);

// 3. Aerodynamics
const r = runShot(R, { trebuchet: DEFAULT_TREBUCHET, projectile: DEFAULT_PROJECTILE, aim: { releaseAngleDeg: stock.angle }, wind: still }, far, { stopAtImpact: true });
const rel = r.release!;
const vac = (rel.vx / G) * (rel.vy + Math.sqrt(rel.vy * rel.vy + 2 * G * rel.y)) + rel.x;
const loss = 1 - r.range / vac;
console.log(`drag loss vs vacuum: ${(loss * 100).toFixed(1)}% (vacuum ${vac.toFixed(0)} m, actual ${r.range.toFixed(0)} m)`);
check('drag loss for a 25 kg stone is 1-12%', loss > 0.01 && loss < 0.12, `${(loss * 100).toFixed(1)}%`);

const sens = (p: ProjectileConfig) => {
  const a = best({ trebuchet: DEFAULT_TREBUCHET, projectile: p, wind: still }).angle;
  const t = runShot(R, { trebuchet: DEFAULT_TREBUCHET, projectile: p, aim: { releaseAngleDeg: a }, wind: { base: 8, gustiness: 0, seed: 1 } }, far, { stopAtImpact: true }).range;
  const h = runShot(R, { trebuchet: DEFAULT_TREBUCHET, projectile: p, aim: { releaseAngleDeg: a }, wind: { base: -8, gustiness: 0, seed: 1 } }, far, { stopAtImpact: true }).range;
  return (t - h) / ((t + h) / 2);
};
// Same mass, different ballistic coefficient: a 10 kg clay pot (big, draggy)
// must drift more than a 10 kg iron ball (small, dense).
const sPot = sens({ kind: 'firepot', mass: 10 }), sIron = sens({ kind: 'iron', mass: 10 });
console.log(`±8 m/s wind swing: 10 kg clay pot ${(sPot * 100).toFixed(1)}%, 10 kg iron ${(sIron * 100).toFixed(1)}%`);
check('low ballistic coefficient drifts more in wind', sPot > sIron * 1.3, `${(sPot * 100).toFixed(1)}% vs ${(sIron * 100).toFixed(1)}%`);
// Dense, smooth iron shot sits above the drag crisis and barely notices wind (cannonballs are famously true); the
// stock quarried stone must still be pushed around enough to matter when aiming.
const sStone = sens(DEFAULT_PROJECTILE);
console.log(`±8 m/s wind swing: 25 kg stone ${(sStone * 100).toFixed(1)}%`);
check('wind swing is a real aiming factor for the stock stone (>3% of range)', sStone > 0.03, `${(sStone * 100).toFixed(1)}%`);
check('smooth iron shot is nearly wind-proof (<2%)', sIron < 0.02, `${(sIron * 100).toFixed(1)}%`);

if (failures) throw new Error(`${failures} validation failure(s)`);
console.log('validation ok');
