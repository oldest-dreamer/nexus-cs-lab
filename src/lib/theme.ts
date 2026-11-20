import type { Accent } from '../data/types';

/**
 * Static class maps so Tailwind can see every class at build time
 * (never build class names with string concatenation).
 */
export const accent: Record<
  Accent,
  { text: string; bg: string; bgSoft: string; border: string; ring: string; glow: string; hex: string }
> = {
  cyan: {
    text: 'text-nx-cyan',
    bg: 'bg-nx-cyan',
    bgSoft: 'bg-nx-cyan/10',
    border: 'border-nx-cyan/30',
    ring: 'ring-nx-cyan/40',
    glow: 'shadow-[0_0_24px_-6px_rgba(6,182,212,0.55)]',
    hex: '#06B6D4',
  },
  amber: {
    text: 'text-nx-amber',
    bg: 'bg-nx-amber',
    bgSoft: 'bg-nx-amber/10',
    border: 'border-nx-amber/30',
    ring: 'ring-nx-amber/40',
    glow: 'shadow-[0_0_24px_-6px_rgba(245,158,11,0.55)]',
    hex: '#F59E0B',
  },
  crimson: {
    text: 'text-nx-crimson',
    bg: 'bg-nx-crimson',
    bgSoft: 'bg-nx-crimson/10',
    border: 'border-nx-crimson/30',
    ring: 'ring-nx-crimson/40',
    glow: 'shadow-[0_0_24px_-6px_rgba(244,63,94,0.55)]',
    hex: '#F43F5E',
  },
};
