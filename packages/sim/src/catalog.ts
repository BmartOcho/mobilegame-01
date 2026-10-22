import type { BeamMaterial, BlockMaterial, FrameMaterial, ProjectileKind, TrebuchetConfig, ProjectileConfig, CastleConfig } from './types.ts';

export const G = 9.81;
export const AIR_DENSITY = 1.225; // kg/m^3 at sea level

export interface WoodProps {
  density: number; // kg/m^3
  /** Allowable bending stress, MPa. Beam snaps above this (future). */
  strengthMPa: number;
  cost: number;
}

export const BEAM_MATERIALS: Record<BeamMaterial, WoodProps> = {
  pine: { density: 500, strengthMPa: 40, cost: 0 },
  oak: { density: 720, strengthMPa: 60, cost: 120 },
  ash: { density: 680, strengthMPa: 70, cost: 200 },
  ironbound: { density: 900, strengthMPa: 110, cost: 400 },
};

export const FRAME_MATERIALS: Record<FrameMaterial, WoodProps> = {
  pine: { density: 500, strengthMPa: 40, cost: 0 },
  oak: { density: 720, strengthMPa: 60, cost: 100 },
  ironbound: { density: 900, strengthMPa: 110, cost: 300 },
};

export interface ProjectileProps {
  density: number; // kg/m^3 -> radius from mass
  /** Drag coefficient (subcritical sphere ~0.47, rough stone higher). */
  cd: number;
  /** Fraction of impact energy delivered as damage (rest lost to deformation). */
  hardness: number;
  /** Bonus damage multiplier against timber. */
  vsTimber: number;
  minMass: number;
  maxMass: number;
  cost: number;
  label: string;
}

export const PROJECTILES: Record<ProjectileKind, ProjectileProps> = {
  stone: { density: 2500, cd: 0.55, hardness: 0.8, vsTimber: 1, minMass: 10, maxMass: 120, cost: 0, label: 'Quarried stone' },
  iron: { density: 7200, cd: 0.47, hardness: 1.0, vsTimber: 1, minMass: 10, maxMass: 90, cost: 250, label: 'Iron shot' },
  firepot: { density: 1400, cd: 0.7, hardness: 0.3, vsTimber: 3.5, minMass: 8, maxMass: 40, cost: 150, label: 'Clay firepot' },
  lead: { density: 11300, cd: 0.45, hardness: 0.9, vsTimber: 1, minMass: 10, maxMass: 70, cost: 450, label: 'Lead ball' },
};

export interface BlockProps {
  density: number;
  /** Joules of damage per cubic metre to pulverise. */
  toughness: number;
  friction: number;
  cost: number;
  label: string;
}

export const BLOCK_MATERIALS: Record<BlockMaterial, BlockProps> = {
  timber: { density: 600, toughness: 5000, friction: 0.5, cost: 0, label: 'Timber palisade' },
  limestone: { density: 2300, toughness: 14000, friction: 0.55, cost: 300, label: 'Limestone' },
  granite: { density: 2700, toughness: 28000, friction: 0.6, cost: 700, label: 'Granite' },
};

/** Shooter axle sits at x=0. Castle front face is here. */
export const CASTLE_DISTANCE = 115;

export const DEFAULT_TREBUCHET: TrebuchetConfig = {
  pivotHeight: 4.5,
  longArm: 6.5,
  shortArm: 1.6,
  beamMaterial: 'pine',
  beamThickness: 0.28,
  frameMaterial: 'pine',
  counterweightMass: 1500,
  hangerLength: 1.4,
  slingLength: 5.5,
  wheels: false,
};

export const DEFAULT_PROJECTILE: ProjectileConfig = { kind: 'stone', mass: 25 };

export const DEFAULT_CASTLE: CastleConfig = {
  material: 'timber',
  wallHeight: 5,
  towerHeight: 8,
  wallThickness: 1,
  keepHeight: 4,
  towers: 2,
};

/** Hard limits used by both the build UI and the server validator. */
export const LIMITS = {
  pivotHeight: [3, 12],
  longArm: [3, 14],
  shortArm: [0.8, 4],
  beamThickness: [0.15, 0.6],
  counterweightMass: [300, 12000],
  hangerLength: [0, 4],
  slingLength: [1, 12],
  releaseAngleDeg: [5, 120],
} as const;

export function projectileRadius(p: ProjectileConfig): number {
  const vol = p.mass / PROJECTILES[p.kind].density;
  return Math.cbrt((3 * vol) / (4 * Math.PI));
}

export function beamMass(t: TrebuchetConfig): number {
  return BEAM_MATERIALS[t.beamMaterial].density * t.beamThickness * t.beamThickness * (t.longArm + t.shortArm);
}

export function frameMass(t: TrebuchetConfig): number {
  // Two A-frame legs + base sill + axle hardware, scaled by height.
  const legLen = Math.hypot(t.pivotHeight, t.pivotHeight * 0.45);
  const section = 0.3 * 0.3;
  return FRAME_MATERIALS[t.frameMaterial].density * section * (4 * legLen + 2 * t.pivotHeight * 1.2) + 150;
}

export function trebuchetCost(t: TrebuchetConfig): number {
  const b = BEAM_MATERIALS[t.beamMaterial];
  const f = FRAME_MATERIALS[t.frameMaterial];
  return Math.round(
    b.cost + f.cost +
    beamMass(t) * 0.6 +
    frameMass(t) * 0.3 +
    t.counterweightMass * 0.15 +
    (t.wheels ? 200 : 0) +
    t.slingLength * 10,
  );
}

export function castleCost(c: CastleConfig): number {
  const m = BLOCK_MATERIALS[c.material];
  const blocks = c.towers * c.towerHeight * 2 + (c.towers - 1) * c.wallHeight * 6 * c.wallThickness + c.keepHeight * 3;
  return Math.round(m.cost + blocks * (6 + m.density / 200));
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Clamp a config into legal range; the server runs this before simulating. */
export function sanitizeTrebuchet(t: TrebuchetConfig): TrebuchetConfig {
  const L = LIMITS;
  return {
    pivotHeight: clamp(+t.pivotHeight || 0, ...L.pivotHeight),
    longArm: clamp(+t.longArm || 0, ...L.longArm),
    shortArm: clamp(+t.shortArm || 0, ...L.shortArm),
    beamMaterial: t.beamMaterial in BEAM_MATERIALS ? t.beamMaterial : 'pine',
    beamThickness: clamp(+t.beamThickness || 0, ...L.beamThickness),
    frameMaterial: t.frameMaterial in FRAME_MATERIALS ? t.frameMaterial : 'pine',
    counterweightMass: clamp(+t.counterweightMass || 0, ...L.counterweightMass),
    hangerLength: clamp(+t.hangerLength || 0, ...L.hangerLength),
    slingLength: clamp(+t.slingLength || 0, ...L.slingLength),
    wheels: !!t.wheels,
  };
}

export function sanitizeProjectile(p: ProjectileConfig): ProjectileConfig {
  const kind: ProjectileKind = p.kind in PROJECTILES ? p.kind : 'stone';
  const props = PROJECTILES[kind];
  return { kind, mass: clamp(+p.mass || props.minMass, props.minMass, props.maxMass) };
}
