import type { Application, Graphics } from 'pixi.js';
import type { Rapier } from '@siege/sim';

export interface AppCtx {
  app: Application;
  R: Rapier;
  ui: HTMLElement;
  gfx: Graphics;
  /** Per-frame hook of the active screen. dt seconds, time seconds since start. */
  tick: ((dt: number, time: number) => void) | null;
}
