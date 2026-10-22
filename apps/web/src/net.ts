/**
 * Online layer. Supabase is optional: without VITE_SUPABASE_URL/ANON_KEY the
 * game runs fully offline against the AI. Contract: supabase/functions/submit-turn.
 */
import type { Profile } from './state';
import type { Opponent, MatchEnd } from './opponent';
import type { CastleState, AimInput } from '@siege/sim';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export interface LeaderRow { name: string; rating: number }

interface ServerFinished { winner: string | null; attackerDelta: number; attackerRating: number }

class Net {
  enabled = !!(url && anon);
  private client: any = null;
  userId: string | null = null;

  private async sb() {
    if (!this.enabled) return null;
    if (!this.client) {
      const { createClient } = await import('@supabase/supabase-js');
      this.client = createClient(url!, anon!, { auth: { persistSession: true } });
      let { data } = await this.client.auth.getSession();
      if (!data.session) { await this.client.auth.signInAnonymously(); ({ data } = await this.client.auth.getSession()); }
      this.userId = data.session?.user?.id ?? null;
    }
    return this.client;
  }

  private async call(body: Record<string, unknown>): Promise<any> {
    const sb = await this.sb(); if (!sb) throw new Error('offline');
    const { data, error } = await sb.functions.invoke('submit-turn', { body });
    if (error) throw new Error(error.message ?? String(error));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async syncProfile(p: Profile) {
    const data = await this.call({ action: 'profile', kit: { name: p.name, trebuchet: p.trebuchet, projectile: p.projectile, castle: p.castle } });
    if (data?.profile) { p.rating = data.profile.rating; p.games = data.profile.games; p.wins = data.profile.wins; }
  }

  async leaderboard(): Promise<LeaderRow[]> {
    const sb = await this.sb(); if (!sb) return [];
    const { data } = await sb.from('leaderboard').select('name,rating').limit(10);
    return (data ?? []) as LeaderRow[];
  }

  /**
   * Ranked siege: you attack another real player's stored castle with your
   * machine; the server pilots their stored machine against yours with the
   * same seeded AI the client runs, and re-simulates every shot itself.
   */
  async findOpponent(p: Profile): Promise<{ opponent: Opponent; seed: string } | null> {
    await this.syncProfile(p);
    const data = await this.call({ action: 'matchmake' });
    if (!data?.opponent) return null;
    const o = data.opponent;
    const matchId = data.matchId as string;
    const call = (b: Record<string, unknown>) => this.call({ matchId, ...b });
    let pendingEnd: ServerFinished | null = null;
    let pendingOpp: { aim: AimInput; castleAfter: CastleState } | null = null;
    const opponent: Opponent = {
      name: o.name, rating: o.rating, castle: o.castle, trebuchet: o.trebuchet, projectile: o.projectile,
      async onPlayerShot(aim) {
        const r = await call({ action: 'player-shot', aim });
        if (r.finished) pendingEnd = r.finished;
        return { castleAfter: r.result.castleAfter as CastleState };
      },
      async aim() {
        const r = await call({ action: 'opponent-shot' });
        if (r.finished) pendingEnd = r.finished;
        pendingOpp = { aim: r.aim, castleAfter: r.result.castleAfter };
        return r.aim as AimInput;
      },
      async afterOpponentShot() {
        const c = pendingOpp?.castleAfter; pendingOpp = null;
        return c ? { castleAfter: c } : undefined;
      },
      async settle(natural): Promise<MatchEnd | undefined> {
        if (!pendingEnd && !natural) { try { const r = await call({ action: 'abandon' }); pendingEnd = r.finished; } catch { /* ignore */ } }
        if (!pendingEnd) return undefined;
        return { delta: pendingEnd.attackerDelta, rating: pendingEnd.attackerRating };
      },
    };
    return { opponent, seed: data.seed as string };
  }
}

export const net = new Net();
