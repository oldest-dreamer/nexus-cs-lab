import { CheckCircle2, Lightbulb } from 'lucide-react';
import type { LabProps } from './index';
import { PhoneFrame } from './appsync/PhoneFrame';
import { Inspector } from './appsync/Inspector';
import { useSyncSim } from './appsync/useSyncSim';

const EXPERIMENTS = [
  'Go Offline, then add, edit, tick and delete tasks. Watch the outbox stack up (and compact).',
  'Switch back Online: the outbox flushes in order. Raise the 503 rate to see exponential backoff.',
  'Click ✎ on a server row (another device edits it), edit the same task on the phone → 409 → resolve it.',
  'Go Offline while a request is in flight: if the server already committed, the retry is an idempotent replay.',
  'Switch to Wait-for-server and repeat: every action blocks on the network, and offline writes are refused.',
];

/**
 * App Development Lab: Mobile Offline-First Sync & API Inspector.
 * A phone-frame tasks app on top of a pure sync reducer (./appsync/engine.ts)
 * with a simulated backend that enforces versions + idempotency keys.
 */
export default function AppArchitectureLab(_props: LabProps) {
  const sim = useSyncSim();
  return (
    <div className="nx-card overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line bg-gradient-to-r from-nx-amber/10 via-transparent to-transparent p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-nx-amber">App Dev Lab · Offline-first</div>
          <div className="text-lg font-bold text-white">Mobile Offline Sync & API Inspector</div>
        </div>
        <div className="font-mono text-[11px] text-slate-500">local-first · outbox · optimistic concurrency</div>
      </div>
      <div className="space-y-4 p-4">
        <details className="rounded-lg border border-line bg-panel-2/40 px-3 py-2 text-sm" open>
          <summary className="flex cursor-pointer items-center gap-2 font-semibold text-slate-200">
            <Lightbulb className="h-4 w-4 text-nx-amber" /> Experiments to try
          </summary>
          <ol className="mt-2 space-y-1 pl-1">
            {EXPERIMENTS.map((e, i) => (
              <li key={i} className="flex gap-2 text-[13px] text-slate-400">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-nx-cyan" /> {e}
              </li>
            ))}
          </ol>
        </details>
        <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <PhoneFrame sim={sim} />
          <Inspector sim={sim} />
        </div>
      </div>
    </div>
  );
}
