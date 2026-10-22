# Siegeworks

A physics-driven, ranked trebuchet duel for phones. Build the machine, read the wind, wreck the other lord's castle. See [DESIGN.md](DESIGN.md).

## Run it

```bash
pnpm install
pnpm test          # simulation + match-server tests (Node)
pnpm dev           # http://localhost:5173 — open on your phone via the LAN URL vite prints
```

Offline play against the AI needs nothing else.

## Online ladder (free Supabase project)

1. Create a project at supabase.com, then in the SQL editor run `supabase/migrations/0001_init.sql`.
2. Enable **anonymous sign-ins** (Authentication → Providers).
3. Deploy the edge function: `supabase functions deploy submit-turn` (or paste the files via the dashboard; include `_shared/sim`).
4. Copy `apps/web/.env.example` to `apps/web/.env.local` with the project URL and anon key.

After editing `packages/sim`, run `pnpm sync-sim` so the edge function gets the same code.

## Phone builds (free)

```bash
cd apps/web && pnpm build
npx cap add ios && npx cap add android   # once
npx cap sync && npx cap open ios         # or android
```
