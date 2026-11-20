import type { ReactNode } from 'react';

/** Small control primitives shared by the interactive labs. */

export function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2/40 p-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-mute">{label}</div>
      {children}
    </div>
  );
}

export function Slider({ label, unit, min, max, step, value, onChange }: { label: string; unit?: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="mb-2 block text-xs text-slate-400 last:mb-0">
      <div className="mb-0.5 flex justify-between">
        <span>{label}</span>
        <span className="font-mono text-nx-amber">
          {step < 1 ? value.toFixed(2) : value} <span className="text-slate-600">{unit}</span>
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-nx-amber" />
    </label>
  );
}

export function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button onClick={() => set(!on)} className="flex w-full items-center justify-between py-1 text-left text-xs text-slate-300" role="switch" aria-checked={on}>
      <span>{label}</span>
      <span className={`relative h-4 w-7 rounded-full transition ${on ? 'bg-nx-cyan' : 'bg-line'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
      </span>
    </button>
  );
}
