import { useState } from 'react';
import { Bug, Code2, Factory, Lightbulb } from 'lucide-react';
import type { Lesson } from '../data/types';
import { CodeBlock } from './CodeBlock';

type Tab = 'basic' | 'production' | 'bug';

const TABS: { id: Tab; label: string; icon: typeof Code2 }[] = [
  { id: 'basic', label: 'Basic Concept', icon: Code2 },
  { id: 'production', label: 'Production Pattern', icon: Factory },
  { id: 'bug', label: 'Common Bug & Fix', icon: Bug },
];

export function CodeExplorer({ code }: { code: Lesson['code'] }) {
  const [tab, setTab] = useState<Tab>('basic');

  return (
    <section className="nx-card overflow-hidden">
      <div role="tablist" aria-label="Code explorer" className="flex overflow-x-auto border-b border-line bg-panel-2/50">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={`relative flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-medium transition ${
                active ? 'text-nx-cyan' : 'text-mute hover:text-ink'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded bg-nx-cyan" />}
            </button>
          );
        })}
      </div>

      <div className="space-y-3 p-4" role="tabpanel">
        {tab !== 'bug' && (
          <>
            <Explanation text={code[tab].explanation} />
            <CodeBlock sample={code[tab]} />
          </>
        )}
        {tab === 'bug' && (
          <>
            <Explanation text={code.bug.explanation} />
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="space-y-1.5">
                <div className="nx-chip border-nx-crimson/40 bg-nx-crimson/10 text-nx-crimson">✗ Buggy</div>
                <CodeBlock sample={code.bug.buggy} tone="bad" />
              </div>
              <div className="space-y-1.5">
                <div className="nx-chip border-emerald-500/40 bg-emerald-500/10 text-emerald-400">✓ Fixed</div>
                <CodeBlock sample={code.bug.fixed} tone="good" />
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Explanation({ text }: { text: string }) {
  return (
    <p className="flex gap-2 rounded-lg border border-nx-amber/20 bg-nx-amber/5 px-3 py-2 text-sm text-slate-300">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-nx-amber" />
      <span>{text}</span>
    </p>
  );
}
