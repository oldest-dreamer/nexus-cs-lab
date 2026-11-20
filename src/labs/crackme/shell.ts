import { BINARY_NAME, DECOY_LICENSE, IMAGE, MASTER_LICENSE, decodeFlag, extractStrings, hexdump, keygen } from './binary';

export type LineKind = 'out' | 'err' | 'ok' | 'flag' | 'dim' | 'cmd';
export interface TermLine {
  kind: LineKind;
  text: string;
}
export interface ShellResult {
  lines: TermLine[];
  clear?: boolean;
  revealed?: { level: 'l1' | 'l2'; flag: string };
}

const README = [
  '=== vault_trial_v1.exe :: NEXUS CrackMe #1 ===',
  'This is a deliberately vulnerable, self-authored training binary.',
  'Goal (Level 1): find a valid licence key and run:',
  `    ./${BINARY_NAME} --license <KEY>`,
  '',
  'Rules: static analysis only. You are allowed to crack THIS binary.',
  'Real-world note: only reverse software you own or are authorised to test.',
];

const HELP = [
  'Available commands (simulated):',
  '  ls [-la]                       list files',
  '  cat README.txt                 read the challenge brief',
  `  file ${BINARY_NAME}        identify the file format`,
  `  strings [-n N] [-t x] ${BINARY_NAME}   printable strings (default N=4)`,
  `  xxd ${BINARY_NAME}         hex dump (pipe into head)`,
  `  ./${BINARY_NAME} --license <KEY>`,
  `  ./${BINARY_NAME} --user <NAME> --serial <SERIAL>`,
  '  clear | whoami | history',
  'Pipes:  | grep [-i] [-v] PATTERN   | head [-n N]   | tail [-n N]   | wc -l',
];

const tokenize = (s: string) => (s.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^["']|["']$/g, ''));
const isBin = (t?: string) => t === BINARY_NAME || t === `./${BINARY_NAME}`;

function runBinary(args: string[]): ShellResult {
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const license = get('--license');
  const user = get('--user');
  const serial = get('--serial');
  const banner: TermLine = { kind: 'dim', text: 'SecureVault Trial Edition v1.0' };

  if (license !== undefined) {
    const lines: TermLine[] = [banner, { kind: 'out', text: 'Checking license...' }];
    if (license === MASTER_LICENSE) {
      const flag = decodeFlag('l1');
      lines.push({ kind: 'ok', text: 'License accepted. Vault level 1 unlocked.' }, { kind: 'flag', text: `>> FLAG: ${flag}` });
      return { lines, revealed: { level: 'l1', flag } };
    }
    if (license === DECOY_LICENSE) {
      lines.push({ kind: 'err', text: 'Demo keys are disabled in release builds.' }, { kind: 'dim', text: 'hint: that was a decoy. Keep reading the strings output.' });
      return { lines };
    }
    lines.push({ kind: 'err', text: 'Invalid license key.' });
    return { lines };
  }

  if (user !== undefined && serial !== undefined) {
    const lines: TermLine[] = [banner, { kind: 'out', text: `Validating serial for user "${user}"...` }];
    if (!/^[A-Z]{1,12}$/.test(user)) {
      lines.push({ kind: 'err', text: 'Username must be 1–12 uppercase letters A–Z.' });
      return { lines };
    }
    if (keygen(user) === serial.toUpperCase()) {
      const flag = decodeFlag('l2');
      lines.push({ kind: 'ok', text: 'Serial accepted. Vault level 2 unlocked.' }, { kind: 'flag', text: `>> FLAG: ${flag}` });
      return { lines, revealed: { level: 'l2', flag } };
    }
    lines.push({ kind: 'err', text: 'Invalid serial.' });
    return { lines };
  }

  return { lines: [banner, { kind: 'out', text: `Usage: ${BINARY_NAME} --license <KEY>` }, { kind: 'out', text: `       ${BINARY_NAME} --user <NAME> --serial <SERIAL>` }] };
}

function runSimple(argv: string[], history: string[]): ShellResult | string[] {
  const [cmd, ...args] = argv;
  switch (cmd) {
    case undefined:
      return [];
    case 'help':
      return HELP;
    case 'clear':
      return { lines: [], clear: true };
    case 'whoami':
      return ['analyst'];
    case 'history':
      return history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`);
    case 'ls':
      return args.includes('-la') || args.includes('-l')
        ? ['total 3', `-rwxr-xr-x 1 analyst analyst ${IMAGE.length.toString().padStart(5)} Nov 20 09:41 ${BINARY_NAME}`, '-rw-r--r-- 1 analyst analyst   412 Nov 20 09:41 README.txt']
        : [`${BINARY_NAME}  README.txt`];
    case 'cat':
      if (args[0] === 'README.txt') return README;
      if (isBin(args[0])) return ['cat: binary output suppressed (try strings or xxd)'];
      return { lines: [{ kind: 'err', text: `cat: ${args[0] ?? ''}: No such file or directory` }] };
    case 'file':
      if (isBin(args[0])) return [`${BINARY_NAME}: PE32 executable (console) Intel 80386, for MS Windows, 3 sections`];
      if (args[0] === 'README.txt') return ['README.txt: ASCII text'];
      return { lines: [{ kind: 'err', text: 'usage: file <path>' }] };
    case 'strings': {
      let min = 4;
      let showOffset = false;
      let target: string | undefined;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-n') min = Math.max(1, parseInt(args[++i] ?? '4', 10) || 4);
        else if (args[i] === '-t') { showOffset = true; i++; }
        else target = args[i];
      }
      if (!isBin(target)) return { lines: [{ kind: 'err', text: `strings: '${target ?? ''}': No such file` }] };
      return extractStrings(IMAGE, min).map((s) => (showOffset ? `${s.offset.toString(16).padStart(7)} ${s.text}` : s.text));
    }
    case 'xxd':
      if (!isBin(args[0])) return { lines: [{ kind: 'err', text: 'usage: xxd <file>' }] };
      return hexdump(IMAGE, 1 + Math.ceil(IMAGE.length / 16));
    case `./${BINARY_NAME}`:
    case BINARY_NAME:
      return runBinary(args);
    default:
      return { lines: [{ kind: 'err', text: `${cmd}: command not found (type 'help')` }] };
  }
}

function applyFilter(lines: string[], argv: string[]): string[] | TermLine {
  const [cmd, ...args] = argv;
  switch (cmd) {
    case 'grep': {
      const flags = args.filter((a) => a.startsWith('-'));
      const pattern = args.find((a) => !a.startsWith('-'));
      if (!pattern) return { kind: 'err', text: 'usage: grep [-i] [-v] PATTERN' };
      const ci = flags.some((f) => f.includes('i'));
      const invert = flags.some((f) => f.includes('v'));
      let re: RegExp;
      try {
        re = new RegExp(pattern, ci ? 'i' : '');
      } catch {
        return { kind: 'err', text: `grep: invalid pattern '${pattern}'` };
      }
      return lines.filter((l) => re.test(l) !== invert);
    }
    case 'head':
    case 'tail': {
      const i = args.indexOf('-n');
      const n = i >= 0 ? parseInt(args[i + 1] ?? '10', 10) : 10;
      return cmd === 'head' ? lines.slice(0, n) : lines.slice(-n);
    }
    case 'wc':
      return [String(lines.length)];
    default:
      return { kind: 'err', text: `${cmd}: not supported in a pipe` };
  }
}

/** Execute one command line (supports `a | b | c`). */
export function execute(line: string, history: string[]): ShellResult {
  const stages = line.split('|').map((s) => tokenize(s.trim()));
  const first = runSimple(stages[0], history);
  if (!Array.isArray(first)) {
    if (stages.length === 1 || first.clear || first.revealed) return first;
    // Allow piping binary/err output as text
    let txt = first.lines.map((l) => l.text);
    for (const st of stages.slice(1)) {
      const r = applyFilter(txt, st);
      if (!Array.isArray(r)) return { lines: [r] };
      txt = r;
    }
    return { lines: txt.map((t) => ({ kind: 'out', text: t })) };
  }
  let out = first;
  for (const st of stages.slice(1)) {
    const r = applyFilter(out, st);
    if (!Array.isArray(r)) return { lines: [r] };
    out = r;
  }
  return { lines: out.map((t) => ({ kind: 'out', text: t })) };
}

export const COMPLETIONS = ['help', 'ls -la', 'cat README.txt', `file ${BINARY_NAME}`, `strings ${BINARY_NAME}`, `xxd ${BINARY_NAME}`, `./${BINARY_NAME}`];
