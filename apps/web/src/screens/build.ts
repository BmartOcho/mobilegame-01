import { Graphics } from 'pixi.js';
import {
  BEAM_MATERIALS, FRAME_MATERIALS, PROJECTILES, BLOCK_MATERIALS, LIMITS,
  trebuchetCost, castleCost, beamMass, cockedPose, layoutCastle, G, runShot, freshCastleState, DEFAULT_CASTLE,
  type BeamMaterial, type FrameMaterial, type ProjectileKind, type BlockMaterial,
} from '@siege/sim';
import type { AppCtx } from '../app';
import { profile, save } from '../state';
import { el, slider, chips, button, fmtGold } from '../ui';
import { drawTrebuchet, poseFromStatic } from '../render/trebuchet';
import { PALETTE, shade, rotRect } from '../render/draw';
import { Camera } from '../render/camera';

type View = 'side' | 'front' | 'back' | 'top' | 'castle';

export function showBuild(ctx: AppCtx, onBattle: () => void, onMenu: () => void) {
  const ui = ctx.ui;
  ui.innerHTML = '';
  let view: View = 'side';

  // ---- Top bar
  const top = el('div', 'topbar');
  const title = el('div', 'title', 'Siegeworks · Workshop');
  const goldPill = el('div', 'pill');
  top.append(button('‹ Menu', '', onMenu), title, goldPill);
  ui.append(top, el('div', 'spacer'));

  // ---- Panel
  const panel = el('div', 'panel');
  const tabs = el('div', 'tabs');
  const tabDefs: { id: View; label: string }[] = [
    { id: 'side', label: 'Side' }, { id: 'front', label: 'Front' }, { id: 'back', label: 'Back' }, { id: 'top', label: 'Top' }, { id: 'castle', label: 'Castle' },
  ];
  const tabButtons = new Map<View, HTMLButtonElement>();
  for (const t of tabDefs) {
    const b = button(t.label, t.id === view ? 'active' : '', () => { view = t.id; for (const [k, x] of tabButtons) x.classList.toggle('active', k === view); renderControls(); });
    tabButtons.set(t.id, b); tabs.append(b);
  }
  const controls = el('div');
  const gauges = el('div', 'gauges');
  const costRow = el('div', 'cost');
  const go = button('To battle', 'big primary', () => { save(); onBattle(); });
  panel.append(tabs, controls, gauges, costRow, go);
  ui.append(panel);

  const T = profile.trebuchet, P = profile.projectile, C = profile.castle;

  function totalCost() {
    return trebuchetCost(T) + castleCost(C) + PROJECTILES[P.kind].cost + Math.round(P.mass * 2);
  }
  function estimate() {
    const pose = cockedPose(T, P);
    const drop = T.shortArm * (1 + Math.sin(pose.cockAngle)) + T.hangerLength * 0.3;
    const pe = T.counterweightMass * G * drop;
    const eff = 0.5 / (1 + beamMass(T) / (T.counterweightMass * 2));
    const v = Math.sqrt((2 * eff * pe) / (P.mass + beamMass(T) * 0.12));
    return { v, range: (v * v) / G * 0.8 };
  }
  // Proof-fire the design headlessly to read peak beam stress and frame overturning.
  let proofTimer: number | undefined;
  const proofCastle = freshCastleState(DEFAULT_CASTLE, 900);
  function scheduleProof() {
    clearTimeout(proofTimer);
    proofTimer = window.setTimeout(() => {
      const r = runShot(ctx.R, { trebuchet: T, projectile: P, aim: { releaseAngleDeg: 35 }, wind: { base: 0, gustiness: 0, seed: 1 } }, proofCastle, { stopAtImpact: true });
      const bar = (label: string, v: number, hint: string) => {
        const pct = Math.min(100, Math.round(v * 100));
        const cls = v >= 1 ? 'bad' : v > 0.75 ? 'warn' : 'good';
        return `<div class="gauge ${cls}"><div class="gl"><span>${label}</span><span>${pct}%${v >= 1 ? ' — ' + hint : ''}</span></div><div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
      };
      const rangeTxt = r.failure ? (r.failure.kind === 'beam' ? 'Beam snaps mid-swing' : r.failure.kind === 'tip' ? 'Frame tips over' : 'Counterweight strikes the ground') : `Proof shot: ${r.release?.speed.toFixed(0) ?? '–'} m/s, ${r.range.toFixed(0)} m still air`;
      gauges.innerHTML = bar(`Beam stress (${T.beamMaterial})`, r.peakStress, 'snaps') + (T.wheels ? '' : bar('Frame overturn', r.peakTip, 'tips')) + `<div class="small ${r.failure ? 'bad' : ''}">${rangeTxt}</div>`;
    }, 120);
  }
  function refreshCost() {
    scheduleProof();
    const c = totalCost();
    const over = c > profile.gold;
    const est = estimate();
    costRow.innerHTML = `<span>Kit cost <b class="${over ? 'over' : ''}">${fmtGold(c)}</b> / treasury <b>${fmtGold(profile.gold)}</b></span><span>≈ ${est.v.toFixed(0)} m/s · ${est.range.toFixed(0)} m still air</span>`;
    goldPill.innerHTML = `Treasury <b>${fmtGold(profile.gold)}</b>`;
    go.disabled = over;
    go.textContent = over ? 'Over budget' : 'To battle';
  }

  function renderControls() {
    controls.innerHTML = '';
    if (view === 'castle') {
      controls.append(el('h2', undefined, 'Castle works'));
      controls.append(chips<BlockMaterial>(
        (Object.keys(BLOCK_MATERIALS) as BlockMaterial[]).map((m) => ({ id: m, label: BLOCK_MATERIALS[m].label, sub: fmtGold(BLOCK_MATERIALS[m].cost) })),
        C.material, (m) => { C.material = m; refreshCost(); save(); }));
      controls.append(slider('Wall height', 2, 12, 1, C.wallHeight, (v) => `${v} rows`, (v) => { C.wallHeight = v; refreshCost(); }).row);
      controls.append(slider('Tower height', 4, 18, 1, C.towerHeight, (v) => `${v} rows`, (v) => { C.towerHeight = v; refreshCost(); }).row);
      controls.append(slider('Keep height', 0, 8, 1, C.keepHeight, (v) => `${v} rows`, (v) => { C.keepHeight = v; refreshCost(); }).row);
      controls.append(slider('Towers', 2, 4, 1, C.towers, (v) => `${v}`, (v) => { C.towers = v; refreshCost(); }).row);
      controls.append(chips<'1' | '2'>([{ id: '1', label: 'Single wall' }, { id: '2', label: 'Double wall', sub: '+80% wall health' }], String(C.wallThickness) as '1' | '2', (v) => { C.wallThickness = v === '2' ? 2 : 1; refreshCost(); }));
      return;
    }
    controls.append(el('h2', undefined, 'Engine'));
    controls.append(slider('Axle height', ...LIMITS.pivotHeight, 0.1, T.pivotHeight, (v) => `${v.toFixed(1)} m`, (v) => { T.pivotHeight = v; refreshCost(); }).row);
    controls.append(slider('Long arm', ...LIMITS.longArm, 0.1, T.longArm, (v) => `${v.toFixed(1)} m`, (v) => { T.longArm = v; refreshCost(); }).row);
    controls.append(slider('Short arm', ...LIMITS.shortArm, 0.1, T.shortArm, (v) => `${v.toFixed(1)} m`, (v) => { T.shortArm = v; refreshCost(); }).row);
    controls.append(slider('Beam section', ...LIMITS.beamThickness, 0.01, T.beamThickness, (v) => `${(v * 100).toFixed(0)} cm`, (v) => { T.beamThickness = v; refreshCost(); }).row);
    controls.append(chips<BeamMaterial>((Object.keys(BEAM_MATERIALS) as BeamMaterial[]).map((m) => ({ id: m, label: m[0].toUpperCase() + m.slice(1), sub: `${BEAM_MATERIALS[m].density} kg/m³` })), T.beamMaterial, (m) => { T.beamMaterial = m; refreshCost(); }));
    controls.append(el('h2', undefined, 'Counterweight & sling'));
    controls.append(slider('Counterweight', ...LIMITS.counterweightMass, 50, T.counterweightMass, (v) => `${v.toFixed(0)} kg`, (v) => { T.counterweightMass = v; refreshCost(); }).row);
    controls.append(slider('Hanger', ...LIMITS.hangerLength, 0.1, T.hangerLength, (v) => (v === 0 ? 'fixed' : `${v.toFixed(1)} m`), (v) => { T.hangerLength = v; refreshCost(); }).row);
    controls.append(slider('Sling', ...LIMITS.slingLength, 0.1, T.slingLength, (v) => `${v.toFixed(1)} m`, (v) => { T.slingLength = v; refreshCost(); }).row);
    controls.append(el('h2', undefined, 'Frame'));
    controls.append(chips<FrameMaterial>((Object.keys(FRAME_MATERIALS) as FrameMaterial[]).map((m) => ({ id: m, label: m[0].toUpperCase() + m.slice(1), sub: fmtGold(FRAME_MATERIALS[m].cost) })), T.frameMaterial, (m) => { T.frameMaterial = m; refreshCost(); }));
    controls.append(chips<'fixed' | 'wheels'>([{ id: 'fixed', label: 'Staked frame' }, { id: 'wheels', label: 'Wheeled', sub: 'rolls, +efficiency' }], T.wheels ? 'wheels' : 'fixed', (v) => { T.wheels = v === 'wheels'; refreshCost(); }));
    controls.append(el('h2', undefined, 'Projectile'));
    const massSlider = slider('Mass', PROJECTILES[P.kind].minMass, PROJECTILES[P.kind].maxMass, 1, P.mass, (v) => `${v} kg`, (v) => { P.mass = v; refreshCost(); });
    controls.append(chips<ProjectileKind>((Object.keys(PROJECTILES) as ProjectileKind[]).map((k) => ({ id: k, label: PROJECTILES[k].label, sub: `Cd ${PROJECTILES[k].cd}` })), P.kind, (k) => {
      P.kind = k; const pp = PROJECTILES[k]; P.mass = Math.max(pp.minMass, Math.min(pp.maxMass, P.mass));
      massSlider.input.min = String(pp.minMass); massSlider.input.max = String(pp.maxMass); massSlider.set(P.mass); refreshCost();
    }));
    controls.append(massSlider.row);
  }

  renderControls();
  refreshCost();

  // ---- Pixi view
  const cam = new Camera();
  const g: Graphics = ctx.gfx;
  ctx.tick = (dt, time) => {
    const W = ctx.app.screen.width, H = ctx.app.screen.height;
    cam.resize(W, H);
    g.clear();
    g.rect(0, 0, W, H).fill(0x242033);
    // grid paper
    for (let x = 0; x < W; x += 24) g.rect(x, 0, 1, H).fill({ color: 0xffffff, alpha: 0.035 });
    for (let y = 0; y < H; y += 24) g.rect(0, y, W, 1).fill({ color: 0xffffff, alpha: 0.035 });

    const viewH = H * 0.40;
    cam.horizon = (viewH - 14) / H;
    if (view === 'castle') {
      const layout = layoutCastle(C, 0);
      const span = Math.max(layout.width + 4, 12);
      const tall = Math.max(C.towerHeight * 0.6 + 2, (C.wallHeight + C.keepHeight) * 0.6 + 3);
      cam.zoom = Math.min((W - 32) / span, (viewH - 70) / tall);
      cam.x = layout.width / 2; cam.y = 0;
      g.rect(0, cam.sy(0), W, 6).fill(0x3a3448);
      for (const b of layout.blocks) {
        if (b.kind === 'banner') { rotRect(g, cam, b.x, b.y, b.w, b.h, 0, 0x4a3b2a); rotRect(g, cam, b.x + 0.55, b.y + 0.35, 1, 0.45, 0, 0xc8553d); continue; }
        const col = PALETTE[b.material];
        rotRect(g, cam, b.x, b.y, b.w, b.h, 0, b.kind === 'keep' ? shade(col, 1.08) : col, { color: shade(col, 0.5) });
      }
      return;
    }
    const { geo, pose } = poseFromStatic(T, P);
    const span = Math.max(T.longArm * 2 + 4, T.pivotHeight * 1.6 + 4, 14);
    const tall = T.pivotHeight + Math.max(T.shortArm, 1) + 2.5;
    cam.zoom = Math.min((W - 32) / span, (viewH - 70) / tall);
    cam.x = 0; cam.y = 0;
    if (view === 'side') {
      g.rect(0, cam.sy(0), W, 6).fill(0x3a3448);
      drawTrebuchet(g, cam, geo, pose, T, P);
      return;
    }
    const depth = T.pivotHeight * 0.5; // distance between the two A-frames
    const frameCol = PALETTE[T.frameMaterial];
    const beamCol = PALETTE[T.beamMaterial];
    if (view === 'front' || view === 'back') {
      g.rect(0, cam.sy(0), W, 6).fill(0x3a3448);
      const sillY = T.wheels ? 0.7 : 0.15;
      // Wheels (behind)
      if (T.wheels) for (const sx of [-1, 1]) g.circle(cam.sx(sx * (depth / 2 + 0.3)), cam.sy(0.55), 0.55 * cam.zoom).fill(shade(frameCol, 0.6));
      // Two A-frames
      for (const sx of [-1, 1]) {
        const fx = sx * depth / 2;
        rotRect(g, cam, fx, sillY, 1.4, 0.3, 0, shade(frameCol, 0.85));
        for (const leg of [-1, 1]) {
          const bx = fx + leg * 0.6, by = sillY, px = fx + leg * 0.12, py = T.pivotHeight;
          rotRect(g, cam, (bx + px) / 2, (by + py) / 2, Math.hypot(px - bx, py - by), 0.26, Math.atan2(py - by, px - bx), frameCol, { color: shade(frameCol, 0.6) });
        }
      }
      // Axle across
      rotRect(g, cam, 0, T.pivotHeight, depth + 0.8, 0.22, 0, PALETTE.iron_dark);
      // Beam end-on
      rotRect(g, cam, 0, T.pivotHeight, T.beamThickness, T.beamThickness * 1.1, 0, beamCol, { color: shade(beamCol, 0.5) });
      if (view === 'front') {
        // Counterweight hangs high in front; hanger
        if (T.hangerLength > 0) rotRect(g, cam, 0, (pose.beam.y + pose.cw.y + geo.cwHalf) / 2, 0.12, Math.abs(pose.beam.y - (pose.cw.y + geo.cwHalf)), 0, PALETTE.iron_dark);
        rotRect(g, cam, 0, pose.cw.y, geo.cwHalf * 2, geo.cwHalf * 2, 0, PALETTE.cw, { color: PALETTE.iron_dark, width: 2 });
        // Projectile in trough, nearest the viewer
        g.circle(cam.sx(0), cam.sy(pose.proj.y), geo.projectileRadius * cam.zoom).fill(PALETTE[P.kind]);
        g.rect(cam.sx(-0.45), cam.sy(0.1), 0.9 * cam.zoom, 0.1 * cam.zoom).fill(shade(frameCol, 0.7));
      } else {
        // Back: beam tip low, sling pouch and projectile on the trough
        const tip = pose.beam; const tipY = T.pivotHeight - Math.abs(Math.sin(pose.beam.angle)) * T.longArm;
        void tip;
        rotRect(g, cam, 0, Math.max(0.3, tipY), T.beamThickness, T.beamThickness * 1.1, 0, shade(beamCol, 0.9), { color: shade(beamCol, 0.5) });
        g.moveTo(cam.sx(0), cam.sy(Math.max(0.3, tipY))).lineTo(cam.sx(0), cam.sy(pose.proj.y)).stroke({ color: PALETTE.rope, width: 2 });
        g.circle(cam.sx(0), cam.sy(pose.proj.y), geo.projectileRadius * cam.zoom).fill({ color: PALETTE[P.kind], alpha: 0.85 });
        // Counterweight peeks above the axle
        rotRect(g, cam, 0, pose.cw.y, geo.cwHalf * 2, geo.cwHalf * 2, 0, shade(PALETTE.cw, 0.8), { color: PALETTE.iron_dark, width: 2 });
      }
      return;
    }
    // Top view: x along screen x, depth along screen y; centred on the axle.
    const cy = 30 + viewH / 2;
    const Z = (z: number) => cy - z * cam.zoom; // depth axis
    const X = (x: number) => cam.sx(x);
    const halfSpan = T.pivotHeight * 0.55;
    for (const sz of [-1, 1]) {
      g.rect(X(-halfSpan), Z(sz * depth / 2) - 0.15 * cam.zoom, halfSpan * 2 * cam.zoom, 0.3 * cam.zoom).fill(frameCol);
      if (T.wheels) for (const sx of [-1, 1]) g.rect(X(sx * halfSpan * 0.8) - 0.2 * cam.zoom, Z(sz * (depth / 2 + 0.3)) - 0.55 * cam.zoom, 0.4 * cam.zoom, 1.1 * cam.zoom).fill(shade(frameCol, 0.6));
    }
    g.rect(X(-0.11), Z(depth / 2 + 0.4), 0.22 * cam.zoom, (depth + 0.8) * cam.zoom).fill(PALETTE.iron_dark);
    // Trough
    g.rect(X(-T.longArm * 0.9), Z(0.45), T.longArm * 1.6 * cam.zoom, 0.9 * cam.zoom).fill({ color: shade(frameCol, 0.5), alpha: 0.7 });
    // Beam from short end (front, +x) to tip (back, -x) — projected lengths
    const c = Math.cos(pose.beam.angle);
    const tipX = T.longArm * c, shortX = -T.shortArm * c;
    g.rect(X(Math.min(tipX, shortX)), Z(T.beamThickness / 2), Math.abs(tipX - shortX) * cam.zoom, T.beamThickness * cam.zoom).fill(beamCol);
    // Counterweight square
    g.rect(X(pose.cw.x - geo.cwHalf), Z(geo.cwHalf), geo.cwHalf * 2 * cam.zoom, geo.cwHalf * 2 * cam.zoom).fill(PALETTE.cw).stroke({ color: PALETTE.iron_dark, width: 2 });
    // Sling + projectile
    g.moveTo(X(tipX), Z(0)).lineTo(X(pose.proj.x), Z(0)).stroke({ color: PALETTE.rope, width: 2 });
    g.circle(X(pose.proj.x), Z(0), geo.projectileRadius * cam.zoom).fill(PALETTE[P.kind]);
    void dt; void time;
  };
}
