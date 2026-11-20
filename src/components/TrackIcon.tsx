import { Brain, Gamepad2, Globe, Shield, Smartphone, type LucideProps } from 'lucide-react';
import type { TrackIcon as TrackIconName } from '../data/types';

const MAP = { globe: Globe, smartphone: Smartphone, gamepad: Gamepad2, brain: Brain, shield: Shield } as const;

export function TrackIcon({ name, ...props }: { name: TrackIconName } & LucideProps) {
  const Icon = MAP[name];
  return <Icon {...props} />;
}
