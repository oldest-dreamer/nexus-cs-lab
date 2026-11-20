import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Loader2 } from 'lucide-react';
import type { LabId } from '../data/types';

/** Props every lab may receive. `mode` selects a starting tab (lab-specific). */
export interface LabProps {
  mode?: string;
}

/** Lab registry: lessons reference labs by id; each lab is code-split. */
const REGISTRY: Record<LabId, LazyExoticComponent<ComponentType<LabProps>>> = {
  crackme: lazy(() => import('./crackme/CrackMeLab')),
  'neural-net': lazy(() => import('./neural/NeuralLab')),
  'game-engine': lazy(() => import('./GameEngineLab')),
  'prompt-security': lazy(() => import('./PromptSecurityLab')),
  'web-internals': lazy(() => import('./WebInternalsLab')),
  'app-architecture': lazy(() => import('./AppArchitectureLab')),
};

export function LabHost({ id, mode }: { id: LabId; mode?: string }) {
  const Lab = REGISTRY[id];
  return (
    <Suspense
      fallback={
        <div className="nx-card flex items-center justify-center gap-2 p-10 text-mute">
          <Loader2 className="h-4 w-4 animate-spin" /> Booting lab…
        </div>
      }
    >
      <Lab mode={mode} />
    </Suspense>
  );
}
