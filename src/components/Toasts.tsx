import { AlertCircle, Flag, Info, Zap } from 'lucide-react';
import { useProgress } from '../context/ProgressContext';

const STYLE = {
  xp: { icon: Zap, cls: 'border-nx-amber/40 text-nx-amber' },
  flag: { icon: Flag, cls: 'border-nx-crimson/40 text-nx-crimson' },
  info: { icon: Info, cls: 'border-nx-cyan/40 text-nx-cyan' },
  error: { icon: AlertCircle, cls: 'border-nx-crimson/60 text-rose-300' },
} as const;

export function Toasts() {
  const { toasts, dismissToast } = useProgress();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const s = STYLE[t.kind];
        const Icon = s.icon;
        return (
          <button
            key={t.id}
            onClick={() => dismissToast(t.id)}
            className={`pointer-events-auto flex animate-toast-in items-center gap-2.5 rounded-lg border bg-panel/95 px-3.5 py-2.5 text-left text-sm font-semibold shadow-xl backdrop-blur ${s.cls}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="text-ink">{t.message}</span>
          </button>
        );
      })}
    </div>
  );
}
