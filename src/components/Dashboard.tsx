import type { ReactNode } from 'react';
import { ArrowRight, BookOpen, Flag, Flame, FlaskConical, Terminal, Trophy, Zap } from 'lucide-react';
import { ALL_LESSONS, LABS, TRACKS, lessonsOf } from '../data/tracks';
import { CHALLENGES } from '../data/challenges';
import { accent } from '../lib/theme';
import { useProgress } from '../context/ProgressContext';
import type { Route } from '../hooks/useHashRoute';
import { TrackIcon } from './TrackIcon';

export function Dashboard({ navigate }: { navigate: (r: Route) => void }) {
  const { xp, rank, streak, completed, flags, isComplete, displayName } = useProgress();
  const doneLessons = Object.keys(completed).length;
  const flagCount = Object.keys(flags).length;

  // "Continue" = first incomplete lesson across tracks
  const resume = ALL_LESSONS.find(({ lesson }) => !isComplete(lesson.id));

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-8">
      {/* Hero */}
      <section className="nx-grid-bg relative overflow-hidden rounded-2xl border border-line bg-panel p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-nx-cyan/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-nx-crimson/10 blur-3xl" />
        <div className="relative">
          <div className="mb-3 flex items-center gap-2 font-mono text-xs text-nx-cyan">
            <Terminal className="h-4 w-4" /> nexus@labs:~$ whoami <span className="text-slate-300">{displayName.toLowerCase()}</span>
            <span className="h-3.5 w-2 animate-blink bg-nx-cyan" />
          </div>
          <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Learn how things <span className="text-nx-cyan">really</span> work, then <span className="text-nx-crimson">break</span> and <span className="text-nx-amber">build</span> them.
          </h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            Five engineering tracks from scratch to advanced. Every chapter explains the intuition like water, shows production code and a real bug, and links to live labs.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {resume ? (
              <button className="nx-btn-primary px-5 py-2.5" onClick={() => navigate({ name: 'lesson', trackId: resume.track.id, lessonId: resume.lesson.id })}>
                {doneLessons ? 'Continue' : 'Start'}: {resume.lesson.title} <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <span className="nx-btn border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">All published lessons complete 🎉</span>
            )}
            <button className="nx-btn-ghost px-5 py-2.5" onClick={() => navigate({ name: 'lab', labId: 'crackme' })}>
              <FlaskConical className="h-4 w-4 text-nx-crimson" /> Open CrackMe Lab
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Zap className="h-5 w-5 text-nx-amber" />} label="Total XP" value={xp.toLocaleString()} />
        <Stat icon={<Trophy className="h-5 w-5 text-nx-cyan" />} label="Rank" value={rank} />
        <Stat icon={<BookOpen className="h-5 w-5 text-emerald-400" />} label="Lessons" value={`${doneLessons} / ${ALL_LESSONS.length}`} />
        <Stat icon={<Flag className="h-5 w-5 text-nx-crimson" />} label="CTF Flags" value={`${flagCount} / ${CHALLENGES.length}`} sub={<><Flame className="h-3.5 w-3.5" /> {streak}-day streak</>} />
      </section>

      {/* Tracks */}
      <section>
        <h2 className="mb-4 text-lg font-bold text-white">Engineering Tracks</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TRACKS.map((t) => {
            const a = accent[t.accent];
            const lessons = lessonsOf(t);
            const done = lessons.filter((l) => isComplete(l.id)).length;
            const planned = t.modules.reduce((n, m) => n + (m.planned?.length ?? 0), 0);
            const pct = lessons.length ? Math.round((done / lessons.length) * 100) : 0;
            return (
              <button
                key={t.id}
                onClick={() => navigate({ name: 'track', trackId: t.id })}
                className={`nx-card group flex flex-col p-5 text-left transition hover:-translate-y-0.5 hover:border-transparent hover:ring-1 ${a.ring}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-lg border ${a.border} ${a.bgSoft} ${a.text}`}>
                    <TrackIcon name={t.icon} className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-xs text-mute">{t.modules.length} modules</span>
                </div>
                <h3 className="font-bold text-white">{t.title}</h3>
                <p className="mt-1 flex-1 text-sm text-slate-400">{t.tagline}</p>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between font-mono text-[11px] text-mute">
                    <span>{done}/{lessons.length} lessons · {planned} on roadmap</span>
                    <span className={a.text}>{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
                    <div className={`h-full rounded-full ${a.bg} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Labs */}
      <section>
        <h2 className="mb-4 text-lg font-bold text-white">Live Labs</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {LABS.map((lab) => {
            const a = accent[lab.accent];
            return (
              <button key={lab.id} onClick={() => navigate({ name: 'lab', labId: lab.id })} className={`nx-card group p-5 text-left transition hover:ring-1 ${a.ring}`}>
                <div className={`mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${a.text}`}>
                  <FlaskConical className="h-4 w-4" /> Interactive
                </div>
                <h3 className="font-bold text-white">{lab.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{lab.blurb}</p>
                <span className={`mt-3 inline-flex items-center gap-1 text-sm font-semibold ${a.text}`}>
                  Launch <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="nx-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-mute">{label}</span>
        {icon}
      </div>
      <div className="truncate text-2xl font-extrabold text-white">{value}</div>
      {sub && <div className="mt-1 flex items-center gap-1 text-xs text-nx-crimson">{sub}</div>}
    </div>
  );
}
