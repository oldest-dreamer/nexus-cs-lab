import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

export function Hints({ hints }: { hints: string[] }) {
  const [shown, setShown] = useState(0);
  return (
    <div className="space-y-2">
      {hints.slice(0, shown).map((h, i) => (
        <p key={i} className="rounded-md border border-line bg-panel-2/60 px-3 py-2 text-sm text-slate-300">
          <span className="mr-2 font-mono text-xs text-nx-amber">HINT {i + 1}</span>
          {h}
        </p>
      ))}
      {shown < hints.length && (
        <button onClick={() => setShown((s) => s + 1)} className="flex items-center gap-1.5 text-xs font-semibold text-mute hover:text-nx-amber">
          <HelpCircle className="h-3.5 w-3.5" /> Reveal hint {shown + 1}/{hints.length}
        </button>
      )}
    </div>
  );
}
