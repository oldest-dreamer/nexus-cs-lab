/** Rank ladder — keep in sync with public.rank_for_xp() in supabase_schema.sql */
export interface Rank {
  name: string;
  minXp: number;
}

export const RANKS: Rank[] = [
  { name: 'Initiate', minXp: 0 },
  { name: 'Operator', minXp: 250 },
  { name: 'Engineer', minXp: 750 },
  { name: 'Architect', minXp: 1500 },
  { name: 'Principal', minXp: 3000 },
  { name: 'Nexus Legend', minXp: 6000 },
];

export function rankForXp(xp: number): Rank {
  let current = RANKS[0];
  for (const r of RANKS) if (xp >= r.minXp) current = r;
  return current;
}

export function nextRank(xp: number): Rank | null {
  return RANKS.find((r) => r.minXp > xp) ?? null;
}

/** 0..1 progress from the current rank to the next one. */
export function rankProgress(xp: number): number {
  const cur = rankForXp(xp);
  const nxt = nextRank(xp);
  if (!nxt) return 1;
  return (xp - cur.minXp) / (nxt.minXp - cur.minXp);
}
