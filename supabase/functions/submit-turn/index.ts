// Supabase Edge Function: authoritative match server for the ranked ladder.
// Identity is a client-generated device UUID (anonymous auth needs a dashboard
// toggle); all table access goes through the service role, clients never
// touch the tables directly.
import { createClient } from '@supabase/supabase-js';
import { handle, HttpError, type Db, type ProfileRow, type MatchRow, type TurnRow } from './core.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeDb(admin: ReturnType<typeof createClient>): Db {
  const one = async <T,>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T | null> => {
    const { data, error } = await q;
    if (error) throw new HttpError(500, JSON.stringify(error));
    return (data as T) ?? null;
  };
  return {
    getProfile: (id) => one<ProfileRow>(admin.from('siege_profiles').select('*').eq('id', id).maybeSingle()),
    upsertProfile: async (p) => { await one(admin.from('siege_profiles').upsert({ ...p, updated_at: new Date().toISOString() })); },
    candidates: async (exclude, rating, n) => {
      const rows = (await one<ProfileRow[]>(admin.from('siege_profiles').select('*').neq('id', exclude).gte('rating', rating - 250).lte('rating', rating + 250).limit(n))) ?? [];
      if (rows.length) return rows;
      return (await one<ProfileRow[]>(admin.from('siege_profiles').select('*').neq('id', exclude).order('rating', { ascending: false }).limit(n))) ?? [];
    },
    createMatch: async (m) => (await one<MatchRow>(admin.from('siege_matches').insert(m).select('*').single()))!,
    getMatch: (id) => one<MatchRow>(admin.from('siege_matches').select('*').eq('id', id).maybeSingle()),
    updateMatch: async (id, patch) => { await one(admin.from('siege_matches').update(patch).eq('id', id)); },
    insertTurn: async (t: TurnRow) => { await one(admin.from('siege_turns').insert(t)); },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = String(body?.deviceId ?? '');
    if (!UUID.test(deviceId)) return json({ error: 'missing deviceId' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const out = await handle(deviceId.toLowerCase(), body, makeDb(admin));
    return json(out);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: String((e as Error).message ?? e) }, status);
  }
});
