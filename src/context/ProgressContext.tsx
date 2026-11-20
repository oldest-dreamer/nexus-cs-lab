import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  supabase,
  isSupabaseConfigured,
  type CtfFlagRow,
  type LessonProgressRow,
  type ProfileRow,
  type SubmitFlagResult,
} from '../lib/supabase';
import { clearLocal, loadLocal, saveLocal, withActivity, type LocalProgress } from '../lib/localStore';
import { rankForXp } from '../lib/ranks';
import { sha256Hex } from '../lib/hash';
import { challengeById } from '../data/challenges';

export type SyncMode = 'local' | 'cloud';

export interface Toast {
  id: number;
  kind: 'xp' | 'flag' | 'info' | 'error';
  message: string;
}

interface ProgressContextValue {
  mode: SyncMode;
  configured: boolean;
  loading: boolean;
  session: Session | null;
  displayName: string;
  xp: number;
  rank: string;
  streak: number;
  completed: Record<string, { trackId: string; completedAt: string }>;
  flags: Record<string, { points: number; capturedAt: string }>;
  isComplete: (lessonId: string) => boolean;
  hasFlag: (challengeId: string) => boolean;
  completeLesson: (lessonId: string, trackId: string, xp: number) => Promise<number>;
  submitFlag: (challengeId: string, flag: string) => Promise<SubmitFlagResult>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, displayName?: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  resetLocalProgress: () => void;
  toasts: Toast[];
  pushToast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: number) => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

interface CloudState {
  profile: ProfileRow | null;
  lessons: LessonProgressRow[];
  flags: CtfFlagRow[];
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [local, setLocal] = useState<LocalProgress>(() => loadLocal());
  const [cloud, setCloud] = useState<CloudState>({ profile: null, lessons: [], flags: [] });
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const mode: SyncMode = supabase && session ? 'cloud' : 'local';

  // ---- toasts ---------------------------------------------------------------
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const pushToast = useCallback(
    (kind: Toast['kind'], message: string) => {
      const id = ++toastId.current;
      setToasts((t) => [...t.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismissToast(id), 3800);
    },
    [dismissToast],
  );

  // ---- persist local --------------------------------------------------------
  useEffect(() => saveLocal(local), [local]);

  // ---- cloud fetch ----------------------------------------------------------
  const refreshCloud = useCallback(async (userId: string) => {
    if (!supabase) return;
    const [p, l, f] = await Promise.all([
      supabase.from('profiles').select('id, display_name, xp, rank, streak, last_active_date').eq('id', userId).maybeSingle(),
      supabase.from('lesson_progress').select('lesson_id, track_id, xp_awarded, completed_at'),
      supabase.from('ctf_flags').select('challenge_id, points, captured_at'),
    ]);
    if (p.error || l.error || f.error) {
      console.error('[nexus] cloud refresh failed', p.error ?? l.error ?? f.error);
      return;
    }
    setCloud({
      profile: (p.data as ProfileRow | null) ?? null,
      lessons: (l.data as LessonProgressRow[]) ?? [],
      flags: (f.data as CtfFlagRow[]) ?? [],
    });
  }, []);

  /** Push guest (local) progress into the account after sign-in, then clear it. */
  const syncLocalToCloud = useCallback(async () => {
    if (!supabase) return;
    const snapshot = loadLocal();
    const lessonEntries = Object.entries(snapshot.lessons);
    const flagEntries = Object.entries(snapshot.flags);
    if (!lessonEntries.length && !flagEntries.length) return;

    let ok = true;
    for (const [lessonId, v] of lessonEntries) {
      const { error } = await supabase.rpc('complete_lesson', { p_lesson_id: lessonId, p_track_id: v.trackId, p_xp: v.xp });
      if (error) ok = false;
    }
    for (const [challengeId, v] of flagEntries) {
      const { error } = await supabase.rpc('submit_flag', { p_challenge_id: challengeId, p_flag: v.flag });
      if (error) ok = false;
    }
    if (ok) {
      clearLocal();
      setLocal(loadLocal());
      pushToast('info', `Synced ${lessonEntries.length} lessons & ${flagEntries.length} flags to your account`);
    }
  }, [pushToast]);

  // ---- auth wiring ----------------------------------------------------------
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) {
      setCloud({ profile: null, lessons: [], flags: [] });
      return;
    }
    let cancelled = false;
    setLoading(true);
    // Defer out of the auth callback tick (supabase-js recommends not awaiting inside it).
    const t = window.setTimeout(async () => {
      await syncLocalToCloud();
      if (!cancelled) await refreshCloud(userId);
      if (!cancelled) setLoading(false);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [userId, refreshCloud, syncLocalToCloud]);

  // ---- derived view ---------------------------------------------------------
  const view = useMemo(() => {
    if (mode === 'cloud') {
      const completed: ProgressContextValue['completed'] = {};
      for (const r of cloud.lessons) completed[r.lesson_id] = { trackId: r.track_id, completedAt: r.completed_at };
      const flags: ProgressContextValue['flags'] = {};
      for (const r of cloud.flags) flags[r.challenge_id] = { points: r.points, capturedAt: r.captured_at };
      const xp = cloud.profile?.xp ?? 0;
      return {
        xp,
        rank: cloud.profile?.rank ?? rankForXp(xp).name,
        streak: cloud.profile?.streak ?? 0,
        completed,
        flags,
        displayName: cloud.profile?.display_name ?? session?.user.email?.split('@')[0] ?? 'Operator',
      };
    }
    return {
      xp: local.xp,
      rank: rankForXp(local.xp).name,
      streak: local.streak,
      completed: local.lessons,
      flags: local.flags,
      displayName: 'Guest',
    };
  }, [mode, cloud, local, session]);

  // ---- actions --------------------------------------------------------------
  const completeLesson = useCallback(
    async (lessonId: string, trackId: string, xp: number): Promise<number> => {
      if (mode === 'cloud' && supabase && userId) {
        const { data, error } = await supabase.rpc('complete_lesson', { p_lesson_id: lessonId, p_track_id: trackId, p_xp: xp });
        if (error) {
          pushToast('error', `Sync failed: ${error.message}`);
          return 0;
        }
        await refreshCloud(userId);
        const awarded = Number(data ?? 0);
        if (awarded > 0) pushToast('xp', `+${awarded} XP — lesson complete`);
        return awarded;
      }
      if (local.lessons[lessonId]) return 0;
      setLocal((prev) => {
        if (prev.lessons[lessonId]) return prev;
        const next = withActivity(prev, xp);
        return { ...next, lessons: { ...prev.lessons, [lessonId]: { trackId, xp, completedAt: new Date().toISOString() } } };
      });
      pushToast('xp', `+${xp} XP — lesson complete`);
      return xp;
    },
    [mode, userId, local.lessons, refreshCloud, pushToast],
  );

  const submitFlag = useCallback(
    async (challengeId: string, rawFlag: string): Promise<SubmitFlagResult> => {
      const flag = rawFlag.trim();
      const challenge = challengeById(challengeId);
      if (!challenge) return 'unknown_challenge';

      if (mode === 'cloud' && supabase && userId) {
        const { data, error } = await supabase.rpc('submit_flag', { p_challenge_id: challengeId, p_flag: flag });
        if (error) {
          pushToast('error', `Flag submit failed: ${error.message}`);
          return 'wrong_flag';
        }
        const result = data as SubmitFlagResult;
        if (result === 'captured') {
          await refreshCloud(userId);
          pushToast('flag', `🚩 Flag captured: ${challenge.title} (+${challenge.points} XP)`);
        }
        return result;
      }

      if ((await sha256Hex(flag)) !== challenge.flagHash) return 'wrong_flag';
      if (local.flags[challengeId]) return 'already_captured';
      setLocal((prev) => {
        if (prev.flags[challengeId]) return prev;
        const next = withActivity(prev, challenge.points);
        return {
          ...next,
          flags: { ...prev.flags, [challengeId]: { points: challenge.points, capturedAt: new Date().toISOString(), flag } },
        };
      });
      pushToast('flag', `🚩 Flag captured: ${challenge.title} (+${challenge.points} XP)`);
      return 'captured';
    },
    [mode, userId, local.flags, refreshCloud, pushToast],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'Supabase is not configured. Add your keys to .env.local.';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    if (!supabase) return 'Supabase is not configured. Add your keys to .env.local.';
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: displayName ? { display_name: displayName } : undefined, emailRedirectTo: window.location.origin },
    });
    return error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setLocal(loadLocal());
  }, []);

  const resetLocalProgress = useCallback(() => {
    clearLocal();
    setLocal(loadLocal());
  }, []);

  const value: ProgressContextValue = {
    mode,
    configured: isSupabaseConfigured,
    loading,
    session,
    ...view,
    isComplete: (id) => Boolean(view.completed[id]),
    hasFlag: (id) => Boolean(view.flags[id]),
    completeLesson,
    submitFlag,
    signIn,
    signUp,
    signOut,
    resetLocalProgress,
    toasts,
    pushToast,
    dismissToast,
  };

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress must be used inside <ProgressProvider>');
  return ctx;
}
