/**
 * Content model for the lesson engine.
 * Add chapters by adding objects to src/data/lessons/*.ts — the UI never changes.
 */
export type Accent = 'cyan' | 'amber' | 'crimson';
export type Difficulty = 'Scratch' | 'Beginner' | 'Intermediate' | 'Advanced';
export type TrackIcon = 'globe' | 'smartphone' | 'gamepad' | 'brain' | 'shield';
export const LAB_IDS = ['crackme', 'neural-net', 'game-engine', 'prompt-security', 'web-internals', 'app-architecture'] as const;
export type LabId = (typeof LAB_IDS)[number];

export interface CodeSample {
  language: 'ts' | 'tsx' | 'js' | 'html' | 'css' | 'py' | 'c' | 'asm' | 'sql' | 'bash' | 'text';
  filename?: string;
  code: string;
}

/** One "drop of water": a small, single-idea step of intuition. */
export interface IntuitionStep {
  title: string;
  body: string;
}

export interface Callout {
  kind: 'architecture' | 'tip' | 'warning' | 'security';
  title: string;
  body: string;
  /** Optional left→right pipeline rendered as connected boxes. */
  flow?: string[];
}

export interface Lesson {
  id: string; // globally unique, e.g. "web-critical-rendering-path"
  title: string;
  summary: string;
  difficulty: Difficulty;
  minutes: number;
  xp: number;
  /** One-line analogy shown at the top ("Explain Like Water"). */
  analogy: string;
  intuition: IntuitionStep[];
  callouts: Callout[];
  code: {
    basic: CodeSample & { explanation: string };
    production: CodeSample & { explanation: string };
    bug: { buggy: CodeSample; fixed: CodeSample; explanation: string };
  };
  takeaways: string[];
  /** Embed a live interactive lab below the lesson. */
  labId?: LabId;
  /** Optional starting mode/tab for the embedded lab (lab-specific, e.g. 'astar'). */
  labMode?: string;
}

export interface Module {
  id: string;
  title: string;
  level: Difficulty;
  lessons: Lesson[];
  /** Roadmap titles not yet authored — shown as locked "coming soon" items. */
  planned?: string[];
}

export interface Track {
  id: string;
  title: string;
  short: string;
  tagline: string;
  accent: Accent;
  icon: TrackIcon;
  modules: Module[];
}

export interface LabMeta {
  id: LabId;
  title: string;
  trackId: string;
  accent: Accent;
  blurb: string;
}
