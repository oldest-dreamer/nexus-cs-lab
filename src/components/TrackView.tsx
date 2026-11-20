import { ArrowRight, CheckCircle2, ChevronRight, Clock, FlaskConical, Lock, Zap } from 'lucide-react';
import type { Track } from '../data/types';
import { labsForTrack, lessonsOf } from '../data/tracks';
import { accent } from '../lib/theme';
import { useProgress } from '../context/ProgressContext';
import type { Route } from '../hooks/useHashRoute';
import { TrackIcon } from './TrackIcon';

export function TrackView({ track, navigate }: { track: Track; navigate: (r: Route) => void }) {
  const a = accent[track.accent];
  const { isComplete } = useProgress();
  const lessons = lessonsOf(track);
  const done = lessons.filter((l) => isComplete(l.id)).length;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border ${a.border} ${a.bgSoft} ${a.text} ${a.glow}`}>
          <TrackIcon name={track.icon} className="h-7 w-7" />
        </span>
        <div className="flex-1">
          <h1 className="text-3xl font-extrabold text-white">{track.title}</h1>
          <p className="text-slate-400">{track.tagline}</p>
        </div>
        <div className="font-mono text-sm text-mute">
          <span className={a.text}>{done}</span>/{lessons.length} complete
        </div>
      </header>

      {labsForTrack(track.id).length > 0 && (
        <section className="grid gap-3 md:grid-cols-2">
          {labsForTrack(track.id).map((lab) => {
            const la = accent[lab.accent];
            return (
              <button
                key={lab.id}
                onClick={() => navigate({ name: 'lab', labId: lab.id })}
                className={`nx-card group flex items-start gap-3 p-4 text-left transition hover:ring-1 ${la.ring}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${la.border} ${la.bgSoft} ${la.text}`}>
                  <FlaskConical className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[10px] font-bold uppercase tracking-widest ${la.text}`}>Live lab</span>
                  <span className="block font-semibold text-white">{lab.title}</span>
                  <span className="block text-sm text-slate-400">{lab.blurb}</span>
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-mute transition group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </section>
      )}

      <ol className="space-y-6">
        {track.modules.map((m, mi) => (
          <li key={m.id} className="nx-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line bg-panel-2/50 px-5 py-3">
              <div>
                <div className="font-mono text-[11px] text-mute">MODULE {String(mi + 1).padStart(2, '0')} · {m.level.toUpperCase()}</div>
                <h2 className="font-bold text-white">{m.title}</h2>
              </div>
              <span className="font-mono text-xs text-mute">{m.lessons.length + (m.planned?.length ?? 0)} chapters</span>
            </div>
            <ul className="divide-y divide-line">
              {m.lessons.map((l) => {
                const d = isComplete(l.id);
                return (
                  <li key={l.id}>
                    <button
                      onClick={() => navigate({ name: 'lesson', trackId: track.id, lessonId: l.id })}
                      className="group flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-panel-2/60"
                    >
                      {d ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" /> : <span className={`h-5 w-5 shrink-0 rounded-full border-2 ${a.border}`} />}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-ink group-hover:text-white">{l.title}</div>
                        <div className="truncate text-sm text-slate-400">{l.summary}</div>
                      </div>
                      <div className="hidden shrink-0 items-center gap-3 font-mono text-xs text-mute sm:flex">
                        {l.labId && <FlaskConical className="h-4 w-4 text-nx-crimson" />}
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{l.minutes}m</span>
                        <span className="flex items-center gap-1 text-nx-amber"><Zap className="h-3.5 w-3.5" />{l.xp}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-mute transition group-hover:translate-x-0.5" />
                    </button>
                  </li>
                );
              })}
              {m.planned?.map((p) => (
                <li key={p} className="flex items-center gap-4 px-5 py-3 text-slate-600">
                  <Lock className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{p}</span>
                  <span className="nx-chip border-line text-slate-600">Coming soon</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
