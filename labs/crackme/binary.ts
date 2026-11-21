/**
 * vault_trial_v1.exe — a SIMULATED, self-authored CrackMe target.
 * Nothing here is real software. We build a synthetic PE-like byte buffer so
 * the in-browser `strings` and `xxd` commands operate on genuine bytes.
 */

export const BINARY_NAME = 'vault_trial_v1.exe';

/** Level 1 answer: hardcoded "debug master key" left in the binary. */
export const MASTER_LICENSE = 'VLT-9X3K-TR14L-0VERR1DE';
export const DECOY_LICENSE = 'DEMO-0000-0000-0000';

// ---------------------------------------------------------------------------
// Flags are stored XOR-obfuscated so they don't show up in `strings` (or in a
// naive grep of the JS bundle). This is itself a classic RE pattern: decode at
// runtime, right before use.
// ---------------------------------------------------------------------------
const FLAG_KEY = [0x4e, 0x58, 0x53];
const ENCODED: Record<'l1' | 'l2' | 'l3', number[]> = {
  l1: [0, 26, 5, 14, 23, 11, 23, 29, 25, 64, 112, 121, 105, 92, 5, 85, 27, 123, 92, 237, 170, 185, 191],
  l2: [0, 26, 5, 14, 23, 11, 28, 89, 25, 46, 117, 45, 99, 100, 2, 73, 119, 86, 3, 171, 236, 175, 177, 193, 130, 138],
  l3: [0, 26, 5, 14, 23, 11, 14, 7, 14, 46, 110, 42, 110, 96, 89, 120, 74, 93, 64, 233, 172, 174, 241, 150, 155],
};

export function decodeFlag(level: 'l1' | 'l2' | 'l3'): string {
  return String.fromCharCode(...ENCODED[level].map((b, i) => b ^ FLAG_KEY[i % 3] ^ ((i * 7) & 0xff)));
}

// ---------------------------------------------------------------------------
// Level 2 keygen (mirrors the decompiled pseudocode shown to the learner)
// ---------------------------------------------------------------------------
export const XOR_KEY = 0x2a;
export const USERNAMES = ['NOVA', 'BYTE', 'ROOT', 'ZERO', 'HACK', 'NEXA', 'GRID', 'FLUX'];

export function keygen(username: string): string {
  let out = '';
  let sum = 0;
  for (const ch of username) {
    const c = ch.charCodeAt(0);
    out += String.fromCharCode(65 + ((c ^ XOR_KEY) % 26));
    sum += c;
  }
  return `${out}-${String(sum % 97).padStart(2, '0')}`;
}

export const PSEUDOCODE = `// Ghidra decompilation of FUN_00401240  (renamed → check_serial)
// Called from main() as: check_serial(argv[2] /* --user */, argv[4] /* --serial */)

bool check_serial(char *username, char *serial)
{
  char expected[16];
  int  sum = 0;
  int  i;

  for (i = 0; username[i] != '\\0'; i++) {
    expected[i] = 'A' + ((username[i] ^ 0x2A) % 26);
    sum += username[i];
  }
  expected[i] = '-';
  sprintf(&expected[i + 1], "%02d", sum % 97);

  return strcmp(expected, serial) == 0;
}`;

// ---------------------------------------------------------------------------
// Synthetic binary image
// ---------------------------------------------------------------------------
const RDATA_STRINGS = [
  'KERNEL32.dll',
  'GetProcAddress',
  'LoadLibraryA',
  'GetSystemTimeAsFileTime',
  'ExitProcess',
  'msvcrt.dll',
  'printf',
  'puts',
  'strcmp',
  'sprintf',
  '__getmainargs',
  'SecureVault Trial Edition v1.0',
  `Usage: ${BINARY_NAME} --license <KEY>`,
  `       ${BINARY_NAME} --user <NAME> --serial <SERIAL>`,
  'Checking license...',
  'Invalid license key.',
  'Demo keys are disabled in release builds.',
  'License accepted. Vault level 1 unlocked.',
  'Serial accepted. Vault level 2 unlocked.',
  'TRIAL EXPIRED - purchase the full version',
  `trial_demo_key=${DECOY_LICENSE}`,
  '[dbg] built with -DDEBUG_MASTER (remove before release!)',
  `[dbg] master_license=${MASTER_LICENSE}`,
  '%s-%02d',
  'check_serial',
  'is_trial_expired',
  'unlock_vault',
  'GCC: (MinGW-W64 x86_64-posix-seh) 13.2.0',
];

/** Deterministic non-printable filler so random bytes never form fake strings. */
function filler(len: number, seed: number): number[] {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const r = s % 40;
    out.push(r < 14 ? 0x00 : r < 32 ? (s >> 8) % 0x20 : 0x80 + ((s >> 4) % 0x7f));
  }
  return out;
}

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

function buildImage(): Uint8Array {
  const b: number[] = [];
  // DOS header
  b.push(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00);
  b.push(0xb8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
  b.push(...new Array(28).fill(0), 0x80, 0x00, 0x00, 0x00);
  // DOS stub
  b.push(0x0e, 0x1f, 0xba, 0x0e, 0x00, 0xb4, 0x09, 0xcd, 0x21, 0xb8, 0x01, 0x4c, 0xcd, 0x21);
  b.push(...ascii('This program cannot be run in DOS mode.'), 0x0d, 0x0d, 0x0a, 0x24);
  while (b.length < 0x80) b.push(0);
  // PE header: "PE\0\0", i386, 3 sections
  b.push(0x50, 0x45, 0x00, 0x00, 0x4c, 0x01, 0x03, 0x00);
  b.push(...filler(40, 7));
  for (const name of ['.text', '.rdata', '.data']) {
    const n = ascii(name);
    b.push(...n, ...new Array(8 - n.length).fill(0), ...filler(32, name.length * 13));
  }
  // .text — a few real-looking opcodes (from Level 3's listing)
  b.push(0x55, 0x89, 0xe5, 0xe8, 0xf8, 0x0f, 0x00, 0x00, 0x83, 0xf8, 0x00, 0x75, 0x0c, 0xe8, 0x2e, 0x10, 0x00, 0x00, 0x31, 0xc0, 0x5d, 0xc3);
  b.push(...filler(96, 99));
  // .rdata strings, each separated by NUL + non-printable noise
  RDATA_STRINGS.forEach((s, i) => {
    b.push(...ascii(s), 0x00, ...filler(3 + (i % 5), i + 1));
  });
  b.push(...filler(64, 4242));
  return new Uint8Array(b);
}

export const IMAGE = buildImage();

/** Real `strings` algorithm: runs of printable ASCII (0x20–0x7e) of length ≥ min. */
export function extractStrings(data: Uint8Array, min = 4): { offset: number; text: string }[] {
  const out: { offset: number; text: string }[] = [];
  let start = -1;
  for (let i = 0; i <= data.length; i++) {
    const c = data[i];
    const printable = i < data.length && c >= 0x20 && c <= 0x7e;
    if (printable && start < 0) start = i;
    if (!printable && start >= 0) {
      if (i - start >= min) out.push({ offset: start, text: String.fromCharCode(...data.subarray(start, i)) });
      start = -1;
    }
  }
  return out;
}

/** `xxd`-style hex dump lines. */
export function hexdump(data: Uint8Array, lines = 16): string[] {
  const out: string[] = [];
  for (let off = 0; off < Math.min(data.length, lines * 16); off += 16) {
    const chunk = data.subarray(off, off + 16);
    const hex: string[] = [];
    for (let i = 0; i < 16; i += 2) {
      const a = chunk[i], c = chunk[i + 1];
      hex.push(a === undefined ? '    ' : a.toString(16).padStart(2, '0') + (c === undefined ? '  ' : c.toString(16).padStart(2, '0')));
    }
    const asc = Array.from(chunk, (x) => (x >= 0x20 && x <= 0x7e ? String.fromCharCode(x) : '.')).join('');
    out.push(`${off.toString(16).padStart(8, '0')}: ${hex.join(' ')}  ${asc}`);
  }
  return out;
}
