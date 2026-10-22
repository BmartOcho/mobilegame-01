import {
  DEFAULT_CASTLE, DEFAULT_PROJECTILE, DEFAULT_TREBUCHET,
  type CastleConfig, type ProjectileConfig, type TrebuchetConfig,
} from '@siege/sim';

export interface Profile {
  id: string;
  name: string;
  gold: number;
  rating: number;
  games: number;
  wins: number;
  trebuchet: TrebuchetConfig;
  projectile: ProjectileConfig;
  castle: CastleConfig;
  /** Parts/materials already paid for. */
  owned: string[];
}

const KEY = 'siegeworks.profile.v1';

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Profile;
      return { ...defaultProfile(), ...p, trebuchet: { ...DEFAULT_TREBUCHET, ...p.trebuchet }, castle: { ...DEFAULT_CASTLE, ...p.castle } };
    }
  } catch { /* ignore */ }
  return defaultProfile();
}

export function defaultProfile(): Profile {
  const names = ['Ironhand', 'Stonebreaker', 'Ashwood', 'Greymoor', 'Thornfield', 'Blackwell'];
  return {
    id: uid(),
    name: 'Lord ' + names[Math.floor(Math.random() * names.length)],
    gold: 2000,
    rating: 1000,
    games: 0,
    wins: 0,
    trebuchet: { ...DEFAULT_TREBUCHET },
    projectile: { ...DEFAULT_PROJECTILE },
    castle: { ...DEFAULT_CASTLE },
    owned: [],
  };
}

export function saveProfile(p: Profile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export const profile: Profile = loadProfile();
export const save = () => saveProfile(profile);
