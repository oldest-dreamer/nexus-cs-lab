import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, ChevronDown, ChevronsLeft, ChevronsRight, Circle, FlaskConical, LayoutDashboard, Lock, X } from 'lucide-react';
import { LABS, TRACKS, labsForTrack, lessonsOf } from '../data/tracks';
import { accent } from '../lib/theme';
import { useProgress } from '../context/ProgressContext';
import type { Route } from '../hooks/useHashRoute';
import { TrackIcon } from './TrackIcon';

interface Props {
  route: Route;
  navigate: (r: Route) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ route, navigate, collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: Props) {
  const { isComplete } = useProgress();
  const activeTrack =
    route.name === 'track' || route.name === 'lesson'
      ? route.trackId
      : route.name === 'lab'
        ? (LABS.find((l) => l.id === route.labId)?.trackId ?? null)
        : null;
  const [open, setOpen] = useState<Record<string, boolean>>(() => (activeTrack ? { [activeTrack]: true } : {}));

  useEffect(() => {
    if (activeTrack) setOpen((o) => ({ ...o, [activeTrack]: true }));
  }, [activeTrack]);

  const go = (r: Route) => {
    navigate(r);
    onCloseMobile();
  };

  // On mobile the drawer is always expanded.
  const compact = collapsed && !mobileOpen;

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onCloseMobile} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-panel transition-[width,transform] duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${compact ? 'w-[68px]' : 'w-72'}`}
      >
        {/* Brand */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-3">
          <button onClick={() => go({ name: 'home' })} className="flex items-center gap-2.5 overflow-hidden">
            <img src="/favicon.svg" alt="" className="h-8 w-8 shrink-0" />
            {!compact && (
              <span className="whitespace-nowrap font-mono text-sm font-bold tracking-widest text-white">
                NEXUS<span className="text-nx-cyan">::</span>CS LABS
              </span>
            )}
          </button>
          <button className="rounded p-1 text-mute hover:text-ink lg:hidden" onClick={onCloseMobile} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-2">
          <NavItem compact={compact} active={route.name === 'home'} onClick={() => go({ name: 'home' })} icon={<LayoutDashboard className="h-[18px] w-[18px]" />} label="Dashboard" />

          {!compact && <SectionLabel>Tracks</SectionLabel>}
          {TRACKS.map((track) => {
            const a = accent[track.accent];
            const lessons = lessonsOf(track);
            const doneCount = lessons.filter((l) => isComplete(l.id)).length;
            const isOpen = !!open[track.id];
            const isActive = activeTrack === track.id;

            return (
              <div key={track.id}>
                <button
                  title={compact ? track.title : undefined}
                  onClick={() => {
                    if (compact) return go({ name: 'track', trackId: track.id });
                    setOpen((o) => ({ ...o, [track.id]: !o[track.id] }));
                  }}
                  className={`group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    isActive ? 'bg-panel-2 text-white' : 'text-slate-300 hover:bg-panel-2/60 hover:text-white'
                  }`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${a.border} ${a.bgSoft} ${a.text}`}>
                    <TrackIcon name={track.icon} className="h-4 w-4" />
                  </span>
                  {!compact && (
                    <>
                      <span className="flex-1 truncate font-medium">{track.title}</span>
                      <span className="font-mono text-[10px] text-mute">
                        {doneCount}/{lessons.length}
                      </span>
                      <ChevronDown className={`h-4 w-4 text-mute transition ${isOpen ? 'rotate-180' : ''}`} />
                    </>
                  )}
                </button>

                {!compact && isOpen && (
                  <div className="mb-2 ml-[22px] mt-1 space-y-2 border-l border-line pl-3">
                    <button onClick={() => go({ name: 'track', trackId: track.id })} className={`text-xs font-semibold ${a.text} hover:underline`}>
                      Track overview →
                    </button>
                    {track.modules.map((m) => (
                      <div key={m.id}>
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-mute">
                          {m.title} <span className="text-slate-600">· {m.level}</span>
                        </div>
                        <ul className="space-y-0.5">
                          {m.lessons.map((l) => {
                            const active = route.name === 'lesson' && route.lessonId === l.id;
                            const done = isComplete(l.id);
                            return (
                              <li key={l.id}>
                                <button
                                  onClick={() => go({ name: 'lesson', trackId: track.id, lessonId: l.id })}
                                  className={`flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-[13px] leading-snug transition ${
                                    active ? `${a.bgSoft} ${a.text}` : 'text-slate-400 hover:bg-panel-2 hover:text-ink'
                                  }`}
                                >
                                  {done ? (
                                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                  ) : (
                                    <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
                                  )}
                                  <span>{l.title}</span>
                                </button>
                              </li>
                            );
                          })}
                          {m.planned?.map((p) => (
                            <li key={p} className="flex items-start gap-2 px-2 py-1 text-[13px] leading-snug text-slate-600" title="Coming soon">
                              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {labsForTrack(track.id).length > 0 && (
                      <div>
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-mute">Live Labs</div>
                        <ul className="space-y-0.5">
                          {labsForTrack(track.id).map((lab) => {
                            const active = route.name === 'lab' && route.labId === lab.id;
                            return (
                              <li key={lab.id}>
                                <button
                                  onClick={() => go({ name: 'lab', labId: lab.id })}
                                  className={`flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-[13px] leading-snug transition ${
                                    active ? `${a.bgSoft} ${a.text}` : 'text-slate-300 hover:bg-panel-2 hover:text-ink'
                                  }`}
                                >
                                  <FlaskConical className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${accent[lab.accent].text}`} />
                                  <span>{lab.title}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!compact && <SectionLabel>Live Labs</SectionLabel>}
          {LABS.map((lab) => (
            <NavItem
              key={lab.id}
              compact={compact}
              active={route.name === 'lab' && route.labId === lab.id}
              onClick={() => go({ name: 'lab', labId: lab.id })}
              icon={<FlaskConical className={`h-[18px] w-[18px] ${accent[lab.accent].text}`} />}
              label={lab.title}
            />
          ))}
        </nav>

        <button
          onClick={onToggleCollapsed}
          className="hidden h-11 shrink-0 items-center justify-center gap-2 border-t border-line text-xs text-mute hover:text-ink lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
        </button>
      </aside>
    </>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <div className="px-2.5 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{children}</div>;
}

function NavItem({ compact, active, onClick, icon, label }: { compact: boolean; active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      title={compact ? label : undefined}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition ${
        active ? 'bg-nx-cyan/10 text-nx-cyan' : 'text-slate-300 hover:bg-panel-2/60 hover:text-white'
      }`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center">{icon}</span>
      {!compact && <span className="truncate font-medium">{label}</span>}
    </button>
  );
}
