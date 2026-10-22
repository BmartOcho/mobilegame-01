// Node test of the match server logic with an in-memory database.
import { handle, type Db, type ProfileRow, type MatchRow, type TurnRow } from './core.ts';
import { DEFAULT_TREBUCHET, DEFAULT_PROJECTILE, DEFAULT_CASTLE, MAX_ROUNDS } from '../_shared/sim/index.ts';

const profiles = new Map<string, ProfileRow>();
const matches = new Map<string, MatchRow>();
const turns: TurnRow[] = [];
const db: Db = {
  getProfile: async (id) => structuredClone(profiles.get(id) ?? null),
  upsertProfile: async (p) => { profiles.set(p.id, structuredClone(p)); },
  candidates: async (ex, rating, n) => [...profiles.values()].filter((p) => p.id !== ex).sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating)).slice(0, n),
  createMatch: async (m) => { const row = { ...structuredClone(m), id: 'm' + (matches.size + 1) }; matches.set(row.id, row); return structuredClone(row); },
  getMatch: async (id) => structuredClone(matches.get(id) ?? null),
  updateMatch: async (id, patch) => { Object.assign(matches.get(id)!, structuredClone(patch)); },
  insertTurn: async (t) => { turns.push(t); },
};

const kit = { trebuchet: DEFAULT_TREBUCHET, projectile: DEFAULT_PROJECTILE, castle: DEFAULT_CASTLE };
let fails = 0;
const check = (n: string, ok: boolean, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${info}`); if (!ok) fails++; };

await handle('alice', { action: 'profile', kit: { ...kit, name: 'Alice' } }, db);
await handle('bob', { action: 'profile', kit: { ...kit, name: 'Bob', castle: { ...DEFAULT_CASTLE, material: 'limestone' } } }, db);
check('profiles created', profiles.size === 2);

const mm: any = await handle('alice', { action: 'matchmake' }, db);
check('matchmake finds bob', mm.opponent?.name === 'Bob', mm.matchId);

let finished: any = null;
let rounds = 0;
const t0 = performance.now();
for (let r = 1; r <= MAX_ROUNDS && !finished; r++) {
  const ps: any = await handle('alice', { action: 'player-shot', matchId: mm.matchId, aim: { releaseAngleDeg: 26 } }, db);
  check(`round ${r} player shot ok`, typeof ps.result.damage === 'number', `dmg ${ps.result.damage} integrity ${ps.result.castleAfter.integrity.toFixed(3)}`);
  if (ps.finished) { finished = ps.finished; break; }
  const os: any = await handle('alice', { action: 'opponent-shot', matchId: mm.matchId }, db);
  check(`round ${r} opponent shot ok`, typeof os.aim.releaseAngleDeg === 'number', `aim ${os.aim.releaseAngleDeg.toFixed(1)} dmg ${os.result.damage}`);
  rounds = r;
  if (os.finished) { finished = os.finished; break; }
}
console.log('match wall ms', Math.round(performance.now() - t0), 'per round', Math.round((performance.now() - t0) / Math.max(1, rounds)));
check('match finished with rating deltas', !!finished && typeof finished.attackerDelta === 'number', JSON.stringify(finished));
check('ratings moved', profiles.get('alice')!.rating !== 1000 || profiles.get('bob')!.rating !== 1000, `${profiles.get('alice')!.rating} / ${profiles.get('bob')!.rating}`);
check('turns recorded', turns.length >= 2, String(turns.length));
let threw = false;
try { await handle('alice', { action: 'player-shot', matchId: mm.matchId, aim: { releaseAngleDeg: 26 } }, db); } catch { threw = true; }
check('shots refused after finish', threw);
try { threw = false; await handle('bob', { action: 'player-shot', matchId: mm.matchId, aim: { releaseAngleDeg: 26 } }, db); } catch { threw = true; }
check('other user refused', threw);
if (fails) throw new Error(`${fails} failure(s)`);
console.log('all good');
