/** Classic Elo. K tapers once a player has played enough ranked games. */
export function eloDelta(ratingA: number, ratingB: number, scoreA: 0 | 0.5 | 1, gamesA: number): number {
  const k = gamesA < 10 ? 48 : gamesA < 30 ? 32 : 24;
  const expected = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  return Math.round(k * (scoreA - expected));
}

export const RANK_TIERS = [
  { name: 'Peasant', min: 0 },
  { name: 'Squire', min: 1100 },
  { name: 'Knight', min: 1250 },
  { name: 'Baron', min: 1400 },
  { name: 'Count', min: 1550 },
  { name: 'Duke', min: 1700 },
  { name: 'Warlord', min: 1900 },
] as const;

export function rankName(rating: number): string {
  let r: string = RANK_TIERS[0].name;
  for (const t of RANK_TIERS) if (rating >= t.min) r = t.name;
  return r;
}
