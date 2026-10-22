import RAPIER from '@dimforge/rapier2d-deterministic-compat';
import type { RigidBody, Collider, World, EventQueue, ImpulseJoint } from '@dimforge/rapier2d-deterministic-compat';
import type { ShotInput, ShotResult, CastleState, RenderState, BlockDestroyedEvent, BlockState, BodyPose, Failure } from './types.ts';
import { BEAM_MATERIALS, BLOCK_MATERIALS, PROJECTILES, STAKE_CAPACITY, projectileRadius, frameMass, sanitizeTrebuchet, sanitizeProjectile, clamp, LIMITS } from './catalog.ts';
import { layoutCastle, computeIntegrity, BLOCK_DEPTH, type BlockDef, type CastleLayout } from './castle.ts';
import { WindField } from './wind.ts';
import { aeroForce, beamDragTorque } from './aero.ts';

export type Rapier = typeof RAPIER;

let initPromise: Promise<Rapier> | null = null;
/** Idempotent WASM init. Call once on client and server before simulating. */
export function initPhysics(): Promise<Rapier> {
  if (!initPromise) initPromise = RAPIER.init().then(() => RAPIER);
  return initPromise;
}

export const DT = 1 / 120;
const MAX_TIME = 30;
const DUD_TIME = 10;
const SETTLE_MIN = 1.5;
const SETTLE_MAX = 4.5;

// Collision groups (membership << 16 | filter)
const G_GROUND = 1, G_FRAME = 2, G_BEAM = 4, G_CW = 8, G_PROJ = 16, G_CASTLE = 32;
const groups = (member: number, filter: number) => ((member << 16) | filter) >>> 0;

const COUNTERWEIGHT_DENSITY = 2200; // rubble + lead box

interface Vel { vx: number; vy: number }

export class ShotSim {
  readonly world: World;
  private eq: EventQueue;
  readonly input: ShotInput;
  readonly layout: CastleLayout;
  private wind: WindField;

  private frame!: RigidBody;
  private beam!: RigidBody;
  private cw!: RigidBody;
  private proj!: RigidBody;
  private projCollider!: Collider;
  private wheels: RigidBody[] = [];
  private sling: ImpulseJoint | null = null;

  private blockBodies = new Map<number, RigidBody>(); // id -> body
  private blockByCollider = new Map<number, number>(); // collider handle -> block id
  private blockHealth = new Map<number, number>();
  private blockDef = new Map<number, BlockDef>();
  private groundCollider!: Collider;

  private prevVel = new Map<number, Vel>(); // body handle -> velocity before step
  private cockAngle = 0;
  private projRadius: number;
  private cwHalf = 0.5;
  private hangerLen: number;
  private pivotY: number;

  t = 0;
  steps = 0;
  phase: RenderState['phase'] = 'cocked';
  released = false;
  private settleStart = -1;
  private rotated = 0;

  private result: Partial<ShotResult> = { damage: 0, destroyed: [], peakStress: 0, peakTip: 0 };
  // Structural failure tracking
  private beamCollider!: Collider;
  private piece: RigidBody | null = null;
  private pieceLength = 0;
  private prevCwVel: Vel = { vx: 0, vy: 0 };
  private lastTip = { x: 0, y: 0 };
  private stress = 0;
  private stressOver = 0;
  private tipOver = 0;
  private tipSteps = 0;
  private failure: Failure | undefined;
  private armLength: number;
  /** Stop as soon as the projectile touches anything (AI aiming / previews). */
  stopAtImpact = false;

  constructor(private R: Rapier, input: ShotInput, castle: CastleState) {
    this.input = {
      trebuchet: sanitizeTrebuchet(input.trebuchet),
      projectile: sanitizeProjectile(input.projectile),
      aim: { ...input.aim, releaseAngleDeg: clamp(+input.aim.releaseAngleDeg || 45, ...LIMITS.releaseAngleDeg) },
      wind: input.wind,
    };
    this.wind = new WindField(input.wind);
    this.layout = layoutCastle(castle.config, castle.originX);
    for (const b of this.layout.blocks) this.blockDef.set(b.id, b);

    this.world = new R.World({ x: 0, y: -9.81 });
    this.world.timestep = DT;
    this.world.integrationParameters.numSolverIterations = 4;
    this.eq = new R.EventQueue(true);

    this.projRadius = projectileRadius(this.input.projectile);
    this.armLength = this.input.trebuchet.longArm;
    this.hangerLen = this.input.trebuchet.hangerLength;
    this.pivotY = this.input.trebuchet.pivotHeight;

    this.buildGround();
    this.buildTrebuchet();
    this.buildCastle(castle);
    this.result.integrityBefore = computeIntegrity(this.layout, castle.blocks);
  }

  // ---------------------------------------------------------------- build

  private buildGround() {
    const g = this.world.createRigidBody(this.R.RigidBodyDesc.fixed().setTranslation(0, -1));
    this.groundCollider = this.world.createCollider(
      this.R.ColliderDesc.cuboid(2000, 1).setFriction(0.7).setRestitution(0.05).setCollisionGroups(groups(G_GROUND, 0xffff)),
      g,
    );
  }

  private buildTrebuchet() {
    const R = this.R;
    const T = this.input.trebuchet;
    const La = T.longArm, Ls = T.shortArm, h = T.pivotHeight;

    // Cocking angle: long arm points down & back; tip stays >= 0.6 m up.
    let sinMax = (h - 0.6) / La;
    sinMax = clamp(sinMax, Math.sin((10 * Math.PI) / 180), Math.sin((75 * Math.PI) / 180));
    let theta = Math.asin(sinMax);
    if (this.input.aim.cockAngleDeg !== undefined) {
      theta = clamp((this.input.aim.cockAngleDeg * Math.PI) / 180, (10 * Math.PI) / 180, theta);
    }
    this.cockAngle = theta;
    const phi0 = Math.PI + theta; // beam rotation: local +x points at the tip

    // Frame
    const wheelR = 0.55;
    const frameDesc = T.wheels ? R.RigidBodyDesc.dynamic() : R.RigidBodyDesc.fixed();
    frameDesc.setTranslation(0, 0).setCanSleep(false);
    this.frame = this.world.createRigidBody(frameDesc);
    const sillY = T.wheels ? wheelR + 0.15 : 0.15;
    const halfSpan = h * 0.55;
    this.world.createCollider(
      R.ColliderDesc.cuboid(halfSpan, 0.15).setTranslation(0, sillY).setMass(frameMass(T)).setFriction(0.9).setCollisionGroups(groups(G_FRAME, G_GROUND)),
      this.frame,
    );
    if (T.wheels) {
      for (const sx of [-1, 1]) {
        const wx = sx * halfSpan * 0.8;
        const w = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(wx, wheelR).setCanSleep(false));
        this.world.createCollider(R.ColliderDesc.ball(wheelR).setMass(120).setFriction(0.9).setCollisionGroups(groups(G_FRAME, G_GROUND)), w);
        this.world.createImpulseJoint(R.JointData.revolute({ x: wx, y: wheelR }, { x: 0, y: 0 }), this.frame, w, true);
        this.wheels.push(w);
      }
    }

    // Beam
    const beamDesc = R.RigidBodyDesc.dynamic().setTranslation(0, h).setRotation(phi0).setCanSleep(false).setCcdEnabled(true);
    this.beam = this.world.createRigidBody(beamDesc);
    const bm = BEAM_MATERIALS[T.beamMaterial];
    this.beamCollider = this.world.createCollider(
      R.ColliderDesc.cuboid((La + Ls) / 2, T.beamThickness / 2)
        .setTranslation((La - Ls) / 2, 0)
        .setDensity(bm.density * T.beamThickness) // 2D density * depth == thickness
        .setCollisionGroups(groups(G_BEAM, G_GROUND)),
      this.beam,
    );
    this.world.createImpulseJoint(R.JointData.revolute({ x: 0, y: h }, { x: 0, y: 0 }), this.frame, this.beam, true);

    // Counterweight: box hung from the short arm.
    const vol = T.counterweightMass / COUNTERWEIGHT_DENSITY;
    const side = Math.cbrt(vol);
    this.cwHalf = side / 2;
    const ux = Math.cos(phi0), uy = Math.sin(phi0);
    const Px = -Ls * ux, Py = h - Ls * uy; // short-arm end (world)
    let cwX: number, cwY: number, cwRot: number;
    if (this.hangerLen > 0) {
      cwX = Px; cwY = Py - this.hangerLen - this.cwHalf; cwRot = 0;
    } else {
      const nx = -Math.sin(phi0), ny = Math.cos(phi0);
      cwX = Px + this.cwHalf * nx; cwY = Py + this.cwHalf * ny; cwRot = phi0;
    }
    this.cw = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(cwX, cwY).setRotation(cwRot).setCanSleep(false).setCcdEnabled(true));
    this.world.createCollider(
      R.ColliderDesc.cuboid(this.cwHalf, this.cwHalf).setMass(T.counterweightMass).setFriction(0.8).setCollisionGroups(groups(G_CW, G_GROUND)),
      this.cw,
    );
    if (this.hangerLen > 0) {
      this.world.createImpulseJoint(R.JointData.revolute({ x: -Ls, y: 0 }, { x: 0, y: this.hangerLen + this.cwHalf }), this.beam, this.cw, true);
    } else {
      this.world.createImpulseJoint(R.JointData.fixed({ x: -Ls, y: 0 }, 0, { x: 0, y: -this.cwHalf }, 0), this.beam, this.cw, true);
    }

    // Projectile in the trough, sling laid forward.
    const r = this.projRadius;
    const tipX = La * ux, tipY = h + La * uy;
    const Lsl = T.slingLength;
    let px: number, py: number;
    const drop = tipY - r;
    if (Lsl > drop) { px = tipX + Math.sqrt(Lsl * Lsl - drop * drop); py = r; }
    else { px = tipX; py = Math.max(r, tipY - Lsl); }
    const pp = PROJECTILES[this.input.projectile.kind];
    this.proj = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(px, py).setCanSleep(false).setCcdEnabled(true).setAngularDamping(0.05));
    this.projCollider = this.world.createCollider(
      R.ColliderDesc.ball(r)
        .setMass(this.input.projectile.mass)
        .setFriction(0.2)
        .setFrictionCombineRule(R.CoefficientCombineRule.Min)
        .setRestitution(0.15)
        .setCollisionGroups(groups(G_PROJ, G_GROUND | G_CASTLE))
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
      this.proj,
    );
    void pp;
    this.sling = this.world.createImpulseJoint(R.JointData.rope(Lsl, { x: La, y: 0 }, { x: 0, y: 0 }), this.beam, this.proj, true);
  }

  private buildCastle(castle: CastleState) {
    const R = this.R;
    for (const st of castle.blocks) {
      const def = this.blockDef.get(st.id);
      if (!def || st.health <= 0) continue;
      const mat = BLOCK_MATERIALS[def.material];
      const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(st.x, st.y).setRotation(st.angle).setCcdEnabled(false));
      const col = this.world.createCollider(
        R.ColliderDesc.cuboid(def.w / 2, def.h / 2)
          .setDensity(mat.density * BLOCK_DEPTH)
          .setFriction(mat.friction)
          .setRestitution(0.02)
          .setCollisionGroups(groups(G_CASTLE, G_GROUND | G_CASTLE | G_PROJ))
          .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
        body,
      );
      this.blockBodies.set(def.id, body);
      this.blockByCollider.set(col.handle, def.id);
      this.blockHealth.set(def.id, st.health);
    }
  }

  // ---------------------------------------------------------------- step

  get done(): boolean { return this.phase === 'done'; }

  step(): void {
    if (this.phase === 'done') return;
    if (this.phase === 'cocked') this.phase = 'swinging';

    // Record pre-step velocities for impact energy.
    this.prevVel.clear();
    const pv = this.proj.linvel();
    this.prevVel.set(this.proj.handle, { vx: pv.x, vy: pv.y });
    for (const b of this.blockBodies.values()) {
      if (b.isSleeping()) continue;
      const v = b.linvel();
      this.prevVel.set(b.handle, { vx: v.x, vy: v.y });
    }

    // Aerodynamics on the projectile (always; also matters while in the sling).
    const p = this.proj.translation();
    const wx = this.wind.at(p.y, this.t);
    const wy = this.wind.vertical(this.t);
    const pk = PROJECTILES[this.input.projectile.kind];
    const f = aeroForce({ radius: this.projRadius, cd: pk.cd, smooth: pk.smooth }, pv.x, pv.y, wx, wy, this.proj.angvel());
    this.proj.resetForces(false);
    this.proj.addForce({ x: f.fx, y: f.fy }, true);
    // Air resistance on the swinging beam (a slab moving broadside).
    const T = this.input.trebuchet;
    this.beam.resetTorques(false);
    this.beam.addTorque(beamDragTorque(T.beamThickness, T.longArm, T.shortArm, this.beam.angvel()), true);

    const cwv = this.cw.linvel();
    this.prevCwVel = { vx: cwv.x, vy: cwv.y };

    this.world.step(this.eq);
    this.t += DT;
    this.steps++;

    this.handleEvents();
    this.checkStructure({ vx: pv.x, vy: pv.y }, wx, wy);
    this.checkRelease();
    this.checkPhase();
  }

  // ------------------------------------------------------------ structure

  /**
   * Beam bending at the axle from sling tension (tip side) and counterweight
   * pull (short side), sigma = 6M/t^3 for a square section; frame overturning
   * from the axle reaction derived from the swinging system's momentum change.
   * Both are low-pass filtered and must exceed the limit for several steps so
   * a single constraint impulse (the sling snapping taut) cannot break anything.
   */
  private checkStructure(pvBefore: Vel, wx: number, wy: number) {
    const T = this.input.trebuchet;
    const t = T.beamThickness;
    const a = this.beam.rotation();
    const ux = Math.cos(a), uy = Math.sin(a);
    const m = this.input.projectile.mass;
    const g = 9.81;

    // --- tip side: rope tension from projectile acceleration (minus gravity and drag)
    let mTip = 0;
    this.lastTip = { x: 0, y: 0 };
    if (this.sling) {
      const v = this.proj.linvel();
      const ax = (v.x - pvBefore.vx) / DT, ay = (v.y - pvBefore.vy) / DT + g;
      const pk = PROJECTILES[this.input.projectile.kind];
      const fd = aeroForce({ radius: this.projRadius, cd: pk.cd, smooth: pk.smooth }, pvBefore.vx, pvBefore.vy, wx, wy, 0);
      const tx = m * ax - fd.fx, ty = m * ay - fd.fy;
      this.lastTip = { x: tx, y: ty };
      const tip = this.tipWorld();
      const p = this.proj.translation();
      const sx = p.x - tip.x, sy = p.y - tip.y; const sl = Math.hypot(sx, sy) || 1;
      const perp = Math.abs((sx / sl) * uy - (sy / sl) * ux); // |sin| between sling and beam
      mTip = Math.hypot(tx, ty) * perp * this.armLength;
    }
    // --- short side: counterweight pull perpendicular to the beam
    const cv = this.cw.linvel();
    const cax = (cv.x - this.prevCwVel.vx) / DT, cay = (cv.y - this.prevCwVel.vy) / DT + g;
    const fcx = T.counterweightMass * cax, fcy = T.counterweightMass * cay;
    const mCw = Math.abs(fcx * uy - fcy * ux) * T.shortArm;
    const sigma = (6 * Math.max(mTip, mCw)) / (t * t * t);
    const ratio = sigma / (BEAM_MATERIALS[T.beamMaterial].strengthMPa * 1e6);
    this.stress += (ratio - this.stress) * 0.25;
    if (this.stress > this.result.peakStress!) this.result.peakStress = this.stress;
    if (!this.failure && this.stress > 1) { if (++this.stressOver >= 4) this.snapBeam(); } else this.stressOver = 0;

    // --- frame overturning (staked frames only; wheeled frames are simulated bodies).
    // The beam hands the frame the sum of the rope pull and the counterweight pull
    // (beam inertia neglected). Horizontal pull at axle height overturns; upward
    // pull lightens the frame, downward pull and the stakes hold it.
    if (!T.wheels && this.frame.isFixed()) {
      const onFrameX = -(this.lastTip.x + fcx), onFrameY = -(this.lastTip.y + fcy);
      const halfSpan = T.pivotHeight * 0.55;
      const over = Math.abs(onFrameX) * T.pivotHeight;
      const hold = Math.max(0, frameMass(T) * g - onFrameY) * halfSpan + STAKE_CAPACITY[T.frameMaterial];
      const r = over / hold;
      this.tipOver += (r - this.tipOver) * 0.25;
      if (this.tipOver > this.result.peakTip!) this.result.peakTip = this.tipOver;
      if (!this.failure && this.tipOver > 1) { if (++this.tipSteps >= 6) this.tipFrame(); } else this.tipSteps = 0;
    }
  }

  private snapBeam() {
    const R = this.R;
    const T = this.input.trebuchet;
    const La = this.armLength;
    const breakAt = Math.max(0.5, La * 0.35);
    const pieceLen = La - breakAt;
    // Outer arm becomes a free body with the beam's velocity at its centre.
    const a = this.beam.rotation();
    const bp = this.beam.translation();
    const cx = breakAt + pieceLen / 2;
    const wx = bp.x + cx * Math.cos(a), wy = bp.y + cx * Math.sin(a);
    const v = this.beam.velocityAtPoint({ x: wx, y: wy });
    const piece = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(wx, wy).setRotation(a).setLinvel(v.x, v.y).setAngvel(this.beam.angvel()).setCcdEnabled(true));
    this.world.createCollider(
      R.ColliderDesc.cuboid(pieceLen / 2, T.beamThickness * 0.3).setDensity(BEAM_MATERIALS[T.beamMaterial].density * T.beamThickness).setFriction(0.6).setCollisionGroups(groups(G_BEAM, G_GROUND)),
      piece,
    );
    this.piece = piece; this.pieceLength = pieceLen;
    // Shorten the beam
    this.world.removeCollider(this.beamCollider, true);
    this.beamCollider = this.world.createCollider(
      R.ColliderDesc.cuboid((breakAt + T.shortArm) / 2, T.beamThickness / 2).setTranslation((breakAt - T.shortArm) / 2, 0).setDensity(BEAM_MATERIALS[T.beamMaterial].density * T.beamThickness).setCollisionGroups(groups(G_BEAM, G_GROUND)),
      this.beam,
    );
    this.armLength = breakAt;
    if (this.sling) { this.world.removeImpulseJoint(this.sling, true); this.sling = null; }
    this.failure = { kind: 'beam', t: this.t, breakAt };
    this.result.failure = this.failure;
    if (!this.released) { this.released = true; this.phase = 'flight'; }
  }

  private tipFrame() {
    this.frame.setBodyType(this.R.RigidBodyType.Dynamic, true);
    this.failure = { kind: 'tip', t: this.t };
    this.result.failure = this.failure;
  }

  private tipWorld(): { x: number; y: number } {
    const b = this.beam.translation();
    const a = this.beam.rotation();
    const La = this.armLength;
    return { x: b.x + La * Math.cos(a), y: b.y + La * Math.sin(a) };
  }

  private checkRelease() {
    if (this.released || !this.sling) return;
    const a = this.beam.rotation();
    const phi0 = Math.PI + this.cockAngle;
    // Beam rotates clockwise (negative). How far has it swung?
    let swept = phi0 - a;
    swept = ((swept % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    this.rotated = swept;
    if (swept < Math.PI / 4) return;

    const tip = this.tipWorld();
    const p = this.proj.translation();
    const sx = p.x - tip.x, sy = p.y - tip.y;
    const slen = Math.hypot(sx, sy);
    if (slen < this.input.trebuchet.slingLength * 0.97) return; // slack, still dragging
    const ux = Math.cos(a), uy = Math.sin(a);
    const cosB = (sx * ux + sy * uy) / slen;
    const beta = Math.acos(clamp(cosB, -1, 1));
    if (beta <= (this.input.aim.releaseAngleDeg * Math.PI) / 180) {
      this.world.removeImpulseJoint(this.sling, true);
      this.sling = null;
      this.released = true;
      const v = this.proj.linvel();
      const speed = Math.hypot(v.x, v.y);
      this.result.release = { t: this.t, x: p.x, y: p.y, vx: v.x, vy: v.y, speed, angleDeg: (Math.atan2(v.y, v.x) * 180) / Math.PI };
      this.phase = 'flight';
    }
  }

  private handleEvents() {
    const toDestroy: number[] = [];
    this.eq.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const id1 = this.blockByCollider.get(h1);
      const id2 = this.blockByCollider.get(h2);
      const isProj1 = h1 === this.projCollider.handle;
      const isProj2 = h2 === this.projCollider.handle;
      const isGround1 = h1 === this.groundCollider.handle;
      const isGround2 = h2 === this.groundCollider.handle;

      // Projectile impact bookkeeping
      if ((isProj1 || isProj2) && !this.result.impact && this.released) {
        const p = this.proj.translation();
        const pv = this.prevVel.get(this.proj.handle)!;
        this.result.impact = { t: this.t, x: p.x, y: p.y, speed: Math.hypot(pv.vx, pv.vy), target: isGround1 || isGround2 ? 'ground' : 'castle' };
      }

      if (id1 === undefined && id2 === undefined) return;

      // Energy available for damage from relative pre-step velocity.
      const bodyA = isProj1 ? this.proj : id1 !== undefined ? this.blockBodies.get(id1) : null;
      const bodyB = isProj2 ? this.proj : id2 !== undefined ? this.blockBodies.get(id2) : null;
      const vA = bodyA ? this.prevVel.get(bodyA.handle) ?? { vx: 0, vy: 0 } : { vx: 0, vy: 0 };
      const vB = bodyB ? this.prevVel.get(bodyB.handle) ?? { vx: 0, vy: 0 } : { vx: 0, vy: 0 };
      const rvx = vA.vx - vB.vx, rvy = vA.vy - vB.vy;
      const rel2 = rvx * rvx + rvy * rvy;
      if (rel2 < 1.5) return; // < ~1.2 m/s: a nudge, not a hit
      const mA = bodyA ? bodyA.mass() : Infinity;
      const mB = bodyB ? bodyB.mass() : Infinity;
      const mu = !isFinite(mA) ? mB : !isFinite(mB) ? mA : (mA * mB) / (mA + mB);
      const energy = 0.5 * mu * rel2;

      const apply = (id: number | undefined, otherIsProj: boolean, share: number) => {
        if (id === undefined) return;
        const def = this.blockDef.get(id)!;
        let dmg = energy * share;
        if (otherIsProj) {
          const pp = PROJECTILES[this.input.projectile.kind];
          dmg *= pp.hardness * (def.material === 'timber' ? pp.vsTimber : 1);
        } else {
          dmg *= 0.45; // masonry on masonry: most energy goes to heat/friction
        }
        if (dmg < def.maxHealth * 0.02) return;
        const hp = (this.blockHealth.get(id) ?? 0) - dmg;
        this.blockHealth.set(id, hp);
        this.result.damage! += Math.min(dmg, Math.max(0, hp + dmg));
        if (hp <= 0 && !toDestroy.includes(id)) toDestroy.push(id);
      };

      // Shock through the masonry: a projectile hit also cracks nearby blocks.
      if ((isProj1 || isProj2) && energy > 2000) {
        const hitId = id1 ?? id2;
        const hb = hitId !== undefined ? this.blockBodies.get(hitId) : undefined;
        if (hb) {
          const hp = hb.translation();
          for (const [nid, nb] of this.blockBodies) {
            if (nid === hitId) continue;
            const np = nb.translation();
            const d = Math.hypot(np.x - hp.x, np.y - hp.y);
            if (d < 1.7) apply(nid, true, 0.22 * (1 - d / 1.7));
          }
        }
      }
      if (id1 !== undefined && id2 !== undefined) {
        // split by inverse toughness
        const t1 = BLOCK_MATERIALS[this.blockDef.get(id1)!.material].toughness;
        const t2 = BLOCK_MATERIALS[this.blockDef.get(id2)!.material].toughness;
        const s1 = t2 / (t1 + t2);
        apply(id1, false, s1);
        apply(id2, false, 1 - s1);
      } else {
        apply(id1, isProj2, 1);
        apply(id2, isProj1, 1);
      }
    });

    for (const id of toDestroy) this.destroyBlock(id);
  }

  private destroyBlock(id: number) {
    const body = this.blockBodies.get(id);
    if (!body) return;
    const p = body.translation();
    const v = body.linvel();
    const def = this.blockDef.get(id)!;
    const ev: BlockDestroyedEvent = { t: this.t, id, x: p.x, y: p.y, vx: v.x, vy: v.y, material: def.material };
    this.result.destroyed!.push(ev);
    for (const [ch, bid] of this.blockByCollider) if (bid === id) { this.blockByCollider.delete(ch); break; }
    this.world.removeRigidBody(body);
    this.blockBodies.delete(id);
    this.blockHealth.delete(id);
  }

  private checkPhase() {
    if (this.phase === 'swinging' && (this.t > DUD_TIME || (this.failure && this.t - this.failure.t > 3))) this.beginSettle();
    if (this.phase === 'flight') {
      const p = this.proj.translation();
      const v = this.proj.linvel();
      const castleEnd = this.layout.blocks.length ? this.input && this.layout.width + (this.layout.blocks[0] ? this.layout.blocks[0].x : 0) : 200;
      const lost = p.y < -3 || p.x > castleEnd + 80 || p.x < -80;
      const resting = this.result.impact && Math.hypot(v.x, v.y) < 0.6 && this.t - this.result.impact.t > 0.5;
      if (this.stopAtImpact && (lost || this.result.impact)) { this.finish(); return; }
      if (lost || resting || (this.result.impact && this.t - this.result.impact.t > 1.0)) this.beginSettle();
    }
    if (this.phase === 'settle') {
      const since = this.t - this.settleStart;
      let allAsleep = true;
      for (const b of this.blockBodies.values()) if (!b.isSleeping()) { allAsleep = false; break; }
      if ((since > SETTLE_MIN && allAsleep) || since > SETTLE_MAX) this.finish();
    }
    if (this.t > MAX_TIME && this.phase !== 'done') this.finish();
  }

  private beginSettle() {
    if (this.phase === 'settle' || this.phase === 'done') return;
    this.phase = 'settle';
    this.settleStart = this.t;
  }

  private finish() {
    this.phase = 'done';
  }

  /** Run to completion. */
  run(): ShotResult {
    while (!this.done) this.step();
    return this.finalResult();
  }

  finalResult(): ShotResult {
    const blocks: BlockState[] = [];
    for (const [id, body] of this.blockBodies) {
      const p = body.translation();
      blocks.push({ id, x: p.x, y: p.y, angle: body.rotation(), health: this.blockHealth.get(id) ?? 0 });
    }
    blocks.sort((a, b) => a.id - b.id);
    const integrityAfter = computeIntegrity(this.layout, blocks);
    const castleAfter: CastleState = {
      config: this.layout.blocks.length ? this.inputCastleConfig() : this.inputCastleConfig(),
      originX: this.castleOriginX,
      blocks,
      integrity: integrityAfter,
    };
    const rel = this.result.release;
    const imp = this.result.impact;
    return {
      release: rel,
      impact: imp,
      range: imp ? imp.x : rel ? this.proj.translation().x : 0,
      damage: Math.round(this.result.damage ?? 0),
      destroyed: this.result.destroyed ?? [],
      integrityBefore: this.result.integrityBefore ?? 1,
      integrityAfter,
      castleAfter,
      peakStress: this.result.peakStress ?? 0,
      peakTip: this.result.peakTip ?? 0,
      failure: this.failure,
      duration: this.t,
      steps: this.steps,
    };
  }

  private castleOriginX = 0;
  private castleCfg!: CastleState['config'];
  private inputCastleConfig() { return this.castleCfg; }
  /** @internal called by factory */
  _attachCastleMeta(c: CastleState) { this.castleOriginX = c.originX; this.castleCfg = c.config; }

  // ---------------------------------------------------------------- render

  private pose(b: RigidBody): BodyPose { const p = b.translation(); return { x: p.x, y: p.y, angle: b.rotation() }; }

  render(): RenderState {
    const p = this.proj.translation();
    const v = this.proj.linvel();
    const blocks: RenderState['blocks'] = [];
    for (const [id, body] of this.blockBodies) {
      const def = this.blockDef.get(id)!;
      const bp = body.translation();
      blocks.push({ id, x: bp.x, y: bp.y, angle: body.rotation(), hp: (this.blockHealth.get(id) ?? 0) / def.maxHealth, w: def.w, h: def.h, material: def.material });
    }
    let hanger: BodyPose | undefined;
    if (this.hangerLen > 0) {
      const b = this.beam.translation(); const a = this.beam.rotation();
      const Ls = this.input.trebuchet.shortArm;
      hanger = { x: b.x - Ls * Math.cos(a), y: b.y - Ls * Math.sin(a), angle: this.cw.rotation() };
    }
    return {
      t: this.t,
      phase: this.phase,
      frame: this.pose(this.frame),
      beam: this.pose(this.beam),
      counterweight: this.pose(this.cw),
      hanger,
      wheels: this.wheels.map((w) => this.pose(w)),
      projectile: { x: p.x, y: p.y, angle: this.proj.rotation(), vx: v.x, vy: v.y, released: this.released },
      tip: this.tipWorld(),
      stress: this.stress,
      failure: this.failure,
      piece: this.piece ? { ...this.pose(this.piece), length: this.pieceLength } : undefined,
      blocks,
      wind: { x: this.wind.at(Math.max(p.y, 10), this.t), y: this.wind.vertical(this.t) },
    };
  }

  /** Block kind lookup for the renderer. */
  blockKinds(): Map<number, BlockDef['kind']> {
    const m = new Map<number, BlockDef['kind']>();
    for (const b of this.layout.blocks) m.set(b.id, b.kind);
    return m;
  }

  /** Static geometry the renderer needs once. */
  geometry() {
    const T = this.input.trebuchet;
    return {
      pivotHeight: T.pivotHeight,
      longArm: this.armLength,
      shortArm: T.shortArm,
      beamThickness: T.beamThickness,
      cwHalf: this.cwHalf,
      hangerLength: this.hangerLen,
      projectileRadius: this.projRadius,
      wheels: T.wheels,
      wheelRadius: 0.55,
      slingLength: T.slingLength,
      cockAngle: this.cockAngle,
    };
  }

  free() { this.world.free(); this.eq.free(); }
}

export interface ShotOptions { stopAtImpact?: boolean }

export function createShot(R: Rapier, input: ShotInput, castle: CastleState, opts: ShotOptions = {}): ShotSim {
  const s = new ShotSim(R, input, castle);
  s._attachCastleMeta(castle);
  s.stopAtImpact = !!opts.stopAtImpact;
  return s;
}

/** Headless: simulate a whole shot and return the authoritative result. */
export function runShot(R: Rapier, input: ShotInput, castle: CastleState, opts: ShotOptions = {}): ShotResult {
  const s = createShot(R, input, castle, opts);
  try { return s.run(); } finally { s.free(); }
}
