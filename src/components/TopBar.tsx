import { Cloud, Flame, HardDrive, LogIn, LogOut, Menu, Trophy } from 'lucide-react';
import { useProgress } from '../context/ProgressContext';
import { nextRank, rankProgress } from '../lib/ranks';

export function TopBar({ onOpenMenu, onOpenAuth }: { onOpenMenu: () => void; onOpenAuth: () => void }) {
  const { xp, rank, streak, mode, configured, session, signOut, displayName } = useProgress();
  const nxt = nextRank(xp);
  const pct = Math.round(rankProgress(xp) * 100);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-obsidian/85 px-3 backdrop-blur sm:px-5">
      <button className="rounded-md p-1.5 text-mute hover:text-ink lg:hidden" onClick={onOpenMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>

      {/* XP + rank */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-nx-amber/30 bg-nx-amber/10 px-2 py-1">
          <Trophy className="h-4 w-4 text-nx-amber" />
          <span className="text-xs font-bold text-nx-amber">{rank}</span>
        </div>
        <div className="hidden min-w-0 max-w-xs flex-1 sm:block">
          <div className="mb-1 flex justify-between font-mono text-[10px] text-mute">
            <span>{xp.toLocaleString()} XP</span>
            <span>{nxt ? `${nxt.minXp.toLocaleString()} → ${nxt.name}` : 'MAX RANK'}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full rounded-full bg-gradient-to-r from-nx-cyan to-nx-amber transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1 text-sm font-semibold text-nx-crimson" title="Daily streak">
          <Flame className="h-4 w-4" /> {streak}
        </div>
      </div>

      {/* Sync mode + auth */}
      <div className="flex items-center gap-2">
        <span
          className={`nx-chip hidden md:inline-flex ${mode === 'cloud' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-line text-mute'}`}
          title={mode === 'cloud' ? 'Progress syncs to Supabase' : configured ? 'Sign in to sync progress' : 'Supabase not configured: localStorage mode'}
        >
          {mode === 'cloud' ? <Cloud className="h-3 w-3" /> : <HardDrive className="h-3 w-3" />}
          {mode === 'cloud' ? 'Cloud sync' : 'Local mode'}
        </span>
        {session ? (
          <button className="nx-btn-ghost py-1.5" onClick={() => signOut()}>
            <span className="hidden max-w-[8rem] truncate sm:inline">{displayName}</span>
            <LogOut className="h-4 w-4" />
          </button>
        ) : (
          <button className="nx-btn-ghost py-1.5" onClick={onOpenAuth}>
            <LogIn className="h-4 w-4" /> <span className="hidden sm:inline">Sign in</span>
          </button>
        )}
      </div>
    </header>
  );
}
