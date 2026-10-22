import { initPhysics, runShot, freshCastleState, DEFAULT_TREBUCHET, DEFAULT_PROJECTILE, DEFAULT_CASTLE, aiAim, matchWind } from '../src/index.ts';
const R = await initPhysics();
const castle = freshCastleState({ ...DEFAULT_CASTLE, material: 'granite', towerHeight: 12, wallHeight: 8, keepHeight: 6, towers: 3 });
const wind = matchWind('seed', 1);
const base = { trebuchet: DEFAULT_TREBUCHET, projectile: DEFAULT_PROJECTILE, wind };
let t = performance.now(); runShot(R, { ...base, aim: { releaseAngleDeg: 30 } }, castle); console.log('full shot ms', (performance.now() - t).toFixed(0));
t = performance.now(); runShot(R, { ...base, aim: { releaseAngleDeg: 30 } }, castle, { stopAtImpact: true }); console.log('impact-only ms', (performance.now() - t).toFixed(0));
t = performance.now(); const a = await aiAim(R, base, castle, wind, { skill: 0.5, seed: 3 }); console.log('aiAim ms', (performance.now() - t).toFixed(0), a);
t = performance.now(); const a2 = await aiAim(R, base, castle, wind, { skill: 0.5, seed: 3 }); console.log('aiAim deterministic', JSON.stringify(a) === JSON.stringify(a2));
