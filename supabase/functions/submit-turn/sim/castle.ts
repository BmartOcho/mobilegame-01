import type { BlockMaterial, BlockState, CastleConfig, CastleState } from './types.ts';
import { BLOCK_MATERIALS, CASTLE_DISTANCE } from './catalog.ts';

export const BLOCK_DEPTH = 1.0; // metres into the screen, for mass/volume

export interface BlockDef {
  id: number;
  /** Rest position (centre). */
  x: number;
  y: number;
  w: number;
  h: number;
  material: BlockMaterial;
  /** Value weight for integrity scoring. */
  value: number;
  maxHealth: number;
  kind: 'wall' | 'tower' | 'keep' | 'banner' | 'cap';
}

export interface CastleLayout {
  blocks: BlockDef[];
  width: number;
  totalValue: number;
}

function blockHealth(material: BlockMaterial, w: number, h: number): number {
  return BLOCK_MATERIALS[material].toughness * w * h * BLOCK_DEPTH;
}

/**
 * Procedural castle. Deterministic from config: alternating towers and wall
 * sections, central keep when configured, banner block on the tallest thing.
 * The layout is always regenerated from config so only pose+health travel.
 */
export function layoutCastle(cfg: CastleConfig, originX = CASTLE_DISTANCE): CastleLayout {
  const blocks: BlockDef[] = [];
  let id = 1;
  const mat = cfg.material;
  const TW = 1.2, TH = 0.6; // tower block
  const WW = 1.0, WH = 0.6; // wall block
  const towerCols = 2;
  const wallCols = 6;
  const towers = Math.max(2, Math.min(4, cfg.towers | 0));

  let x = originX;
  const push = (b: Omit<BlockDef, 'id' | 'maxHealth'>) => {
    blocks.push({ ...b, id: id++, maxHealth: blockHealth(b.material, b.w, b.h) });
  };

  const addTower = (x0: number) => {
    for (let r = 0; r < cfg.towerHeight; r++) {
      const stagger = r % 2 === 1 ? 0 : 0; // flat courses; stagger handled by friction
      for (let c = 0; c < towerCols; c++) {
        push({ x: x0 + TW / 2 + c * TW + stagger, y: TH / 2 + r * TH, w: TW, h: TH, material: mat, value: 1, kind: 'tower' });
      }
    }
    // Crenellation caps
    for (let c = 0; c < towerCols; c++) {
      push({ x: x0 + TW / 2 + c * TW, y: TH / 2 + cfg.towerHeight * TH, w: TW * 0.6, h: TH * 0.8, material: mat, value: 0.6, kind: 'cap' });
    }
    return towerCols * TW;
  };

  const addWall = (x0: number, hasKeep: boolean) => {
    const thick = cfg.wallThickness;
    for (let r = 0; r < cfg.wallHeight; r++) {
      // Running bond: odd rows shifted half a block, end halves omitted.
      const shift = r % 2 === 1 ? WW / 2 : 0;
      for (let c = 0; c < wallCols; c++) {
        const bx = x0 + WW / 2 + c * WW + shift;
        if (shift && c === wallCols - 1) break;
        for (let t = 0; t < thick; t++) {
          // thickness is depth in reality; in 2D we model it as extra health/mass.
          if (t > 0) break;
        }
        push({ x: bx, y: WH / 2 + r * WH, w: WW, h: WH, material: mat, value: 0.8, kind: 'wall' });
      }
    }
    if (thick === 2) {
      // Double walls: bump health/value of every wall block in this span.
      for (const b of blocks) if (b.kind === 'wall' && b.x > x0 && b.x < x0 + wallCols * WW) { b.maxHealth *= 1.8; b.value *= 1.3; }
    }
    if (hasKeep && cfg.keepHeight > 0) {
      const kx = x0 + (wallCols * WW) / 2;
      const KW = 1.0, KH = 0.6;
      const base = cfg.wallHeight * WH;
      for (let r = 0; r < cfg.keepHeight; r++) {
        for (let c = -1; c <= 1; c++) {
          push({ x: kx + c * KW, y: base + KH / 2 + r * KH, w: KW, h: KH, material: mat, value: 1.6, kind: 'keep' });
        }
      }
      // Banner: the lord's standard. Light, but worth a lot.
      push({ x: kx, y: base + cfg.keepHeight * KH + 0.6, w: 0.3, h: 1.2, material: 'timber', value: 6, kind: 'banner' });
    }
    return wallCols * WW;
  };

  const keepIndex = Math.floor((towers - 1) / 2);
  for (let i = 0; i < towers; i++) {
    x += addTower(x);
    if (i < towers - 1) x += addWall(x, i === keepIndex);
  }

  const totalValue = blocks.reduce((s, b) => s + b.value, 0);
  return { blocks, width: x - originX, totalValue };
}

export function freshCastleState(cfg: CastleConfig, originX = CASTLE_DISTANCE): CastleState {
  const layout = layoutCastle(cfg, originX);
  return {
    config: cfg,
    originX,
    blocks: layout.blocks.map<BlockState>((b) => ({ id: b.id, x: b.x, y: b.y, angle: 0, health: b.maxHealth })),
    integrity: 1,
  };
}

/** A block counts as standing if it is still roughly where it was built. */
export function isStanding(def: BlockDef, st: { x: number; y: number; angle: number }): boolean {
  const dy = def.y - st.y;
  const dx = Math.abs(def.x - st.x);
  const tilt = Math.abs(((st.angle + Math.PI) % (Math.PI * 2)) - Math.PI);
  return dy < 0.45 && dx < 0.9 && tilt < 0.6;
}

export function computeIntegrity(layout: CastleLayout, blocks: BlockState[]): number {
  const byId = new Map(layout.blocks.map((b) => [b.id, b]));
  let v = 0;
  for (const st of blocks) {
    const def = byId.get(st.id);
    if (!def) continue;
    if (!isStanding(def, st)) continue;
    v += def.value * Math.max(0, Math.min(1, st.health / def.maxHealth));
  }
  return layout.totalValue > 0 ? v / layout.totalValue : 0;
}
