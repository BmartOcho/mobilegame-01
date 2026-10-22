import { initPhysics, runShot, freshCastleState, DEFAULT_TREBUCHET, DEFAULT_PROJECTILE, DEFAULT_CASTLE, type ShotInput } from '../src/index';

const R = await initPhysics();

function shot(overrides: Partial<ShotInput> = {}): ShotInput {
  return {
    trebuchet: { ...DEFAULT_TREBUCHET },
    projectile: { ...DEFAULT_PROJECTILE },
    aim: { releaseAngleDeg: 45 },
    wind: { base: 0, gustiness: 0, seed: 1 },
    ...overrides,
  };
}

let failures = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`);
  if (!ok) failures++;
};

// 1. Baseline shot
const castle = freshCastleState(DEFAULT_CASTLE);
const t0 = performance.now();
const r1 = runShot(R, shot(), castle);
const ms = performance.now() - t0;
console.log(JSON.stringify({ release: r1.release, impact: r1.impact, range: r1.range, damage: r1.damage, destroyed: r1.destroyed.length, integrity: [r1.integrityBefore, r1.integrityAfter], duration: r1.duration, steps: r1.steps, ms: Math.round(ms) }, null, 0));
check('sling released', !!r1.release);
check('launch speed plausible (15..80 m/s)', !!r1.release && r1.release.speed > 15 && r1.release.speed < 80, r1.release?.speed.toFixed(1));
check('range plausible (40..250 m)', r1.range > 40 && r1.range < 250, r1.range.toFixed(1));

// 2. Determinism: same inputs -> identical result
const r2 = runShot(R, shot(), castle);
check('deterministic', JSON.stringify(r1) === JSON.stringify(r2));

// 3. Release angle sweep -> range changes monotonically-ish
const sweep: number[] = [];
for (const a of [25, 35, 45, 55, 65, 80]) {
  const r = runShot(R, shot({ aim: { releaseAngleDeg: a } }), castle);
  sweep.push(Math.round(r.range));
  console.log(`  release ${a}° -> speed ${r.release?.speed.toFixed(1)} launch ${r.release?.angleDeg.toFixed(0)}° range ${r.range.toFixed(1)} dmg ${r.damage}`);
}
check('release angle changes range', new Set(sweep).size >= 4, sweep.join(','));

// 4. Wind matters
const rTail = runShot(R, shot({ wind: { base: 8, gustiness: 0.3, seed: 7 } }), castle);
const rHead = runShot(R, shot({ wind: { base: -8, gustiness: 0.3, seed: 7 } }), castle);
check('tailwind longer than headwind', rTail.range > rHead.range, `${rTail.range.toFixed(1)} vs ${rHead.range.toFixed(1)}`);

// 5. Heavier counterweight -> faster
const rHeavy = runShot(R, shot({ trebuchet: { ...DEFAULT_TREBUCHET, counterweightMass: 4000 } }), castle);
check('heavier CW faster', (rHeavy.release?.speed ?? 0) > (r1.release?.speed ?? 0), `${rHeavy.release?.speed.toFixed(1)} vs ${r1.release?.speed.toFixed(1)}`);

// 6. Hit the castle: search release angle for a hit, then confirm damage + snapshot roundtrip
let hit = null as null | { a: number; r: ReturnType<typeof runShot> };
for (let a = 20; a <= 110; a += 2) {
  const r = runShot(R, shot({ aim: { releaseAngleDeg: a } }), castle);
  if (r.impact?.target === 'castle') { hit = { a, r }; break; }
}
check('some release angle hits the castle', !!hit, hit ? `angle ${hit.a}, dmg ${hit.r.damage}, destroyed ${hit.r.destroyed.length}, integrity ${hit.r.integrityAfter.toFixed(3)}` : '');
if (hit) {
  check('castle damaged', hit.r.integrityAfter < hit.r.integrityBefore);
  const again = runShot(R, shot({ aim: { releaseAngleDeg: hit.a } }), hit.r.castleAfter);
  check('second shot on damaged castle runs', again.steps > 0, `integrity ${again.integrityAfter.toFixed(3)}`);
  const again2 = runShot(R, shot({ aim: { releaseAngleDeg: hit.a } }), hit.r.castleAfter);
  check('snapshot restore deterministic', JSON.stringify(again) === JSON.stringify(again2));
}

console.log(failures ? `\n${failures} failure(s)` : '\nall good');
if (failures) throw new Error(`${failures} test failure(s)`);
