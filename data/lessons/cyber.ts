import type { Track } from '../types';
import { foundationsModule } from './cyber/m1-foundations';
import { webModule } from './cyber/m2-web';
import { cryptoModule } from './cyber/m3-crypto';
import { x64Module } from './cyber/m4-x64';
import { binariesModule } from './cyber/m5-binaries';
import { reversingModule } from './cyber/m6-reversing';
import { memoryModule } from './cyber/m7-memory';
import { antiAnalysisModule } from './cyber/m8-antianalysis';

/**
 * Cybersecurity & Reverse Engineering — a complete zero-to-advanced curriculum.
 * Each module lives in its own file under ./cyber/ so chapters are easy to extend.
 * Every chapter is fully authored (no locked/"coming soon" placeholders).
 *
 * 1. Security Foundations & Threat Modeling
 * 2. Web Exploitation & Defense (OWASP core)
 * 3. Applied Cryptography for Engineers
 * 4. Computer Architecture & Reading x86-64 Assembly
 * 5. Binary Formats & Static Triage (PE & ELF)
 * 6. Static & Dynamic Reverse Engineering (Ghidra + GDB/x64dbg)
 * 7. Memory Safety & Modern Mitigations
 * 8. Anti-Analysis, Packing & Safe Lab Setup
 */
export const cyberTrack: Track = {
  id: 'cyber',
  title: 'Cybersecurity & Reverse Engineering',
  short: 'Security',
  tagline: 'Threat modeling, web & crypto defense, x86-64, binary triage, legal CrackMe reversing, memory safety and anti-analysis.',
  accent: 'crimson',
  icon: 'shield',
  modules: [
    foundationsModule,
    webModule,
    cryptoModule,
    x64Module,
    binariesModule,
    reversingModule,
    memoryModule,
    antiAnalysisModule,
  ],
};
