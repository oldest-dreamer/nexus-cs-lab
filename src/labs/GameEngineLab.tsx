import { useState } from 'react';
import { Gamepad2, Route } from 'lucide-react';
import type { LabProps } from './index';
import { PhysicsPlayground } from './game/PhysicsPlayground';
import { PathfindingVisualizer } from './game/PathfindingVisualizer';

type Mode = 'physics' | 'astar';

/**
 * Game Development Lab: 2D Canvas Engine Sandbox.
 *   Mode A: fixed-timestep platformer physics with live tuning + debug overlays
 *   Mode B: step-by-step A* pathfinding visualizer
 * `mode` prop ('physics' | 'astar') lets lessons deep-link to a tab.
 */
export default function GameEngineLab({ mode }: LabProps) {
  const [tab, setTab] = useState<Mode>(mode === 'astar' ? 'astar' : 'physics');

  return (
    <div className="nx-card overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line bg-gradient-to-r from-nx-amber/10 via-transparent to-transparent p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-nx-amber">Game Dev Lab · Canvas 2D</div>
          <div className="text-lg font-bold text-white">2D Engine Sandbox</div>
        </div>
        <div className="flex rounded-lg bg-obsidian p-1" role="tablist">
          {([
            ['physics', 'Physics & Hitboxes', Gamepad2],
            ['astar', 'A* Pathfinding', Route],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${tab === id ? 'bg-panel-2 text-nx-amber' : 'text-mute hover:text-ink'}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4">{tab === 'physics' ? <PhysicsPlayground /> : <PathfindingVisualizer />}</div>
    </div>
  );
}
