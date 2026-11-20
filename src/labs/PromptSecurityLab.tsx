import { useState } from 'react';
import { Scan, Swords } from 'lucide-react';
import type { LabProps } from './index';
import { Arena } from './promptsec/Arena';
import { AttentionXRay } from './promptsec/AttentionXRay';

type Tab = 'arena' | 'attention';

/**
 * AI/LLM Security Lab:
 *   - Red-Team vs Blue-Team prompt-injection arena (4 CTF levels + guardrail panel)
 *   - Attention X-Ray: N×N attention heatmap + temperature / top-p sampling
 * Everything runs locally on a deterministic, simulated model; no API calls.
 */
export default function PromptSecurityLab({ mode }: LabProps) {
  const [tab, setTab] = useState<Tab>(mode === 'attention' ? 'attention' : 'arena');
  return (
    <div className="nx-card overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line bg-gradient-to-r from-nx-crimson/10 via-nx-cyan/5 to-transparent p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-nx-crimson">AI/LLM Security Lab</div>
          <div className="text-lg font-bold text-white">Red-Team Prompt Injection & Attention X-Ray</div>
        </div>
        <div className="flex rounded-lg bg-obsidian p-1" role="tablist">
          {([
            ['arena', 'Red vs Blue Arena', Swords],
            ['attention', 'Attention X-Ray', Scan],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${tab === id ? 'bg-panel-2 text-nx-crimson' : 'text-mute hover:text-ink'}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4">
        <p className="mb-4 rounded-md border border-line bg-panel-2/40 px-3 py-2 text-[12px] text-slate-400">
          Simulated assistant running entirely in your browser: no real LLM, no API calls. Practise these techniques only on systems you own or are authorised to test.
        </p>
        {tab === 'arena' ? <Arena /> : <AttentionXRay />}
      </div>
    </div>
  );
}
