import { useState } from 'react';
import { BrainCircuit, ScanText } from 'lucide-react';
import { NetTrainer } from './NetTrainer';
import { TokenXRay } from './TokenXRay';

type Tab = 'net' | 'tokens';

export default function NeuralLab() {
  const [tab, setTab] = useState<Tab>('net');
  return (
    <div className="nx-card overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line bg-gradient-to-r from-nx-cyan/10 via-transparent to-transparent p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-nx-cyan">AI/ML Mini-Lab</div>
          <div className="text-lg font-bold text-white">Live Neural Network & Token X-Ray</div>
        </div>
        <div className="flex rounded-lg bg-obsidian p-1">
          {([
            ['net', 'Network Trainer', BrainCircuit],
            ['tokens', 'Token X-Ray', ScanText],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${tab === id ? 'bg-panel-2 text-nx-cyan' : 'text-mute hover:text-ink'}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4">{tab === 'net' ? <NetTrainer /> : <TokenXRay />}</div>
    </div>
  );
}
