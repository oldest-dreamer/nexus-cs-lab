/**
 * localStorage persistence used when Supabase isn't configured or the user
 * isn't signed in. Mirrors the server logic (idempotent XP, daily streak).
 */
export interface LocalProgress {
  version: 1;
  xp: number;
  streak: number;
  lastActiveDate: string | null; // YYYY-MM-DD (UTC)
  lessons: Record<string, { trackId: string; xp: number; completedAt: string }>;
  flags: Record<string, { points: number; capturedAt: string; flag: string }>;
}

const KEY = 'nexus-cs-labs:progress:v1';

export const emptyProgress = (): LocalProgress => ({
  version: 1,
  xp: 0,
  streak: 0,
  lastActiveDate: null,
  lessons: {},
  flags: {},
});

export function todayUtc(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return todayUtc(d);
}

export function loadLocal(): LocalProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<LocalProgress>;
    if (parsed.version !== 1) return emptyProgress();
    return { ...emptyProgress(), ...parsed } as LocalProgress;
  } catch {
    return emptyProgress();
  }
}

export function saveLocal(p: LocalProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked (private mode) — progress stays in memory */
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Same streak rule as public.apply_activity(). */
export function withActivity(p: LocalProgress, xpGain: number): LocalProgress {
  const today = todayUtc();
  let streak = 1;
  if (p.lastActiveDate === today) streak = Math.max(p.streak, 1);
  else if (p.lastActiveDate === yesterdayUtc()) streak = p.streak + 1;
  return { ...p, xp: p.xp + Math.max(0, xpGain), streak, lastActiveDate: today };
}
