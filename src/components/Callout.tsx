import { AlertTriangle, ChevronRight, Lightbulb, Network, ShieldAlert } from 'lucide-react';
import type { Callout as CalloutData } from '../data/types';

const STYLE = {
  architecture: { icon: Network, cls: 'border-nx-cyan/30 bg-nx-cyan/5', text: 'text-nx-cyan', label: 'Architecture' },
  tip: { icon: Lightbulb, cls: 'border-nx-amber/30 bg-nx-amber/5', text: 'text-nx-amber', label: 'Tip' },
  warning: { icon: AlertTriangle, cls: 'border-orange-400/30 bg-orange-400/5', text: 'text-orange-300', label: 'Watch out' },
  security: { icon: ShieldAlert, cls: 'border-nx-crimson/30 bg-nx-crimson/5', text: 'text-nx-crimson', label: 'Security' },
} as const;

export function Callout({ callout }: { callout: CalloutData }) {
  const s = STYLE[callout.kind];
  const Icon = s.icon;
  return (
    <aside className={`rounded-xl border p-4 ${s.cls}`}>
      <div className={`mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${s.text}`}>
        <Icon className="h-4 w-4" /> {s.label}
      </div>
      <h4 className="font-semibold text-ink">{callout.title}</h4>
      <p className="mt-1 text-sm leading-relaxed text-slate-300">{callout.body}</p>
      {callout.flow && (
        <div className="mt-4 flex flex-wrap items-center gap-y-2">
          {callout.flow.map((step, i) => (
            <div key={i} className="flex items-center">
              <div className={`rounded-md border border-line bg-obsidian px-2.5 py-1.5 font-mono text-xs text-ink shadow-inner`}>
                <span className={`mr-1.5 ${s.text}`}>{String(i + 1).padStart(2, '0')}</span>
                {step}
              </div>
              {i < callout.flow!.length - 1 && <ChevronRight className={`mx-1 h-4 w-4 ${s.text}`} />}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
