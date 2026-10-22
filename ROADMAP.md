# Siegeworks roadmap

**Goal:** a free mobile trebuchet-siege game with realistic launch and aero physics, buildable trebuchets and castles, and an async ranked ladder.

## Now (shipped 2026-10-22)
- Deterministic Rapier sim with drag crisis, Magnus, wind shear + gusts, beam snap, frame tip, bearing friction; three published anchors enforced by `pnpm test`.
- Workshop (4 views + castle), 2.5D battle scene, upgrades gated by treasury.
- Async ranked ladder against ghost-defended kits on Supabase; Elo; public web build on GitHub Pages.

## Next
- Real-phone playtest on the public URL; fix what breaks.
- Retune headless test aim for the 1.7 t stock machine.
- Android/iOS shells via Capacitor.

## Later
- Move `siege_*` tables off Printssistant-staging to a dedicated Supabase project.
- Live (synchronous) matches if async proves too slow for players.
- Cosmetics store; more projectile kinds; castle terrain.
