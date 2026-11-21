/**
 * A tiny x86 subset "emulator" for Level 3. It tracks only what matters for
 * the lesson: EAX, the Zero Flag, the instruction pointer, and program output.
 */

export type PatchChoice = 'jne' | 'je' | 'nop' | 'jmp';

export interface Insn {
  addr: number;
  bytes: number[];
  text: string;
  op: 'push' | 'mov_ebp' | 'call_expired' | 'cmp0' | 'jne' | 'je' | 'jmp' | 'nop' | 'call_unlock' | 'xor_eax' | 'pop' | 'ret' | 'push_str' | 'call_puts' | 'mov_eax1';
  target?: number;
  label?: string;
  patchable?: boolean;
  comment?: string;
}

const LOCKED = 0x401019;

/** Original listing. The JNE at 0x40100B is the patch site. */
const BASE: Insn[] = [
  { addr: 0x401000, bytes: [0x55], text: 'push   ebp', op: 'push', label: 'main' },
  { addr: 0x401001, bytes: [0x89, 0xe5], text: 'mov    ebp, esp', op: 'mov_ebp' },
  { addr: 0x401003, bytes: [0xe8, 0xf8, 0x0f, 0x00, 0x00], text: 'call   is_trial_expired', op: 'call_expired', comment: 'EAX ← 1 if expired, else 0' },
  { addr: 0x401008, bytes: [0x83, 0xf8, 0x00], text: 'cmp    eax, 0', op: 'cmp0', comment: 'ZF ← (EAX − 0 == 0)' },
  { addr: 0x40100b, bytes: [0x75, 0x0c], text: 'jne    0x401019 <locked>', op: 'jne', target: LOCKED, patchable: true, comment: 'jump if ZF == 0' },
  { addr: 0x40100d, bytes: [0xe8, 0x2e, 0x10, 0x00, 0x00], text: 'call   unlock_vault', op: 'call_unlock' },
  { addr: 0x401012, bytes: [0x31, 0xc0], text: 'xor    eax, eax', op: 'xor_eax', comment: 'return 0' },
  { addr: 0x401014, bytes: [0x5d], text: 'pop    ebp', op: 'pop' },
  { addr: 0x401015, bytes: [0xc3], text: 'ret', op: 'ret' },
  { addr: 0x401016, bytes: [0x90], text: 'nop', op: 'nop', comment: 'alignment padding' },
  { addr: 0x401017, bytes: [0x90], text: 'nop', op: 'nop' },
  { addr: 0x401018, bytes: [0x90], text: 'nop', op: 'nop' },
  { addr: LOCKED, bytes: [0x68, 0x00, 0x20, 0x40, 0x00], text: 'push   str_trial_expired', op: 'push_str', label: 'locked' },
  { addr: 0x40101e, bytes: [0xe8, 0xdd, 0x0f, 0x00, 0x00], text: 'call   puts', op: 'call_puts' },
  { addr: 0x401023, bytes: [0xb8, 0x01, 0x00, 0x00, 0x00], text: 'mov    eax, 1', op: 'mov_eax1', comment: 'return 1' },
  { addr: 0x401028, bytes: [0x5d], text: 'pop    ebp', op: 'pop' },
  { addr: 0x401029, bytes: [0xc3], text: 'ret', op: 'ret' },
];

export const PATCHES: Record<PatchChoice, { label: string; bytes: string; desc: string }> = {
  jne: { label: 'JNE (original)', bytes: '75 0C', desc: 'Jump to locked when ZF = 0 (trial expired).' },
  je: { label: 'JE', bytes: '74 0C', desc: 'Invert the condition: jump to locked when ZF = 1.' },
  nop: { label: 'NOP NOP', bytes: '90 90', desc: 'Erase the branch: execution always falls through.' },
  jmp: { label: 'JMP', bytes: 'EB 0C', desc: 'Unconditional jump to locked.' },
};

export function buildListing(patch: PatchChoice): Insn[] {
  return BASE.flatMap((ins): Insn[] => {
    if (!ins.patchable) return [ins];
    switch (patch) {
      case 'jne':
        return [ins];
      case 'je':
        return [{ ...ins, bytes: [0x74, 0x0c], text: 'je     0x401019 <locked>', op: 'je', comment: 'PATCHED: jump if ZF == 1' }];
      case 'jmp':
        return [{ ...ins, bytes: [0xeb, 0x0c], text: 'jmp    0x401019 <locked>', op: 'jmp', comment: 'PATCHED: always jump' }];
      case 'nop':
        return [
          { ...ins, bytes: [0x90], text: 'nop', op: 'nop', target: undefined, comment: 'PATCHED (was 75)' },
          { ...ins, addr: ins.addr + 1, bytes: [0x90], text: 'nop', op: 'nop', target: undefined, label: undefined, comment: 'PATCHED (was 0C)' },
        ];
    }
  });
}

export interface TraceStep {
  addr: number;
  text: string;
  eax: number;
  zf: 0 | 1;
  note?: string;
}

export interface RunResult {
  trace: TraceStep[];
  output: string[];
  unlocked: boolean;
}

export function run(listing: Insn[], trialExpired: boolean): RunResult {
  const byAddr = new Map(listing.map((ins, i) => [ins.addr, i]));
  let ip = 0;
  let eax = 0xdeadbeef;
  let zf: 0 | 1 = 0;
  const trace: TraceStep[] = [];
  const output: string[] = [];
  let unlocked = false;

  for (let guard = 0; guard < 64 && ip < listing.length; guard++) {
    const ins = listing[ip];
    let next = ip + 1;
    let note: string | undefined;

    switch (ins.op) {
      case 'call_expired':
        eax = trialExpired ? 1 : 0;
        note = `is_trial_expired() → ${eax}`;
        break;
      case 'cmp0':
        zf = eax === 0 ? 1 : 0;
        note = `EAX − 0 = ${eax} → ZF = ${zf}`;
        break;
      case 'jne':
        if (zf === 0) { next = byAddr.get(ins.target!)!; note = 'ZF = 0 → jump TAKEN'; }
        else note = 'ZF = 1 → not taken';
        break;
      case 'je':
        if (zf === 1) { next = byAddr.get(ins.target!)!; note = 'ZF = 1 → jump TAKEN'; }
        else note = 'ZF = 0 → not taken';
        break;
      case 'jmp':
        next = byAddr.get(ins.target!)!;
        note = 'unconditional → jump TAKEN';
        break;
      case 'call_unlock':
        unlocked = true;
        output.push('[+] Vault unlocked. Welcome back, full-version user.');
        break;
      case 'xor_eax':
        eax = 0;
        zf = 1;
        break;
      case 'call_puts':
        output.push('TRIAL EXPIRED - purchase the full version');
        break;
      case 'mov_eax1':
        eax = 1;
        break;
      case 'ret':
        trace.push({ addr: ins.addr, text: ins.text, eax, zf, note: `process exit code ${eax}` });
        return { trace, output, unlocked };
      default:
        break;
    }
    trace.push({ addr: ins.addr, text: ins.text, eax, zf, note });
    ip = next;
  }
  return { trace, output, unlocked };
}

export const hex = (n: number, w = 2) => n.toString(16).toUpperCase().padStart(w, '0');
