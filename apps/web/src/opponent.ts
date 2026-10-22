import type { AimInput, CastleConfig, CastleState, ProjectileConfig, TrebuchetConfig, WindSpec, Rapier } from '@siege/sim';

export interface AimContext { R: Rapier; castle: CastleState; wind: WindSpec; round: number }
export interface MatchEnd { delta: number; rating: number }

export interface Opponent {
  name: string;
  rating: number;
  castle: CastleConfig;
  trebuchet: TrebuchetConfig;
  projectile: ProjectileConfig;
  /** Produce this turn's aim. Local AI simulates; the server pilots a remote player's kit. */
  aim(ctx: AimContext): Promise<AimInput>;
  /** Player fired: a remote opponent sends it to the server, which may hand back the authoritative castle. */
  onPlayerShot?(aim: AimInput, result: { damage: number; integrityAfter: number }): Promise<{ castleAfter?: CastleState } | void>;
  /** Opponent's shot replayed locally; the server may hand back its authoritative castle. */
  afterOpponentShot?(result: { damage: number; integrityAfter: number }): Promise<{ castleAfter?: CastleState } | void>;
  /** Match over (natural = played out, else quit). Returns server rating change when online. */
  settle?(natural: boolean): Promise<MatchEnd | undefined>;
}

export interface MatchSummary {
  won: boolean | null; // null = draw
  natural: boolean;
  myIntegrity: number;
  theirIntegrity: number;
  damageDealt: number;
  rounds: number;
  opponent: Opponent;
}
