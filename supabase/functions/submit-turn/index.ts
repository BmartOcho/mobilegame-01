// Supabase Edge Function: authoritative match server for the ranked ladder.
// Deploy: supabase functions deploy submit-turn
import { createClient } from '@supabase/supabase-js';
import { handle, HttpError, type Db, type ProfileRow, type MatchRow, type TurnRow } from './core.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function makeDb(admin: ReturnType<typeof createClient>): Db {
  const one = async <T,>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T | null> => {
    const { data, error } = await q;
    if (error) throw new HttpError(500, JSON.stringify(error));
    return (data as T) ?? null;
  };
  return {
    getProfile: (id) => one<ProfileRow>(admin.from('profiles').select('*').eq('id', id).maybeSingle()),
    upsertProfile: async (p) => { await one(admin.from('profiles').upsert({ ...p, updated_at: new Date().toISOString() })); },
    candidates: async (exclude, rating, n) => {
      const rows = (await one<ProfileRow[]>(admin.from('profiles').select('*').neq('id', exclude).gte('rating', rating - 250).lte('rating', rating + 250).limit(n))) ?? [];
      if (rows.length) return rows;
      return (await one<ProfileRow[]>(admin.from('profiles').select('*').neq('id', exclude).order('rating', { ascending: false }).limit(n))) ?? [];
    },
    createMatch: async (m) => (await one<MatchRow>(admin.from('matches').insert(m).select('*').single()))!,
    getMatch: (id) => one<MatchRow>(admin.from('matches').select('*').eq('id', id).maybeSingle()),
    updateMatch: async (id, patch) => { await one(admin.from('matches').update(patch).eq('id', id)); },
    insertTurn: async (t: TurnRow) => { await one(admin.from('turns').insert(t)); },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401, headers: { ...cors, 'content-type': 'application/json' } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const out = await handle(user.id, body, makeDb(admin));
    return new Response(JSON.stringify(out), { headers: { ...cors, 'content-type': 'application/json' } });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status, headers: { ...cors, 'content-type': 'application/json' } });
  }
});
