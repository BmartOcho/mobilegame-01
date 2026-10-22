import type { AppCtx } from '../app';
import { profile, save } from '../state';
import { el, button, fmtGold } from '../ui';
import { rankName } from '@siege/sim';
import type { MatchSummary } from '../opponent';
import { Camera } from '../render/camera';
import { drawBackdrop } from '../render/scene';
import { drawTrebuchet, poseFromStatic } from '../render/trebuchet';
import { net } from '../net';

export interface MenuActions { practice: () => void; ranked: () => void; build: () => void }
export interface LastResult { summary: MatchSummary; delta: number; reward: number; rank: string }

export function showMenu(ctx: AppCtx, actions: MenuActions, last?: LastResult) {
  const ui = ctx.ui;
  ui.innerHTML = '';
  const modal = el('div', 'modal');
  const card = el('div', 'card');
  if (last) {
    const s = last.summary;
    const verdict = s.won === null ? 'Stalemate' : s.won ? 'Victory!' : 'Defeat';
    card.append(el('h1', undefined, verdict));
    card.append(el('p', undefined, `vs ${s.opponent.name} · ${s.rounds} rounds · your castle ${(s.myIntegrity * 100).toFixed(0)}% · theirs ${(s.theirIntegrity * 100).toFixed(0)}%`));
    card.append(el('p', undefined, `Rating ${last.delta >= 0 ? '+' : ''}${last.delta} → <b>${profile.rating}</b> (${last.rank}) · +${fmtGold(last.reward)} plunder`));
  } else {
    card.append(el('h1', undefined, 'Siegeworks'));
    card.append(el('p', undefined, 'Build a trebuchet. Read the wind. Bring down their walls before they bring down yours.'));
  }
  const nameRow = el('div', 'row');
  const nameIn = el('input'); nameIn.value = profile.name; nameIn.style.flex = '1'; nameIn.style.font = 'inherit'; nameIn.style.padding = '8px'; nameIn.style.borderRadius = '8px'; nameIn.style.border = '1px solid rgba(255,255,255,0.1)'; nameIn.style.background = 'rgba(0,0,0,0.3)'; nameIn.style.color = 'inherit';
  nameIn.addEventListener('change', () => { profile.name = nameIn.value.slice(0, 24) || profile.name; save(); });
  nameRow.append(el('label', undefined, 'Banner'), nameIn);
  card.append(nameRow);
  card.append(el('p', 'small', `${rankName(profile.rating)} · rating ${profile.rating} · ${profile.wins}/${profile.games} won · treasury ${fmtGold(profile.gold)}`));
  const stack = el('div', 'stack');
  const rankedBtn = button(net.enabled ? 'Ranked siege (online)' : 'Ranked siege (server not configured)', 'big primary', actions.ranked);
  rankedBtn.disabled = !net.enabled;
  stack.append(rankedBtn, button('Practice vs. AI lord', 'big', actions.practice), button('Workshop & castle', 'big', actions.build));
  card.append(stack);
  const lb = el('div');
  card.append(lb);
  if (net.enabled) net.leaderboard().then((rows) => {
    if (!rows.length) return;
    const t = el('table', 'lb');
    t.innerHTML = '<tr><td class="small">Leaderboard</td><td></td></tr>' + rows.map((r, i) => `<tr><td>${i + 1}. ${r.name}</td><td>${r.rating}</td></tr>`).join('');
    lb.append(t);
  }).catch(() => {});
  modal.append(card);
  ui.append(modal);

  const cam = new Camera();
  ctx.tick = (_dt, time) => {
    const W = ctx.app.screen.width, H = ctx.app.screen.height;
    cam.resize(W, H); cam.horizon = 0.9;
    cam.zoom = Math.min(W / 26, H / 30); cam.x = 2; cam.y = 0;
    ctx.gfx.clear();
    drawBackdrop(ctx.gfx, cam, time);
    const { geo, pose } = poseFromStatic(profile.trebuchet, profile.projectile);
    drawTrebuchet(ctx.gfx, cam, geo, pose, profile.trebuchet, profile.projectile);
  };
}
