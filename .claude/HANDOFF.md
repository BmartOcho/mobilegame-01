# HANDOFF — mobilegame-01 (Siegeworks)

**Updated:** 2026-10-22 11:15 CDT · **Branch:** `main` · **HEAD:** `fd78ca8` (PR #5 merged)
**State:** tree clean & pushed · live at https://bmartocho.github.io/mobilegame-01/ (bundle `index-C7DUk04k.js`) · memory updated

## Next steps
1. Playtest two real phones on the public URL: build a kit, Ranked Siege, 4 rounds each, confirm the rating line and the `siege_leaderboard` row in Supabase (project `awhrrlvbyhjvqqazidud`).
2. Retune the Playwright aim constant in the headless test scripts for the 1.7 t stock machine (scripted shots missed the castle on the new ballistics; the AI defender via `packages/sim/src/ai.ts` still hits). Scripts lived in the cloud session's `/tmp/claude-0/*.mjs`; recreate from `apps/web/src/screens/battle.ts` selectors.
3. Phone build: `pnpm --filter web build && npx cap add android` in `apps/web` (Capacitor 7 config already in `apps/web/capacitor.config.ts`).

## Open loops
- [ ] Supabase housekeeping still pending: delete empty `siegeworks` storage bucket, the four `siegeworks static *` storage policies, and the retired `siege-web` edge function (dashboard, project `awhrrlvbyhjvqqazidud`). Tables were wiped 2026-10-22.
- [ ] Ladder tables live in Printssistant-staging (`siege_*` prefix) by decision 2026-10-22; move to a dedicated project once the free-tier cap frees up.
- [ ] Cosmetics / monetization deferred ("free, cosmetics later").

## Gotchas
- Pages serves the `gh-pages` branch built by `.github/workflows/pages.yml` with base `/mobilegame-01/`; the `deploy` job is `continue-on-error` and can be ignored.
- Edge function `submit-turn` is on version 4, `verify_jwt=false`, identity = client device UUID. Redeploy via Supabase MCP `deploy_edge_function` with esbuild bundle + `import_map_path: deno.json` after `scripts/sync-sim.sh`.
- Supabase MCP `execute_sql` deletes on `siege_*` tables time out; use the dashboard SQL editor.
- An 18 cm pine beam snaps above a 1.5 t counterweight; stock is 28 cm pine with 1.7 t (138 m still-air range vs 115 m castle).
- `pkill -f "vite preview"` kills the calling shell; start preview in its own Bash call.

## Pointers
- `DESIGN.md` — physics model, validation anchors, decisions table.
- `README.md` — run / test / deploy.
- `packages/sim/test/validate.ts`, `failure.ts` — the anchors CI enforces.
- `supabase/functions/submit-turn/core.ts` — match server logic.

## Log
- 2026-10-22 11:15 CDT — PR #5 merged (bearing friction, Horsdal anchor, 1.7 t stock CW, budget gate); live build verified; ladder wiped; two-device ranked smoke green on public URL.
- 2026-10-22 ~09:00 CDT — PRs #1–#4 merged: sim, workshop, battle scene, async ranked multiplayer, GitHub Pages hosting.
