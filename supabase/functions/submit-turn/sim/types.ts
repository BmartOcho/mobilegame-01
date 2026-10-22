// Shared data model for Siegeworks. Everything here is plain JSON so it can
// travel client <-> server and be stored in Postgres.

export type BeamMaterial = 'pine' | 'oak' | 'ash' | 'ironbound';
export type FrameMaterial = 'pine' | 'oak' | 'ironbound';
export type ProjectileKind = 'stone' | 'iron' | 'firepot' | 'lead';
export type BlockMaterial = 'timber' | 'limestone' | 'granite';

export interface TrebuchetConfig {
  /** Height of the axle above ground, metres. */
  pivotHeight: number;
  /** Axle -> throwing tip, metres. */
  longArm: number;
  /** Axle -> counterweight hanger, metres. */
  shortArm: number;
  beamMaterial: BeamMaterial;
  /** Square cross-section side of the beam, metres. */
  beamThickness: number;
  frameMaterial: FrameMaterial;
  /** Counterweight mass, kg. */
  counterweightMass: number;
  /** Hanger length, metres. 0 = fixed counterweight. */
  hangerLength: number;
  /** Sling length tip -> pouch, metres. */
  slingLength: number;
  /** Frame rolls on wheels (classic efficiency trick). */
  wheels: boolean;
}

export interface ProjectileConfig {
  kind: ProjectileKind;
  /** Mass in kg. Radius derives from kind density. */
  mass: number;
}

export interface AimInput {
  /**
   * Release pin angle in degrees. The sling slips off the finger once the
   * angle between the sling and the beam axis falls below this. Smaller =
   * later release = lower, faster trajectory.
   */
  releaseAngleDeg: number;
  /**
   * Optional cocking angle override (degrees below horizontal for the long
   * arm). Undefined = as low as the frame allows.
   */
  cockAngleDeg?: number;
}

export interface WindSpec {
  /** Mean wind at 10 m reference height, m/s. +x is toward the target. */
  base: number;
  /** Gust intensity 0..1. */
  gustiness: number;
  /** Seed for the gust field. */
  seed: number;
}

export interface CastleConfig {
  material: BlockMaterial;
  /** Rows of wall blocks between towers. */
  wallHeight: number;
  /** Rows of tower blocks. */
  towerHeight: number;
  /** 1 or 2 block-thick walls. */
  wallThickness: 1 | 2;
  /** Rows in the central keep (0 = no keep). */
  keepHeight: number;
  /** Number of towers 2..4. */
  towers: number;
}

export interface BlockState {
  id: number;
  x: number;
  y: number;
  angle: number;
  /** Remaining structural energy budget, joules. */
  health: number;
}

export interface CastleState {
  config: CastleConfig;
  /** Front face of the castle in shooter frame, metres. */
  originX: number;
  blocks: BlockState[];
  /** Per-block static data regenerated from config (sizes, value weights). */
  integrity: number; // 0..1
}

export interface ShotInput {
  trebuchet: TrebuchetConfig;
  projectile: ProjectileConfig;
  aim: AimInput;
  wind: WindSpec;
}

export interface BlockDestroyedEvent {
  t: number;
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  material: BlockMaterial;
}

export interface ShotResult {
  /** Release time and launch state (undefined if the sling never released). */
  release?: { t: number; x: number; y: number; vx: number; vy: number; speed: number; angleDeg: number };
  /** Where the projectile first touched something. */
  impact?: { t: number; x: number; y: number; speed: number; target: 'ground' | 'castle' };
  range: number;
  /** Sum of joules of damage applied to castle blocks. */
  damage: number;
  destroyed: BlockDestroyedEvent[];
  integrityBefore: number;
  integrityAfter: number;
  castleAfter: CastleState;
  /** Total simulated seconds including settle. */
  duration: number;
  steps: number;
}

export interface BodyPose {
  x: number;
  y: number;
  angle: number;
}

/** Everything the renderer needs each frame. */
export interface RenderState {
  t: number;
  phase: 'cocked' | 'swinging' | 'flight' | 'settle' | 'done';
  frame: BodyPose;
  beam: BodyPose;
  counterweight: BodyPose;
  hanger?: BodyPose;
  wheels: BodyPose[];
  projectile: BodyPose & { vx: number; vy: number; released: boolean };
  /** Tip of the long arm in world coords (sling anchor). */
  tip: { x: number; y: number };
  blocks: { id: number; x: number; y: number; angle: number; hp: number; w: number; h: number; material: BlockMaterial }[];
  wind: { x: number; y: number };
}
