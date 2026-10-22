# Siegeworks

A physics-driven, ranked trebuchet duel for phones. Build the machine, read the wind, wreck the other lord's castle. See [DESIGN.md](DESIGN.md).

## Run it

```bash
pnpm install
pnpm test          # simulation + match-server tests (Node)
pnpm dev           # http://localhost:5173 — open on your phone via the LAN URL vite prints
```

Offline play against the AI needs nothing else.

## Play it online

- **Web build**: https://bmartocho.github.io/mobilegame-01/ (published from this branch by `.github/workflows/pages.yml` on every push; open it on two phones and hit *Ranked siege*).
- **Ladder server**: the `submit-turn` edge function and `siege_*` tables live in the Supabase project `awhrrlvbyhjvqqazidud` (currently the Printssistant-staging project; move them with the steps below when you have a dedicated project).

## Ladder server setup (any free Supabase project)

1. In the SQL editor run `supabase/migrations/0001_init.sql`.
2. Deploy the edge function: `supabase functions deploy submit-turn --no-verify-jwt` (identity is a device UUID checked inside the function; swap to anonymous auth once that provider is enabled).
3. Put the project URL and anon key in `apps/web/.env.local` (see `.env.example`) and in the workflow's build env.

After editing `packages/sim`, run `pnpm sync-sim` so the edge function gets the same code, then redeploy it.

## Phone builds (free)

```bash
cd apps/web && pnpm build
npx cap add ios && npx cap add android   # once
npx cap sync && npx cap open ios         # or android
```
