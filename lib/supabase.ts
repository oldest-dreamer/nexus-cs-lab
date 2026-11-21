import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client with a graceful offline fallback.
 *
 * If VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are missing (or still
 * the placeholder values from .env.example), `supabase` is `null` and the app
 * runs in LOCAL mode: progress is stored in localStorage instead.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

const looksReal =
  /^https:\/\/.+\.supabase\.(co|in|net)\/?$/.test(url) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url);
const isPlaceholder = url.includes('your-project-ref') || key.includes('xxxxxxxx');

export const isSupabaseConfigured = Boolean(url && key && looksReal && !isPlaceholder);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'nexus-cs-labs-auth',
      },
    })
  : null;

/** Row shapes returned by the database (see supabase_schema.sql). */
export interface ProfileRow {
  id: string;
  display_name: string | null;
  xp: number;
  rank: string;
  streak: number;
  last_active_date: string | null;
}

export interface LessonProgressRow {
  lesson_id: string;
  track_id: string;
  xp_awarded: number;
  completed_at: string;
}

export interface CtfFlagRow {
  challenge_id: string;
  points: number;
  captured_at: string;
}

export type SubmitFlagResult = 'captured' | 'already_captured' | 'wrong_flag' | 'unknown_challenge';
