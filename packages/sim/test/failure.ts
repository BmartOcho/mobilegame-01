import { initPhysics, runShot, freshCastleState, DEFAULT_TREBUCHET, DEFAULT_PROJECTILE, DEFAULT_CASTLE, type TrebuchetConfig } from '../src/index.ts';
const R = await initPhysics();
const castle = freshCastleState(DEFAULT_CASTLE);
const still = { base: 0, gustiness: 0, seed: 1 };
let failures = 0;
const check = (n: string, ok: boolean, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${info}`); if (!ok) failures++; };
const shot = (T: TrebuchetConfig, mass = 25, kind: 'stone' | 'iron' = 'stone') => runShot(R, { trebuchet: T, projectile: { kind, mass }, aim: { releaseAngleDeg: 35 }, wind: still }, castle, { stopAtImpact: true });

const stock = shot(DEFAULT_TREBUCHET);
console.log(`stock: peak stress ${(stock.peakStress * 100).toFixed(0)}% of pine, tip ${(stock.peakTip * 100).toFixed(0)}%, failure ${stock.failure?.kind ?? 'none'}`);
check('stock machine survives with margin', !stock.failure && stock.peakStress < 0.7 && stock.peakTip < 0.7);

// 22 cm pine beam under a 4 t counterweight and a 90 kg stone: should snap.
const thin: TrebuchetConfig = { ...DEFAULT_TREBUCHET, beamThickness: 0.22, counterweightMass: 4000 };
const snap = shot(thin, 90);
console.log(`22 cm pine, 90 kg, 4 t: peak stress ${(snap.peakStress * 100).toFixed(0)}%, failure ${snap.failure?.kind ?? 'none'} at t=${snap.failure?.t.toFixed(2)}`);
check('pine beam snaps under a 4 t counterweight', snap.failure?.kind === 'beam');
check('snapped beam throws nowhere useful', snap.range < 60, `${snap.range.toFixed(0)} m`);

// Same geometry in ironbound: survives (110 MPa vs 40 MPa).
const strong = shot({ ...thin, beamMaterial: 'ironbound' }, 90);
console.log(`ironbound, same load: peak stress ${(strong.peakStress * 100).toFixed(0)}%, failure ${strong.failure?.kind ?? 'none'}, range ${strong.range.toFixed(0)} m`);
check('ironbound beam takes the same load', !strong.failure, strong.failure?.kind ?? 'ok');

// Tall light pine frame, huge counterweight, heavy shot: should tip.
const topHeavy: TrebuchetConfig = { ...DEFAULT_TREBUCHET, pivotHeight: 11, longArm: 13, shortArm: 3.5, beamThickness: 0.45, beamMaterial: 'ironbound', counterweightMass: 12000, hangerLength: 3, slingLength: 11, frameMaterial: 'pine' };
const tip = shot(topHeavy, 120);
console.log(`top-heavy: peak tip ${(tip.peakTip * 100).toFixed(0)}%, stress ${(tip.peakStress * 100).toFixed(0)}%, failure ${tip.failure?.kind ?? 'none'}`);
check('top-heavy staked frame fails (tips or snaps)', !!tip.failure, tip.failure?.kind ?? 'none');

// Determinism with failures
const again = shot(thin, 90);
check('failure is deterministic', JSON.stringify(again.failure) === JSON.stringify(snap.failure) && again.range === snap.range);
if (failures) throw new Error(`${failures} failure-test failure(s)`);
console.log('failure tests ok');
