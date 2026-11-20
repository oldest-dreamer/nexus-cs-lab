import { useState } from 'react';
import { CheckCircle2, FileCode2, Lock, Scale, Terminal as TermIcon, Wrench } from 'lucide-react';
import { useProgress } from '../../context/ProgressContext';
import { BINARY_NAME } from './binary';
import { LevelStrings } from './LevelStrings';
import { LevelKeygen } from './LevelKeygen';
import { LevelPatch } from './LevelPatch';
import type { ShellResult } from './shell';

type Level = 1 | 2 | 3;

const LEVELS: { n: Level; id: string; title: string; icon: typeof TermIcon }[] = [
  { n: 1, id: 'crackme-l1', title: 'Strings Analysis', icon: TermIcon },
  { n: 2, id: 'crackme-l2', title: 'Logic Reversal', icon: FileCode2 },
  { n: 3, id: 'crackme-l3', title: 'Binary Patching', icon: Wrench },
];

export default function CrackMeLab() {
  const { hasFlag } = useProgress();
  const [level, setLevel] = useState<Level>(() => (hasFlag('crackme-l2') ? 3 : hasFlag('crackme-l1') ? 2 : 1));
  const [peek, setPeek] = useState(false);
  const [revealed, setRevealed] = useState<Partial<Record<Level, string>>>({});

  const unlocked = (n: Level) => peek || n === 1 || hasFlag(LEVELS[n - 2].id);

  const onShell = (r: ShellResult) => {
    if (r.revealed?.level === 'l1') setRevealed((v) => ({ ...v, 1: r.revealed!.flag }));
    if (r.revealed?.level === 'l2') setRevealed((v) => ({ ...v, 2: r.revealed!.flag }));
  };

  return (
    <div className="nx-card overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-line bg-gradient-to-r from-nx-crimson/10 via-transparent to-transparent p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-nx-crimson">CrackMe Sandbox · Target</div>
          <div className="font-mono text-lg font-bold text-white">{BINARY_NAME}</div>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-line bg-obsidian/60 px-3 py-2 text-xs text-slate-400 sm:max-w-sm">
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-nx-amber" />
          <span>
            Simulated, self-authored training binary built to be cracked. Apply these techniques only to software you own or are authorised to analyse (CTFs, CrackMes).
          </span>
        </div>
      </div>

      {/* Level tabs */}
      <div className="flex overflow-x-auto border-b border-line bg-panel-2/40">
        {LEVELS.map(({ n, id, title, icon: Icon }) => {
          const ok = unlocked(n);
          const done = hasFlag(id);
          const active = level === n;
          return (
            <button
              key={n}
              disabled={!ok}
              onClick={() => setLevel(n)}
              className={`relative flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed ${
                active ? 'text-nx-crimson' : ok ? 'text-slate-300 hover:text-white' : 'text-slate-600'
              }`}
            >
              {done ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : ok ? <Icon className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              <span className="font-mono text-xs">L{n}</span> {title}
              {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded bg-nx-crimson" />}
            </button>
          );
        })}
        <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-2 px-4 text-xs text-mute">
          <input type="checkbox" checked={peek} onChange={(e) => setPeek(e.target.checked)} className="accent-nx-crimson" />
          Unlock all levels
        </label>
      </div>

      <div className="p-4">
        {/* Keep Level 1 mounted so terminal history survives tab switches */}
        <div hidden={level !== 1}>
          <LevelStrings revealed={revealed[1]} onResult={onShell} />
        </div>
        {level === 2 && <LevelKeygen revealed={revealed[2]} onReveal={(f) => setRevealed((v) => ({ ...v, 2: f }))} />}
        {level === 3 && <LevelPatch revealed={revealed[3]} onReveal={(f) => setRevealed((v) => ({ ...v, 3: f }))} />}
      </div>
    </div>
  );
}
