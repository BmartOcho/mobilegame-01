import { Application, Graphics } from 'pixi.js';
import { initPhysics, rankName, trebuchetCost, castleCost, PROJECTILES } from '@siege/sim';
import type { AppCtx } from './app';
import { showBuild } from './screens/build';
import { showBattle } from './screens/battle';
import { showMenu } from './screens/menu';
import { makeAiOpponent } from './ai';
import { profile, save } from './state';
import { eloDelta } from '@siege/sim';
import { net } from './net';

async function boot() {
  const app = new Application();
  await app.init({ resizeTo: window, antialias: true, backgroundAlpha: 1, background: 0x1b1a26, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
  document.getElementById('stage')!.appendChild(app.canvas);
  const gfx = new Graphics();
  app.stage.addChild(gfx);
  const R = await initPhysics();
  const ctx: AppCtx = { app, R, ui: document.getElementById('ui')!, gfx, tick: null };
  let time = 0;
  app.ticker.add((t) => { const dt = Math.min(0.05, t.deltaMS / 1000); time += dt; ctx.tick?.(dt, time); });

  const toMenu = () => showMenu(ctx, {
    practice: () => startBattle(false),
    ranked: () => startBattle(true),
    build: () => showBuild(ctx, () => startBattle(false), toMenu),
  });

  function kitCost() {
    return trebuchetCost(profile.trebuchet) + castleCost(profile.castle) + PROJECTILES[profile.projectile.kind].cost + Math.round(profile.projectile.mass * 2);
  }

  async function startBattle(ranked: boolean) {
    // The treasury gate lives here as well as on the workshop button, so no path into a match skips it.
    if (kitCost() > profile.gold) {
      alert(`Your kit costs ${Math.round(kitCost())} g but the treasury holds ${Math.round(profile.gold)} g. Trim the design in the workshop first.`);
      showBuild(ctx, () => startBattle(false), toMenu);
      return;
    }
    let seed = `${profile.id}:${Date.now()}`;
    let opponent = makeAiOpponent(R, profile.rating, seed);
    if (ranked) {
      try {
        const remote = await net.findOpponent(profile);
        if (remote) { opponent = remote.opponent; seed = remote.seed; }
        else { ranked = false; alert('No other lords on the ladder yet — practising against the AI instead.'); }
      } catch (e) { ranked = false; alert(`Ladder unavailable (${String((e as Error).message)}) — practising against the AI instead.`); }
    }
    showBattle(ctx, opponent, { ranked, seed }, async (summary) => {
      const score = summary.won === null ? 0.5 : summary.won ? 1 : 0;
      let delta = eloDelta(profile.rating, opponent.rating, score, profile.games);
      const reward = (summary.won ? 260 : summary.won === null ? 150 : 90) + Math.round(summary.damageDealt / 150);
      if (ranked && opponent.settle) {
        const end = await opponent.settle(summary.natural).catch(() => undefined);
        if (end) { delta = end.delta; profile.rating = end.rating - end.delta; }
      }
      profile.rating += delta; profile.games++; if (summary.won) profile.wins++; profile.gold += reward;
      save();
      showMenu(ctx, {
        practice: () => startBattle(false), ranked: () => startBattle(true), build: () => showBuild(ctx, () => startBattle(false), toMenu),
      }, { summary, delta, reward, rank: rankName(profile.rating) });
    });
  }

  toMenu();
}

boot().catch((e) => { console.error(e); document.getElementById('ui')!.innerHTML = `<div class="modal"><div class="card"><h1>Failed to start</h1><p>${String(e)}</p></div></div>`; });
