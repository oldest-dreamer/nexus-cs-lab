import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Flag, Loader2 } from 'lucide-react';
import { useProgress } from '../../context/ProgressContext';
import { challengeById } from '../../data/challenges';

export function FlagSubmit({ challengeId, revealed }: { challengeId: string; revealed?: string }) {
  const { submitFlag, hasFlag } = useProgress();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const captured = hasFlag(challengeId);
  const ch = challengeById(challengeId)!;

  useEffect(() => {
    if (revealed) setValue(revealed);
  }, [revealed]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    const r = await submitFlag(challengeId, value);
    setBusy(false);
    setMsg(
      r === 'captured'
        ? { ok: true, text: `Correct! +${ch.points} XP` }
        : r === 'already_captured'
          ? { ok: true, text: 'Already captured.' }
          : { ok: false, text: 'Wrong flag. Flags look like NEXUS{...}' },
    );
  };

  if (captured) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-400">
        <CheckCircle2 className="h-4 w-4" /> Flag captured: {ch.title} (+{ch.points} XP)
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-nx-amber/30 bg-nx-amber/5 p-3 sm:flex-row sm:items-center">
      <Flag className="hidden h-4 w-4 shrink-0 text-nx-amber sm:block" />
      <input className="nx-input flex-1" placeholder="NEXUS{...}" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Flag" spellCheck={false} />
      <button className="nx-btn bg-nx-amber text-obsidian hover:bg-amber-300" disabled={busy || !value.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />} Submit flag · {ch.points} XP
      </button>
      {msg && <span className={`text-sm font-semibold ${msg.ok ? 'text-emerald-400' : 'text-nx-crimson'}`}>{msg.text}</span>}
    </form>
  );
}
