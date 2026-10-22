# Siegeworks — design & architecture

Build a trebuchet, read the wind, bring down the other lord's castle before they bring down yours. Mobile-first, ranked, physics-driven.

## Decisions (and why)

| Area | Choice | Why |
|---|---|---|
| Stack | TypeScript, Vite, PixiJS 8 | Free, runs in any browser tonight, wraps to iOS/Android with Capacitor. No editor licence, no build farm. |
| Physics | Rapier 2D **deterministic** build (WASM) | Same bits run in the browser and on the server, so the client's preview equals the server's truth and the server can re-simulate every shot in ~0.4 s. |
| Backend | Supabase free tier (Postgres + anon auth + edge functions) | One free service covers the ladder, match records and the authoritative simulation. Compat build embeds the WASM, so no Docker/static-file step. |
| Multiplayer | Async ranked sieges | You attack another real player's stored castle with your machine; the server pilots their stored machine against your castle with a seeded AI. Both ratings move. No lag, no disconnects, server-authoritative. Live turn-by-turn is a later layer on the same `turns` table. |
| Camera | Build: stylized 2D with Side/Front/Back/Top. Battle: 2.5D side view with parallax | Side view is the clearest read of trajectory, wind and the sling release. |
| Monetization | Free; cosmetics later | Ranked fairness first. Upgrades are gated by a treasury that grows with play. |

## Simulation (packages/sim)

Everything in SI units at 120 Hz fixed step. One `ShotSim` = one shot, from cocked machine to settled rubble.

**Trebuchet** — parametric: axle height, long/short arm, beam section and wood (mass and inertia derive from density), counterweight mass (box sized from rubble density), hanger length (0 = fixed counterweight), sling length, staked or wheeled frame. Built as Rapier rigid bodies: revolute axle, revolute hinged counterweight, rope joint sling (slack until taut), wheels as revolute balls. The sling leaves the finger when the sling–beam angle drops below the player's **release pin angle**: the sole aiming control besides the cocking angle. Launch speed and angle are emergent, not scripted.

**Aerodynamics** — every step the projectile gets quadratic drag `½ρC_dA|v_rel|v_rel` against the local wind, plus Magnus lift from its spin. Projectile kinds differ in density (radius), C_d and hardness. Wind is a power-law shear profile (`(h/10m)^0.14`) times (mean + seeded gusts), identical for both players in a round.

**Castle** — procedural from a config (material, wall/tower/keep rows, towers, thickness): dry-stacked blocks in running bond with a banner on the keep. Damage is energy-based: on a collision start the relative pre-impact kinetic energy (reduced mass) is charged against block health (toughness × volume), a projectile hit also shocks neighbours. Integrity = value-weighted health of blocks still **standing**; toppled blocks count for nothing, so hitting high and shoving a tower over is as good as pulverising it. A castle falls at 40 %.

**Determinism** — the deterministic Rapier build, integer-only PRNG, and stored block poses mean `runShot(input, castle)` gives bit-identical results in the browser and in the Deno edge function (tested).

## Match flow

1. Workshop: tune machine (four views) and castle within the treasury.
2. Battle, up to 4 rounds. Each round: shared wind; you aim (release pin, cocking angle) and loose; the shot plays with slow-motion on release, impact and shatter; then the opponent's shot plays mirrored.
3. Castle at ≤ 40 % loses immediately; otherwise higher integrity after 4 rounds wins. Elo (K tapering 48→24) and plunder gold.

Offline the opponent is an AI lord whose kit scales with your rating. Online (`VITE_SUPABASE_*` set) matchmaking picks a real player's kit within ±250 rating; the edge function `submit-turn` owns the match state, re-simulates each shot, settles ratings for both players and refuses out-of-order or foreign requests.

## Repo layout

```
packages/sim            shared simulation (client + server), tests: pnpm test
apps/web                PixiJS client, HTML overlay UI; pnpm dev
supabase/migrations     ladder schema with RLS
supabase/functions      submit-turn edge function (+ _shared/sim copy via scripts/sync-sim.sh)
```

## Roadmap

- [ ] Live turn-by-turn sieges (both players submit aims; server queues turns).
- [ ] Beam snapping above its bending stress; counterweight hitting the ground as a build failure.
- [ ] Projectile variety: firepot burn-over-time on timber, cluster shot.
- [ ] Castle art pass (textures, mortar, smoke), ambient sound, haptics on impact.
- [ ] Seasons / rank tiers gating upgrade budgets; cosmetics.
- [ ] Capacitor builds + store listings.
