import { Graphics } from 'pixi.js';
import {
  createShot, freshCastleState, computeIntegrity, layoutCastle, DT, LIMITS, cockedPose, matchWind, matchOutcome, MAX_ROUNDS, LOSE_AT,
  type CastleState, type ShotSim, type ShotInput, type RenderState, type AimInput,
} from '@siege/sim';
import type { AppCtx } from '../app';
import { profile } from '../state';
import { el, slider, button } from '../ui';
import { Camera } from '../render/camera';
import { drawBackdrop, Particles } from '../render/scene';
import { drawTrebuchet, drawBlocks, drawBeamPiece, poseFromRender, poseAtBeamAngle, type TrebGeo, type TrebPose } from '../render/trebuchet';
import { PALETTE } from '../render/draw';
import type { Opponent, MatchSummary } from '../opponent';

type Phase = 'aim' | 'firing' | 'enemy-aim' | 'enemy-firing' | 'between' | 'over';

export interface BattleOptions { ranked: boolean; seed: string }

export function showBattle(ctx: AppCtx, opp: Opponent, opts: BattleOptions, onEnd: (s: MatchSummary) => void) {
  const ui = ctx.ui;
  const R = ctx.R;
  ui.innerHTML = '';

  // ---------------- match state
  let round = 1;
  let phase: Phase = 'aim';
  let myCastle: CastleState = freshCastleState(profile.castle);
  let theirCastle: CastleState = freshCastleState(opp.castle);
  const myLayout = layoutCastle(profile.castle), theirLayout = layoutCastle(opp.castle);
  let damageDealt = 0;
  const windFor = (r: number) => matchWind(opts.seed, r);
  let wind = windFor(round);
  const aim: AimInput = { releaseAngleDeg: 40 };
  const maxCock = () => (cockedPose(profile.trebuchet, profile.projectile).cockAngle * 180) / Math.PI;

  // ---------------- HUD
  const top = el('div', 'topbar');
  const roundPill = el('div', 'pill');
  const windPill = el('div', 'pill');
  top.append(button('✕', '', () => finish(false)), roundPill, windPill);
  const hud = el('div', 'hud');
  const bars = el('div', 'bars');
  const myBar = el('div', 'bar', `<div>${profile.name}</div><div class="track"><div class="fill"></div></div>`);
  const theirBar = el('div', 'bar enemy', `<div>${opp.name}</div><div class="track"><div class="fill"></div></div>`);
  bars.append(myBar, theirBar);
  const toast = el('div', 'toast'); toast.style.display = 'none';
  hud.append(bars, toast);
  ui.append(top, hud, el('div', 'spacer'));
  const panel = el('div', 'panel');
  ui.append(panel);

  function setToast(msg: string, ms = 2200) {
    toast.innerHTML = msg; toast.style.display = '';
    if (ms > 0) setTimeout(() => { if (toast.innerHTML === msg) toast.style.display = 'none'; }, ms);
  }
  function refreshBars() {
    (myBar.querySelector('.fill') as HTMLElement).style.width = `${(myCastle.integrity * 100).toFixed(0)}%`;
    (theirBar.querySelector('.fill') as HTMLElement).style.width = `${(theirCastle.integrity * 100).toFixed(0)}%`;
    roundPill.innerHTML = `Round <b>${round}</b>/${MAX_ROUNDS}`;
  }
  function refreshWind(w: number) {
    const dir = w > 0.3 ? '→ tail' : w < -0.3 ? '← head' : '· calm';
    windPill.innerHTML = `Wind <b>${Math.abs(w).toFixed(1)} m/s</b> ${dir}`;
  }

  // ---------------- sim + render
  const cam = new Camera();
  const g: Graphics = ctx.gfx;
  const particles = new Particles();
  let sim: ShotSim | null = null;
  let geo: TrebGeo | null = null;
  let kinds = new Map<number, string>();
  let shooterIsMe = true;
  let acc = 0;
  let timeScale = 1;
  let slowUntil = 0;
  let lastDestroyed = 0;
  let impactSeen = false;
  let failureSeen = false;
  let trace: number[][] = [];
  let lastTraceMine: number[][] = [];
  let lastTraceTheirs: number[][] = [];
  let shooterInput: ShotInput | null = null;
  let frameState: RenderState | null = null;
  let status: HTMLElement | null = null;
  // Setup animation: winch the arm down, slide the stone into the pouch, pin it.
  let setup: { t: number; done: () => void } | null = null;
  const SETUP_WINCH = 1.8, SETUP_LOAD = 1.0, SETUP_HOLD = 0.5;
  const SETUP_TOTAL = SETUP_WINCH + SETUP_LOAD + SETUP_HOLD;
  function startSetup(done: () => void) {
    setup = { t: 0, done };
    panel.innerHTML = '';
    status = el('p', 'small', shooterIsMe ? 'Winching the arm down…' : `${opp.name}'s crew is winching…`);
    panel.append(status);
  }
  const ease = (f: number) => (f < 0 ? 0 : f > 1 ? 1 : f * f * (3 - 2 * f));
  function setupPose(st: RenderState): TrebPose {
    const base = poseFromRender(st);
    if (!setup || !geo) return base;
    const rest = Math.PI / 2 - 0.35; // long arm up, leaning toward the target
    let cocked = st.beam.angle; // Rapier reports (-pi, pi]; winch must go the long way over the top
    while (cocked < rest) cocked += Math.PI * 2;
    const halfSpan = geo.pivotHeight * 0.55;
    const pile = { x: -halfSpan - 2.2, y: geo.projectileRadius };
    const t = setup.t;
    if (t < SETUP_WINCH) {
      const f = ease(t / SETUP_WINCH);
      const phi = rest + (cocked - rest) * f;
      const p = poseAtBeamAngle(geo, phi, base);
      return { ...p, proj: { ...base.proj, x: pile.x, y: pile.y }, slingAlpha: 0 };
    }
    if (t < SETUP_WINCH + SETUP_LOAD) {
      const f = ease((t - SETUP_WINCH) / SETUP_LOAD);
      const px = pile.x + (base.proj.x - pile.x) * f;
      return { ...base, proj: { ...base.proj, x: px, y: pile.y, angle: -(px - pile.x) / geo.projectileRadius }, slingAlpha: f };
    }
    return { ...base, slingAlpha: 1 };
  }

  function makeSim(input: ShotInput, castle: CastleState) {
    failureSeen = false;
    sim?.free();
    sim = createShot(R, input, castle);
    const gg = sim.geometry();
    geo = { ...gg };
    kinds = sim.blockKinds();
    frameState = sim.render();
    acc = 0; lastDestroyed = 0; impactSeen = false; trace = [];
  }

  function previewMine() {
    shooterIsMe = true; cam.flip = false;
    shooterInput = { trebuchet: profile.trebuchet, projectile: profile.projectile, aim: { ...aim }, wind };
    makeSim(shooterInput, theirCastle);
  }

  function showAimPanel() {
    panel.innerHTML = '';
    panel.append(el('h2', undefined, `Your shot · ${profile.projectile.mass} kg ${profile.projectile.kind}`));
    panel.append(slider('Release pin', ...LIMITS.releaseAngleDeg, 1, aim.releaseAngleDeg, (v) => `${v}°`, (v) => { aim.releaseAngleDeg = v; previewMine(); }).row);
    const mc = maxCock();
    panel.append(slider('Cocking angle', 10, Math.max(10.5, mc), 0.5, aim.cockAngleDeg ?? mc, (v) => `${v.toFixed(0)}°`, (v) => { aim.cockAngleDeg = v; previewMine(); }).row);
    panel.append(el('p', 'small', 'Smaller pin angle = later release = flatter, faster. Wind pushes the stone the whole flight; check the sock.'));
    panel.append(button('Loose!', 'big danger', fire));
  }

  function fire() {
    if (phase !== 'aim' || !sim) return;
    phase = 'firing';
    panel.innerHTML = '';
    status = el('p', 'small', 'Counterweight falling…');
    panel.append(status);
    timeScale = 1;
  }

  async function enemyTurn() {
    phase = 'enemy-aim';
    panel.innerHTML = '';
    panel.append(el('p', 'small', `${opp.name} is sighting the shot…`));
    shooterIsMe = false; cam.flip = true;
    const eInput: ShotInput = { trebuchet: opp.trebuchet, projectile: opp.projectile, aim: { releaseAngleDeg: 40 }, wind };
    makeSim(eInput, myCastle); // show them cocked while aiming
    const setupDone = new Promise<void>((resolve) => startSetup(resolve));
    const a = await opp.aim({ R, castle: myCastle, wind, round });
    await setupDone;
    eInput.aim = a;
    shooterInput = eInput;
    makeSim(eInput, myCastle);
    phase = 'enemy-firing';
    panel.innerHTML = '';
    status = el('p', 'small', `${opp.name} looses!`);
    panel.append(status);
  }

  function shotFinished() {
    if (!sim) return;
    const res = sim.finalResult();
    if (shooterIsMe) {
      theirCastle = res.castleAfter; theirCastle.integrity = computeIntegrity(theirLayout, theirCastle.blocks);
      damageDealt += res.damage;
      lastTraceMine = trace;
      setToast(`${(res.damage / 1000).toFixed(1)} kJ · ${res.destroyed.length} blocks shattered · castle ${(theirCastle.integrity * 100).toFixed(0)}%`, 3000);
      refreshBars();
      const ack = opp.onPlayerShot ? opp.onPlayerShot(shooterInput!.aim, { damage: res.damage, integrityAfter: theirCastle.integrity }).catch(() => undefined) : Promise.resolve(undefined);
      ack.then((a) => {
        if (a && a.castleAfter) { theirCastle = a.castleAfter; theirCastle.integrity = computeIntegrity(theirLayout, theirCastle.blocks); refreshBars(); }
        if (theirCastle.integrity <= LOSE_AT) return finish(true);
        setTimeout(() => enemyTurn(), 1200);
      });
    } else {
      myCastle = res.castleAfter; myCastle.integrity = computeIntegrity(myLayout, myCastle.blocks);
      lastTraceTheirs = trace;
      setToast(`${opp.name}: ${(res.damage / 1000).toFixed(1)} kJ · your castle ${(myCastle.integrity * 100).toFixed(0)}%`, 3000);
      refreshBars();
      const ack = opp.afterOpponentShot ? opp.afterOpponentShot({ damage: res.damage, integrityAfter: myCastle.integrity }).catch(() => undefined) : Promise.resolve(undefined);
      ack.then((a) => {
        if (a && a.castleAfter) { myCastle = a.castleAfter; myCastle.integrity = computeIntegrity(myLayout, myCastle.blocks); refreshBars(); }
        if (myCastle.integrity <= LOSE_AT) return finish(true);
        if (round >= MAX_ROUNDS) return finish(true);
        round++; wind = windFor(round);
        phase = 'aim';
        setTimeout(() => { previewMine(); startSetup(showAimPanel); refreshBars(); }, 1000);
      });
    }
  }

  let ended = false;
  function finish(natural: boolean) {
    if (ended) return; ended = true;
    phase = 'over';
    sim?.free(); sim = null;
    ctx.tick = null;
    const won = !natural ? false : matchOutcome(myCastle.integrity, theirCastle.integrity);
    onEnd({ won, natural, myIntegrity: myCastle.integrity, theirIntegrity: theirCastle.integrity, damageDealt, rounds: round, opponent: opp });
  }

  // ---------------- frame loop
  ctx.tick = (dt, time) => {
    const W = ctx.app.screen.width, H = ctx.app.screen.height;
    cam.resize(W, H); cam.horizon = 0.68;
    if (!sim || !geo) return;
    const input = sim.input;

    const running = phase === 'firing' || phase === 'enemy-firing';
    if (running && !sim.done) {
      const now = sim.t;
      let scale = timeScale;
      if (now < slowUntil) scale = 0.35;
      if (sim.phase === 'settle') scale = 2.2;
      acc += dt * scale;
      let n = 0;
      while (acc >= DT && n < 14 && !sim.done) {
        const wasReleased = sim.released;
        sim.step(); acc -= DT; n++;
        const st = sim.render();
        frameState = st;
        if (!wasReleased && sim.released) {
          slowUntil = sim.t + 0.45;
          const fr = sim.finalResult();
          const rel = fr.release;
          if (rel && status) status.textContent = `Released at ${rel.speed.toFixed(0)} m/s, ${rel.angleDeg.toFixed(0)}° — beam peaked at ${(fr.peakStress * 100).toFixed(0)}% of its strength`;
        }
        if (sim.released) {
          trace.push([st.projectile.x, st.projectile.y]);
          // Firepots burn in flight: flame close to the pot, smoke trailing behind.
          if (input.projectile.kind === 'firepot' && !impactSeen && sim.steps % 3 === 0) {
            particles.dust(st.projectile.x, st.projectile.y, 1, 0xff9a3c, 0.35);
            if (sim.steps % 6 === 0) particles.dust(st.projectile.x - st.projectile.vx * 0.03, st.projectile.y - st.projectile.vy * 0.03, 1, 0x55504c, 0.5);
          }
        }
        const res = sim.finalResult();
        if (res.destroyed.length > lastDestroyed) {
          for (const d of res.destroyed.slice(lastDestroyed)) { particles.burst(d.x, d.y, d.vx, d.vy, PALETTE[d.material], 26, 6, 0.22); particles.dust(d.x, d.y, 10, 0xd8d0c0, 0.6); }
          lastDestroyed = res.destroyed.length;
          slowUntil = Math.max(slowUntil, sim.t + 0.25);
        }
        if (st.failure && !failureSeen) {
          failureSeen = true;
          slowUntil = sim.t + 0.9;
          const who = shooterIsMe ? 'Your' : `${opp.name}'s`;
          if (st.failure.kind === 'beam') {
            if (status) status.textContent = `${who} beam snapped under the load!`;
            particles.burst(st.tip.x, st.tip.y, 0, 0, PALETTE[input.trebuchet.beamMaterial], 36, 9, 0.16);
          } else if (st.failure.kind === 'tip') {
            if (status) status.textContent = `${who} frame tore its stakes and tipped over!`;
            particles.dust(st.frame.x, 0.3, 24, 0xb9a37f, 0.9);
          }
          setToast(st.failure.kind === 'beam' ? 'Beam snapped! Thicker timber or a lighter stone next time.' : 'Frame tipped! A wider, heavier frame or wheels would hold.', 3600);
        }
        if (res.impact && !impactSeen) {
          impactSeen = true;
          if (status) status.textContent = res.impact.target === 'castle' ? `Impact on the walls at ${res.impact.speed.toFixed(0)} m/s!` : `Short — hit the ground at ${res.impact.x.toFixed(0)} m`;
          particles.burst(res.impact.x, res.impact.y, 0, 0, res.impact.target === 'ground' ? PALETTE.dirt : 0xd8d0c0, 40, 7, 0.18);
          particles.dust(res.impact.x, res.impact.y, 28, res.impact.target === 'ground' ? 0xb9a37f : 0xd8d0c0, 1.0);
          if (input.projectile.kind === 'firepot') { particles.burst(res.impact.x, res.impact.y, 0, 0, 0xff7a1f, 40, 5, 0.25); particles.dust(res.impact.x, res.impact.y + 0.5, 30, 0xff9a3c, 0.9); particles.dust(res.impact.x, res.impact.y + 1, 20, 0x3a3634, 1.2); }
          slowUntil = sim.t + 0.5;
        }
      }
      if (acc > DT * 14) acc = 0;
      if (sim.done) shotFinished();
    }
    particles.update(dt);
    const st = frameState ?? sim.render();
    if (setup) {
      const before = setup.t;
      setup.t += dt;
      if (before < SETUP_WINCH && setup.t >= SETUP_WINCH && status) status.textContent = shooterIsMe ? 'Loading the pouch…' : `${opp.name}'s crew loads the pouch…`;
      if (before < SETUP_WINCH + SETUP_LOAD && setup.t >= SETUP_WINCH + SETUP_LOAD && status) status.textContent = shooterIsMe ? 'Pinned and ready.' : `${opp.name} is sighting the shot…`;
      if (setup.t >= SETUP_TOTAL) { const d = setup.done; setup = null; d(); }
    }
    refreshWind(st.wind.x);

    // Camera
    const castleOrigin = shooterIsMe ? theirCastle.originX : myCastle.originX;
    const castleW = shooterIsMe ? theirLayout.width : myLayout.width;
    const fx = (x: number) => (cam.flip ? -x : x);
    const k = 1 - Math.exp(-dt * 4);
    if (!st.projectile.released) {
      cam.lerpTo(fx(5), geo.pivotHeight * 0.4, Math.min(W / 28, H / 22), k);
    } else if (!impactSeen && sim.phase === 'flight') {
      const span = Math.max(50, Math.abs(st.projectile.x) + 20);
      cam.lerpTo(fx(st.projectile.x * 0.55 + castleOrigin * 0.2), Math.max(0, st.projectile.y - 12) * 0.5 + 4, Math.min(W / span, H / 60), k);
    } else {
      cam.lerpTo(fx(castleOrigin + castleW / 2), 5, Math.min(W / 42, H / 30), k * 0.9);
    }

    // Draw
    g.clear();
    drawBackdrop(g, cam, time);
    // Ghost traces
    for (const [tr, col] of [[lastTraceMine, 0xf6e7b5], [lastTraceTheirs, 0xf2a08a]] as const) {
      if (tr.length > 2 && ((shooterIsMe && tr === lastTraceMine) || (!shooterIsMe && tr === lastTraceTheirs))) {
        for (let i = 1; i < tr.length; i += 3) g.circle(cam.sx(tr[i][0]), cam.sy(tr[i][1]), 1.5).fill({ color: col, alpha: 0.35 });
      }
    }
    if (trace.length > 1) for (let i = 0; i < trace.length; i += 2) g.circle(cam.sx(trace[i][0]), cam.sy(trace[i][1]), 1.3).fill({ color: 0xffffff, alpha: 0.5 });
    drawBlocks(g, cam, st.blocks, kinds, time);
    if (st.failure?.kind === 'beam' && st.failure.breakAt !== undefined) geo = { ...geo, longArm: st.failure.breakAt };
    drawTrebuchet(g, cam, geo, setup ? setupPose(st) : poseFromRender(st), input.trebuchet, input.projectile);
    if (st.piece) drawBeamPiece(g, cam, st.piece, input.trebuchet.beamMaterial, geo.beamThickness);
    particles.draw(g, cam);
    // Wind sock near the shooter
    const sockX = fx(-6), sockY = geo.pivotHeight + 3;
    const w = st.wind.x * (cam.flip ? -1 : 1);
    g.moveTo(cam.sx(fx(-6)), cam.sy(0)).lineTo(cam.sx(sockX), cam.sy(sockY)).stroke({ color: 0x3a3a3a, width: 2 });
    const len = Math.min(3, Math.abs(w) * 0.35);
    const flap = Math.sin(time * 9) * 0.15 * Math.min(1, Math.abs(w) / 4);
    g.moveTo(cam.sx(sockX), cam.sy(sockY)).lineTo(cam.sx(sockX + Math.sign(w || 1) * len), cam.sy(sockY + flap - 0.3 * (1 - len / 3))).stroke({ color: 0xe0a24a, width: 5 });
  };

  previewMine();
  startSetup(showAimPanel);
  refreshBars();
  setToast(`Round 1 — ${opp.name}'s ${opp.castle.material} castle at ${theirCastle.originX} m`, 3200);
}
