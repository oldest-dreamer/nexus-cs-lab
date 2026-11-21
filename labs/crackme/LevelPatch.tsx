import { useMemo, useState } from 'react';
import { CalendarClock, Play, RotateCcw, Wrench } from 'lucide-react';
import { PATCHES, buildListing, hex, run, type PatchChoice, type RunResult } from './emulator';
import { decodeFlag } from './binary';
import { FlagSubmit } from '../shared/FlagSubmit';
import { Hints } from '../shared/Hints';
import { Objective } from './LevelStrings';

export function LevelPatch({ revealed, onReveal }: { revealed?: string; onReveal: (flag: string) => void }) {
  const [patch, setPatch] = useState<PatchChoice>('jne');
  const [menuOpen, setMenuOpen] = useState(false);
  const [expired, setExpired] = useState(true);
  const [result, setResult] = useState<RunResult | null>(null);
  const listing = useMemo(() => buildListing(patch), [patch]);
  const executed = new Set(result?.trace.map((t) => t.addr));

  const execute = () => {
    const r = run(listing, expired);
    setResult(r);
    if (r.unlocked && expired && patch !== 'jne') onReveal(decodeFlag('l3'));
  };

  const choose = (p: PatchChoice) => {
    setPatch(p);
    setMenuOpen(false);
    setResult(null);
  };

  return (
    <div className="space-y-4">
      <Objective
        title="Level 3: Binary Patching"
        items={[
          'The trial has expired (day 47 of 30). Read main() and find the instruction that decides "locked" vs "unlocked".',
          'Click the patchable instruction (amber) to change its opcode bytes.',
          'Run the patched binary. Reach unlock_vault() while the trial is still expired to capture the flag.',
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        {/* Disassembly */}
        <div className="overflow-hidden rounded-lg border border-line bg-[#05070b]">
          <div className="flex items-center justify-between border-b border-line bg-panel-2/60 px-3 py-1.5 font-mono text-xs text-mute">
            <span>.text :: main (x86, Intel syntax)</span>
            <span className={patch === 'jne' ? 'text-slate-500' : 'text-nx-amber'}>{patch === 'jne' ? 'unmodified' : `patched: ${PATCHES[patch].label}`}</span>
          </div>
          <div className="overflow-x-auto p-2 font-mono text-[12.5px] leading-6">
            {listing.map((ins) => {
              const isSite = ins.patchable;
              const ran = executed.has(ins.addr);
              return (
                <div key={ins.addr}>
                  {ins.label && <div className="pl-2 pt-1 text-nx-cyan">{ins.label}:</div>}
                  <div
                    role={isSite ? 'button' : undefined}
                    tabIndex={isSite ? 0 : undefined}
                    onClick={isSite ? () => setMenuOpen((o) => !o) : undefined}
                    onKeyDown={isSite ? (e) => (e.key === 'Enter' || e.key === ' ') && setMenuOpen((o) => !o) : undefined}
                    className={`flex min-w-max items-center gap-4 rounded px-2 ${
                      isSite ? 'cursor-pointer border border-dashed border-nx-amber/60 bg-nx-amber/10 hover:bg-nx-amber/20' : ''
                    } ${ran ? 'bg-nx-cyan/10' : ''}`}
                  >
                    <span className="w-4 text-nx-cyan">{ran ? '▸' : ''}</span>
                    <span className="text-slate-500">0x{hex(ins.addr, 6)}</span>
                    <span className={`w-28 ${isSite && patch !== 'jne' ? 'text-nx-amber' : 'text-slate-400'}`}>{ins.bytes.map((b) => hex(b)).join(' ')}</span>
                    <span className={isSite ? 'font-bold text-nx-amber' : 'text-slate-200'}>{ins.text}</span>
                    {ins.comment && <span className="text-slate-600">; {ins.comment}</span>}
                    {isSite && <Wrench className="h-3.5 w-3.5 text-nx-amber" />}
                  </div>
                  {isSite && menuOpen && ins.addr === 0x40100b && (
                    <div className="my-2 ml-8 grid max-w-md gap-1.5 rounded-lg border border-nx-amber/40 bg-panel p-2">
                      <div className="px-1 text-[11px] uppercase tracking-widest text-mute">Patch bytes at 0x40100B</div>
                      {(Object.keys(PATCHES) as PatchChoice[]).map((p) => (
                        <button
                          key={p}
                          onClick={(e) => { e.stopPropagation(); choose(p); }}
                          className={`flex items-start gap-3 rounded-md px-2 py-1.5 text-left hover:bg-panel-2 ${patch === p ? 'bg-panel-2 ring-1 ring-nx-amber/50' : ''}`}
                        >
                          <span className="w-14 shrink-0 text-nx-amber">{PATCHES[p].bytes}</span>
                          <span>
                            <span className="font-bold text-ink">{PATCHES[p].label}</span>
                            <span className="block font-sans text-xs text-slate-400">{PATCHES[p].desc}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Controls + trace */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => { setExpired((x) => !x); setResult(null); }} className="nx-btn-ghost py-1.5 text-xs">
              <CalendarClock className="h-4 w-4" /> {expired ? 'Clock: day 47 / 30 (expired)' : 'Clock: day 12 / 30 (valid)'}
            </button>
            <button onClick={() => choose('jne')} className="nx-btn-ghost py-1.5 text-xs" disabled={patch === 'jne'}>
              <RotateCcw className="h-4 w-4" /> Revert
            </button>
            <button onClick={execute} className="nx-btn-primary py-1.5 text-xs">
              <Play className="h-4 w-4" /> Run
            </button>
          </div>

          <div className="rounded-lg border border-line bg-[#04060a] p-3 font-mono text-[12px]">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-mute">Execution trace</div>
            {!result && <div className="text-slate-600">Press Run to single-step main().</div>}
            {result?.trace.map((t, i) => (
              <div key={i} className="grid grid-cols-[72px_1fr] gap-x-2 text-slate-400">
                <span className="text-slate-600">0x{hex(t.addr, 6)}</span>
                <span>
                  <span className="text-slate-200">{t.text}</span>
                  <span className="ml-2 text-slate-600">EAX={t.eax === 0xdeadbeef ? '????' : t.eax} ZF={t.zf}</span>
                  {t.note && <span className="block text-nx-cyan/80">  ↳ {t.note}</span>}
                </span>
              </div>
            ))}
            {result && (
              <div className="mt-2 border-t border-line pt-2">
                {result.output.map((o, i) => (
                  <div key={i} className={result.unlocked ? 'text-emerald-400' : 'text-nx-crimson'}>{o}</div>
                ))}
                {result.unlocked && expired && patch !== 'jne' && <div className="font-bold text-nx-amber">&gt;&gt; FLAG: {decodeFlag('l3')}</div>}
                {result.unlocked && !expired && <div className="text-slate-500">(Valid trial: that is the normal path. Set the clock back to expired.)</div>}
                {!result.unlocked && patch === 'je' && !expired && (
                  <div className="text-nx-amber">Notice: the JE patch locks out VALID users. Inverting a branch flips both outcomes.</div>
                )}
              </div>
            )}
          </div>

          <PatchDiff patch={patch} />
        </div>
      </div>

      <Hints
        hints={[
          'is_trial_expired() returns 1 here, so CMP EAX, 0 leaves ZF = 0, and JNE (jump if ZF == 0) jumps to <locked>.',
          'You need execution to fall through to call unlock_vault at 0x40100D. Either invert the condition or remove the jump.',
          'Try JE, then toggle the clock to "valid" and run again. Then compare with NOP NOP. Which is the cleaner patch?',
        ]}
      />
      <FlagSubmit challengeId="crackme-l3" revealed={revealed} />
    </div>
  );
}

function PatchDiff({ patch }: { patch: PatchChoice }) {
  const bytes = PATCHES[patch].bytes.split(' ');
  return (
    <div className="rounded-lg border border-line bg-panel-2/40 p-3 font-mono text-[12px]">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-mute">Patch diff (file offset 0x40B)</div>
      {patch === 'jne' ? (
        <div className="text-slate-600">no changes</div>
      ) : (
        ['75', '0C'].map((orig, i) => (
          <div key={i} className={orig === bytes[i] ? 'text-slate-600' : ''}>
            0x{hex(0x40100b + i, 6)}: <span className="text-nx-crimson">{orig}</span> → <span className="text-emerald-400">{bytes[i]}</span>
          </div>
        ))
      )}
    </div>
  );
}
