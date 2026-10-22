// Pure match logic for the ranked ladder. No Deno / Supabase imports so it
// can be unit-tested in Node with an in-memory Db.
import {
  initPhysics, runShot, freshCastleState, computeIntegrity, layoutCastle, aiAim, matchWind, matchOutcome, eloDelta,
  sanitizeTrebuchet, sanitizeProjectile, hashString, MAX_ROUNDS, LOSE_AT,
  type AimInput, type CastleConfig, type CastleState, type ProjectileConfig, type TrebuchetConfig, type ShotResult, type Rapier,
} from '../_shared/sim/index.ts';

export interface Kit { name: string; rating: number; trebuchet: TrebuchetConfig; projectile: ProjectileConfig; castle: CastleConfig }
export interface ProfileRow extends Kit { id: string; games: number; wins: number }
export interface MatchRow {
  id: string; attacker: string; defender: string; seed: string; round: number;
  attacker_kit: Kit; defender_kit: Kit;
  attacker_castle: CastleState; defender_castle: CastleState;
  attacker_damage: number; defender_damage: number;
  status: 'active' | 'finished' | 'abandoned'; winner: string | null;
  attacker_delta: number | null; defender_delta: number | null;
}
export interface TurnRow { match_id: string; round: number; shooter: string; aim: AimInput; wind: unknown; result: unknown }

export interface Db {
  getProfile(id: string): Promise<ProfileRow | null>;
  upsertProfile(p: ProfileRow): Promise<void>;
  /** Up to n other profiles nearest in rating. */
  candidates(excludeId: string, rating: number, n: number): Promise<ProfileRow[]>;
  createMatch(m: Omit<MatchRow, 'id'>): Promise<MatchRow>;
  getMatch(id: string): Promise<MatchRow | null>;
  updateMatch(id: string, patch: Partial<MatchRow>): Promise<void>;
  insertTurn(t: TurnRow): Promise<void>;
}

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

function sanitizeCastle(c: CastleConfig): CastleConfig {
  const clampI = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  return {
    material: (['timber', 'limestone', 'granite'] as const).includes(c?.material) ? c.material : 'timber',
    wallHeight: clampI(c?.wallHeight, 2, 12, 5),
    towerHeight: clampI(c?.towerHeight, 4, 18, 8),
    keepHeight: clampI(c?.keepHeight, 0, 8, 4),
    towers: clampI(c?.towers, 2, 4, 2) as CastleConfig['towers'],
    wallThickness: c?.wallThickness === 2 ? 2 : 1,
  };
}

function sanitizeKit(k: Partial<Kit>, fallback?: Kit): Kit {
  return {
    name: String(k.name ?? fallback?.name ?? 'Lord Nobody').slice(0, 24),
    rating: fallback?.rating ?? 1000,
    trebuchet: sanitizeTrebuchet((k.trebuchet ?? fallback?.trebuchet) as TrebuchetConfig),
    projectile: sanitizeProjectile((k.projectile ?? fallback?.projectile) as ProjectileConfig),
    castle: sanitizeCastle((k.castle ?? fallback?.castle) as CastleConfig),
  };
}

/** Strip the heavy per-shot data the client can regenerate itself. */
function slimResult(r: ShotResult) {
  const { castleAfter, ...rest } = r;
  return { ...rest, castleAfter };
}

async function finishMatch(db: Db, m: MatchRow, winner: string | null, abandoned = false) {
  const a = await db.getProfile(m.attacker); const d = await db.getProfile(m.defender);
  if (!a || !d) throw new HttpError(500, 'profiles missing');
  const scoreA: 0 | 0.5 | 1 = winner === null ? 0.5 : winner === m.attacker ? 1 : 0;
  const scoreD: 0 | 0.5 | 1 = winner === null ? 0.5 : winner === m.defender ? 1 : 0;
  const dA = eloDelta(a.rating, d.rating, scoreA, a.games);
  const dD = eloDelta(d.rating, a.rating, scoreD, d.games);
  a.rating += dA; a.games++; if (scoreA === 1) a.wins++;
  d.rating += dD; d.games++; if (scoreD === 1) d.wins++;
  await db.upsertProfile(a); await db.upsertProfile(d);
  await db.updateMatch(m.id, { status: abandoned ? 'abandoned' : 'finished', winner, attacker_delta: dA, defender_delta: dD });
  return { winner, attackerDelta: dA, defenderDelta: dD, attackerRating: a.rating, defenderRating: d.rating };
}

export type Finished = Awaited<ReturnType<typeof finishMatch>>;

export async function handle(userId: string, body: any, db: Db): Promise<unknown> {
  const action = String(body?.action ?? '');
  const R: Rapier = await initPhysics();

  if (action === 'profile') {
    const existing = await db.getProfile(userId);
    const kit = sanitizeKit(body.kit ?? {}, existing ?? undefined);
    const row: ProfileRow = { id: userId, games: existing?.games ?? 0, wins: existing?.wins ?? 0, ...kit, rating: existing?.rating ?? 1000 };
    await db.upsertProfile(row);
    return { profile: row };
  }

  if (action === 'matchmake') {
    const me = await db.getProfile(userId);
    if (!me) throw new HttpError(400, 'create a profile first');
    const cands = await db.candidates(userId, me.rating, 8);
    if (!cands.length) return { opponent: null };
    const seed = `${me.id}:${Date.now()}:${Math.floor(Math.random() * 1e9)}`;
    const pick = cands[hashString(seed) % cands.length];
    const attackerKit: Kit = { name: me.name, rating: me.rating, trebuchet: me.trebuchet, projectile: me.projectile, castle: me.castle };
    const defenderKit: Kit = { name: pick.name, rating: pick.rating, trebuchet: pick.trebuchet, projectile: pick.projectile, castle: pick.castle };
    const m = await db.createMatch({
      attacker: me.id, defender: pick.id, seed, round: 1,
      attacker_kit: attackerKit, defender_kit: defenderKit,
      attacker_castle: freshCastleState(attackerKit.castle), defender_castle: freshCastleState(defenderKit.castle),
      attacker_damage: 0, defender_damage: 0, status: 'active', winner: null, attacker_delta: null, defender_delta: null,
    });
    return { matchId: m.id, seed, opponent: { ...defenderKit, id: pick.id } };
  }

  const m = await db.getMatch(String(body?.matchId ?? ''));
  if (!m) throw new HttpError(404, 'no such match');
  if (m.attacker !== userId) throw new HttpError(403, 'not your match');
  if (m.status !== 'active') throw new HttpError(409, 'match is over');
  const wind = matchWind(m.seed, m.round);

  if (action === 'player-shot') {
    const aim: AimInput = { releaseAngleDeg: Number(body?.aim?.releaseAngleDeg), cockAngleDeg: body?.aim?.cockAngleDeg === undefined ? undefined : Number(body.aim.cockAngleDeg) };
    if (!Number.isFinite(aim.releaseAngleDeg)) throw new HttpError(400, 'bad aim');
    if (m.round > MAX_ROUNDS) throw new HttpError(409, 'no rounds left');
    const res = runShot(R, { trebuchet: m.attacker_kit.trebuchet, projectile: m.attacker_kit.projectile, aim, wind }, m.defender_castle);
    const layout = layoutCastle(m.defender_kit.castle);
    res.castleAfter.integrity = computeIntegrity(layout, res.castleAfter.blocks);
    await db.insertTurn({ match_id: m.id, round: m.round, shooter: m.attacker, aim, wind, result: { damage: res.damage, range: res.range, impact: res.impact, integrityAfter: res.castleAfter.integrity } });
    m.defender_castle = res.castleAfter; m.attacker_damage += res.damage;
    await db.updateMatch(m.id, { defender_castle: m.defender_castle, attacker_damage: m.attacker_damage });
    let finished: Finished | null = null;
    if (res.castleAfter.integrity <= LOSE_AT) finished = await finishMatch(db, m, m.attacker);
    return { result: slimResult(res), finished };
  }

  if (action === 'opponent-shot') {
    // The defender is away: the server pilots their stored machine with the
    // same seeded AI the client uses, so both sides see the identical shot.
    const skill = 0.25 + 0.65 * Math.max(0, Math.min(1, (m.defender_kit.rating - 900) / 900));
    const base = { trebuchet: m.defender_kit.trebuchet, projectile: m.defender_kit.projectile, wind };
    const aim = await aiAim(R, base, m.attacker_castle, wind, { skill, seed: hashString(`${m.seed}:${m.round}`) });
    const res = runShot(R, { ...base, aim }, m.attacker_castle);
    const layout = layoutCastle(m.attacker_kit.castle);
    res.castleAfter.integrity = computeIntegrity(layout, res.castleAfter.blocks);
    await db.insertTurn({ match_id: m.id, round: m.round, shooter: m.defender, aim, wind, result: { damage: res.damage, range: res.range, impact: res.impact, integrityAfter: res.castleAfter.integrity } });
    m.attacker_castle = res.castleAfter; m.defender_damage += res.damage;
    let finished: Finished | null = null;
    if (res.castleAfter.integrity <= LOSE_AT) finished = await finishMatch(db, m, m.defender);
    else if (m.round >= MAX_ROUNDS) {
      const out = matchOutcome(m.attacker_castle.integrity, m.defender_castle.integrity);
      finished = await finishMatch(db, m, out === null ? null : out ? m.attacker : m.defender);
    }
    m.round += 1;
    await db.updateMatch(m.id, { attacker_castle: m.attacker_castle, defender_damage: m.defender_damage, round: m.round });
    return { aim, result: slimResult(res), finished };
  }

  if (action === 'abandon') {
    const finished = await finishMatch(db, m, m.defender, true);
    return { finished };
  }

  throw new HttpError(400, `unknown action ${action}`);
}
