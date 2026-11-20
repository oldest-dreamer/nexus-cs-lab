import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { COMPLETIONS, execute, type ShellResult, type TermLine } from './shell';

const KIND_CLS: Record<TermLine['kind'], string> = {
  out: 'text-slate-300',
  err: 'text-nx-crimson',
  ok: 'text-emerald-400',
  flag: 'text-nx-amber font-bold',
  dim: 'text-slate-500',
  cmd: 'text-nx-cyan',
};

const PROMPT = 'analyst@sandbox:~/crackme$';

export function Terminal({ onResult, suggestions }: { onResult?: (r: ShellResult) => void; suggestions?: string[] }) {
  const [lines, setLines] = useState<TermLine[]>([
    { kind: 'dim', text: 'NEXUS isolated analysis sandbox — simulated shell. Nothing here executes on your machine.' },
    { kind: 'dim', text: "Type 'help' to list commands. Start with: cat README.txt" },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const run = (raw: string) => {
    const cmd = raw.trim();
    const echo: TermLine = { kind: 'cmd', text: `${PROMPT} ${cmd}` };
    if (!cmd) return setLines((l) => [...l, echo]);
    const nextHistory = [...history, cmd];
    const result = execute(cmd, nextHistory);
    setHistory(nextHistory);
    setHIdx(null);
    setLines((l) => (result.clear ? [] : [...l, echo, ...result.lines]).slice(-400));
    onResult?.(result);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      run(input);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!history.length) return;
      const i = hIdx === null ? history.length - 1 : Math.max(0, hIdx - 1);
      setHIdx(i);
      setInput(history[i]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (hIdx === null) return;
      const i = hIdx + 1;
      if (i >= history.length) {
        setHIdx(null);
        setInput('');
      } else {
        setHIdx(i);
        setInput(history[i]);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const match = COMPLETIONS.find((c) => c.startsWith(input) && c !== input);
      if (match) setInput(match);
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-[#04060a]" onClick={() => inputRef.current?.focus()}>
      <div className="flex items-center justify-between border-b border-line bg-panel-2/60 px-3 py-1.5 font-mono text-xs text-mute">
        <span>bash: ~/crackme</span>
        <span className="text-slate-600">↑↓ history · Tab complete · Ctrl+L clear</span>
      </div>
      <div ref={scrollRef} className="h-80 overflow-y-auto p-3 font-mono text-[12.5px] leading-5">
        {lines.map((l, i) => (
          <div key={i} className={`whitespace-pre-wrap break-all ${KIND_CLS[l.kind]}`}>{l.text || ' '}</div>
        ))}
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-emerald-400">{PROMPT}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            aria-label="Terminal input"
            className="min-w-0 flex-1 bg-transparent text-slate-100 caret-nx-cyan outline-none"
          />
        </div>
      </div>
      {suggestions && (
        <div className="flex flex-wrap gap-1.5 border-t border-line bg-panel-2/40 px-3 py-2">
          {suggestions.map((s) => (
            <button key={s} onClick={(e) => { e.stopPropagation(); run(s); }} className="rounded border border-line bg-obsidian px-2 py-0.5 font-mono text-[11px] text-slate-400 hover:border-nx-cyan/50 hover:text-nx-cyan">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
