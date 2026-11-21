/**
 * Curriculum registry. To add content:
 *   1. Add a Lesson object to the right module in src/data/lessons/<track>.ts
 *   2. (optional) Move a title out of `planned` once it is authored.
 * To add a whole new track, create a file in ./lessons and append it to TRACKS.
 */
import type { LabMeta, Lesson, Module, Track } from './types';
import { webTrack } from './lessons/web';
import { appTrack } from './lessons/app';
import { gameTrack } from './lessons/game';
import { aiTrack } from './lessons/ai';
import { cyberTrack } from './lessons/cyber';

export const TRACKS: Track[] = [webTrack, appTrack, gameTrack, aiTrack, cyberTrack];

export const LABS: LabMeta[] = [
  {
    id: 'crackme',
    title: 'CrackMe Sandbox: vault_trial_v1.exe',
    trackId: 'cyber',
    accent: 'crimson',
    blurb: 'Strings analysis, keygen reversal and x86 binary patching on a safe simulated binary.',
  },
  {
    id: 'neural-net',
    title: 'Neural Network & Token X-Ray',
    trackId: 'ai',
    accent: 'cyan',
    blurb: 'Place points, watch a pure-TypeScript MLP train live, then X-ray how text becomes tokens.',
  },
  {
    id: 'game-engine',
    title: '2D Canvas Engine Sandbox',
    trackId: 'game',
    accent: 'amber',
    blurb: 'A 60fps fixed-timestep platformer with live physics sliders and hitboxes, plus a step-by-step A* visualizer.',
  },
  {
    id: 'prompt-security',
    title: 'Red-Team Prompt Injection & Attention X-Ray',
    trackId: 'ai',
    accent: 'crimson',
    blurb: 'Break a simulated LLM across 4 CTF levels, toggle Blue-Team guardrails, and see injected tokens hijack attention.',
  },
  {
    id: 'web-internals',
    title: 'JS Event Loop & React Render Visualizer',
    trackId: 'web',
    accent: 'cyan',
    blurb: 'Step through the call stack, Web APIs and task queues line by line, then X-ray real React re-renders with memo and useCallback.',
  },
  {
    id: 'app-architecture',
    title: 'Mobile Offline Sync & API Inspector',
    trackId: 'app',
    accent: 'amber',
    blurb: 'A phone-frame app with an outbox, Online/3G/Offline modes, live HTTP status codes and a 409 conflict resolver.',
  },
];

export const labsForTrack = (trackId: string) => LABS.filter((l) => l.trackId === trackId);

export interface LessonLocation {
  track: Track;
  module: Module;
  lesson: Lesson;
  index: number; // position within the track's flat lesson list
  prev?: Lesson;
  next?: Lesson;
}

export const trackById = (id: string) => TRACKS.find((t) => t.id === id);

export const lessonsOf = (track: Track): Lesson[] => track.modules.flatMap((m) => m.lessons);

export function locateLesson(trackId: string, lessonId: string): LessonLocation | null {
  const track = trackById(trackId);
  if (!track) return null;
  const flat = lessonsOf(track);
  const index = flat.findIndex((l) => l.id === lessonId);
  if (index < 0) return null;
  const module = track.modules.find((m) => m.lessons.some((l) => l.id === lessonId))!;
  return { track, module, lesson: flat[index], index, prev: flat[index - 1], next: flat[index + 1] };
}

export const ALL_LESSONS = TRACKS.flatMap((t) => lessonsOf(t).map((lesson) => ({ track: t, lesson })));
export const TOTAL_XP_AVAILABLE = ALL_LESSONS.reduce((n, x) => n + x.lesson.xp, 0);

// Dev-time guard: lesson ids must be globally unique (they're DB keys).
if (import.meta.env.DEV) {
  const seen = new Set<string>();
  for (const { lesson } of ALL_LESSONS) {
    if (seen.has(lesson.id)) console.error('[nexus] duplicate lesson id:', lesson.id);
    seen.add(lesson.id);
  }
}
