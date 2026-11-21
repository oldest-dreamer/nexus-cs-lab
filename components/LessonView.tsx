import { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Droplets, FlaskConical, Loader2, Sparkles, Zap } from 'lucide-react';
import type { LessonLocation } from '../data/tracks';
import { accent } from '../lib/theme';
import { useProgress } from '../context/ProgressContext';
import type { Route } from '../hooks/useHashRoute';
import { Callout } from './Callout';
import { CodeExplorer } from './CodeExplorer';
import { RichText } from './RichText';
import { LabHost } from '../labs';

const DIFF_CLS = {
  Scratch: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10',
  Beginner: 'border-nx-cyan/40 text-nx-cyan bg-nx-cyan/10',
  Intermediate: 'border-nx-amber/40 text-nx-amber bg-nx-amber/10',
  Advanced: 'border-nx-crimson/40 text-nx-crimson bg-nx-crimson/10',
} as const;

/**
 * Renders any Lesson object. Pure data in → full lesson page out.
 */
export function LessonView({ loc, navigate }: { loc: LessonLocation; navigate: (r: Route) => void }) {
  const { track, module, lesson, prev, next } = loc;
  const a = accent[track.accent];
  const { isComplete, completeLesson, mode } = useProgress();
  const done = isComplete(lesson.id);
  const [busy, setBusy] = useState(false);

  const onComplete = async () => {
    if (done || busy) return;
    setBusy(true);
    try {
      await completeLesson(lesson.id, track.id, lesson.xp);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-8">
      {/* Header */}
      <header className="space-y-4">
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-mute">
          <button className="hover:text-ink" onClick={() => navigate({ name: 'home' })}>Dashboard</button>
          <span>/</span>
          <button className={`hover:text-ink ${a.text}`} onClick={() => navigate({ name: 'track', trackId: track.id })}>{track.title}</button>
          <span>/</span>
          <span>{module.title}</span>
        </nav>
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{lesson.title}</h1>
        <p className="max-w-3xl text-lg text-slate-300">{lesson.summary}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`nx-chip ${DIFF_CLS[lesson.difficulty]}`}>{lesson.difficulty}</span>
          <span className="nx-chip border-line text-mute"><Clock className="h-3 w-3" /> {lesson.minutes} min</span>
          <span className="nx-chip border-nx-amber/40 bg-nx-amber/10 text-nx-amber"><Zap className="h-3 w-3" /> {lesson.xp} XP</span>
          {lesson.labId && <span className="nx-chip border-nx-crimson/40 bg-nx-crimson/10 text-nx-crimson"><FlaskConical className="h-3 w-3" /> Live Lab</span>}
          {done && <span className="nx-chip border-emerald-500/40 bg-emerald-500/10 text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Completed</span>}
        </div>
      </header>

      {/* Explain Like Water */}
      <section className={`relative overflow-hidden rounded-xl border ${a.border} ${a.bgSoft} p-5`}>
        <Droplets className={`absolute -right-4 -top-4 h-24 w-24 opacity-10 ${a.text}`} />
        <div className={`mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${a.text}`}>
          <Droplets className="h-4 w-4" /> Explain like water
        </div>
        <p className="relative text-base leading-relaxed text-slate-100">{lesson.analogy}</p>
      </section>

      {/* Intuition steps */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
          <Sparkles className={`h-5 w-5 ${a.text}`} /> Step-by-step intuition
        </h2>
        <ol className="relative ml-3 space-y-4 border-l border-line pl-6">
          {lesson.intuition.map((step, i) => (
            <li key={i} className="relative">
              <span className={`absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full border ${a.border} bg-obsidian font-mono text-[11px] font-bold ${a.text}`}>
                {i + 1}
              </span>
              <h3 className="font-semibold text-ink">{step.title}</h3>
              <p className="mt-1 leading-relaxed text-slate-300"><RichText text={step.body} /></p>
            </li>
          ))}
        </ol>
      </section>

      {/* Callouts */}
      {lesson.callouts.length > 0 && (
        <section className="grid gap-4 lg:grid-cols-2">
          {lesson.callouts.map((c, i) => (
            <div key={i} className={c.flow ? 'lg:col-span-2' : ''}>
              <Callout callout={c} />
            </div>
          ))}
        </section>
      )}

      {/* Code */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-white">Code Explorer</h2>
        <CodeExplorer code={lesson.code} />
      </section>

      {/* Lab */}
      {lesson.labId && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
            <FlaskConical className="h-5 w-5 text-nx-crimson" /> Interactive Lab
          </h2>
          <LabHost id={lesson.labId} mode={lesson.labMode} />
        </section>
      )}

      {/* Takeaways + complete */}
      <section className="nx-card flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-mute">Key takeaways</h2>
          <ul className="space-y-1.5">
            {lesson.takeaways.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-200">
                <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${a.text}`} /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1.5 md:items-end">
          <button
            onClick={onComplete}
            disabled={done || busy}
            className={done ? 'nx-btn border border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'nx-btn-primary px-5 py-2.5'}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {done ? 'Completed' : `Mark Complete · +${lesson.xp} XP`}
          </button>
          <span className="text-[11px] text-mute">{mode === 'cloud' ? 'Synced to your Supabase account' : 'Saved locally on this device'}</span>
        </div>
      </section>

      {/* Prev / Next */}
      <nav className="flex items-center justify-between gap-3 border-t border-line pt-6">
        {prev ? (
          <button className="nx-btn-ghost" onClick={() => navigate({ name: 'lesson', trackId: track.id, lessonId: prev.id })}>
            <ArrowLeft className="h-4 w-4" /> <span className="max-w-[14rem] truncate">{prev.title}</span>
          </button>
        ) : <span />}
        {next ? (
          <button className="nx-btn-ghost" onClick={() => navigate({ name: 'lesson', trackId: track.id, lessonId: next.id })}>
            <span className="max-w-[14rem] truncate">{next.title}</span> <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button className="nx-btn-ghost" onClick={() => navigate({ name: 'track', trackId: track.id })}>
            Track overview <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </nav>
    </article>
  );
}
