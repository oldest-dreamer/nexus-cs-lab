import { useState } from 'react';
import { Atom, Repeat } from 'lucide-react';
import type { LabProps } from './index';
import { EventLoopSimulator } from './web/EventLoopSimulator';
import { RenderXRay } from './web/RenderXRay';

type Mode = 'eventloop' | 'react';

/**
 * Web Development Lab: JS Event Loop & React Render Visualizer.
 *   Mode A: step-through event loop simulator (call stack, Web APIs, queues)
 *   Mode B: live React re-render X-Ray with React.memo / useCallback toggles
 * `mode` ('eventloop' | 'react') lets lessons deep-link to a tab.
 */
export default function WebInternalsLab({ mode }: LabProps) {
  const [tab, setTab] = useState<Mode>(mode === 'react' ? 'react' : 'eventloop');
  return (
    <div className="nx-card overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line bg-gradient-to-r from-nx-cyan/10 via-transparent to-transparent p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-nx-cyan">Web Dev Lab · Browser internals</div>
          <div className="text-lg font-bold text-white">JS Event Loop & React Render Visualizer</div>
        </div>
        <div className="flex rounded-lg bg-obsidian p-1" role="tablist">
          {([
            ['eventloop', 'Event Loop', Repeat],
            ['react', 'React Re-Render X-Ray', Atom],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${tab === id ? 'bg-panel-2 text-nx-cyan' : 'text-mute hover:text-ink'}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4">{tab === 'eventloop' ? <EventLoopSimulator /> : <RenderXRay />}</div>
    </div>
  );
}
