import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { CodeSample } from '../data/types';

/**
 * Zero-dependency syntax highlighter. Produces React nodes (never innerHTML),
 * so lesson content can't inject markup.
 */
type Tok = { t: 'com' | 'str' | 'num' | 'kw' | 'fn' | 'tag' | 'reg' | 'plain'; v: string };

const KW = new Set(
  (
    'const let var function return if else for while do switch case break continue new class extends implements interface type ' +
    'import export from default async await try catch finally throw typeof instanceof in of as void null undefined true false this ' +
    'def lambda pass yield with elif None True False and or not is raise ' +
    'int char bool float double unsigned struct include define sizeof static ' +
    'select from where and or order by limit insert into values update set delete create table join on as desc asc'
  ).split(' '),
);
const ASM_OPS = new Set('mov push pop call ret cmp test jmp je jne jz jnz jg jl jge jle xor and or add sub nop lea inc dec int'.split(' '));
const ASM_REGS = new Set('eax ebx ecx edx esi edi ebp esp eip rax rbx rcx rdx rsi rdi rbp rsp rip al ah'.split(' '));

function commentPattern(lang: CodeSample['language']): string {
  switch (lang) {
    case 'py':
    case 'bash':
      return '#.*';
    case 'asm':
      return ';.*';
    case 'sql':
      return '--.*';
    case 'html':
      return '<!--[\\s\\S]*?-->';
    default:
      return '\\/\\/.*|\\/\\*[\\s\\S]*?\\*\\/';
  }
}

export function tokenize(code: string, lang: CodeSample['language']): Tok[] {
  if (lang === 'text') return [{ t: 'plain', v: code }];
  const re = new RegExp(
    [
      `(${commentPattern(lang)})`,
      '("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)',
      '(\\b0x[0-9a-fA-F]+\\b|\\b\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?\\b)',
      '(<\\/?[a-zA-Z][\\w-]*|\\/?>)',
      '([A-Za-z_$][\\w$]*)',
    ].join('|'),
    'g',
  );
  const out: Tok[] = [];
  let last = 0;
  for (const m of code.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ t: 'plain', v: code.slice(last, i) });
    const [full, com, str, num, tag, word] = m;
    if (com) out.push({ t: 'com', v: full });
    else if (str) out.push({ t: 'str', v: full });
    else if (num) out.push({ t: 'num', v: full });
    else if (tag && lang === 'html') out.push({ t: 'tag', v: full });
    else if (tag) out.push({ t: 'plain', v: full });
    else if (word) {
      const lw = word.toLowerCase();
      const nextChar = code[i + word.length];
      if (lang === 'asm' && ASM_OPS.has(lw)) out.push({ t: 'kw', v: word });
      else if (lang === 'asm' && ASM_REGS.has(lw)) out.push({ t: 'reg', v: word });
      else if (KW.has(lang === 'sql' ? lw : word)) out.push({ t: 'kw', v: word });
      else if (nextChar === '(') out.push({ t: 'fn', v: word });
      else out.push({ t: 'plain', v: word });
    }
    last = i + full.length;
  }
  if (last < code.length) out.push({ t: 'plain', v: code.slice(last) });
  return out;
}

const CLS: Record<Tok['t'], string> = {
  com: 'text-slate-500 italic',
  str: 'text-emerald-300',
  num: 'text-nx-amber',
  kw: 'text-nx-crimson',
  fn: 'text-nx-cyan',
  tag: 'text-nx-cyan',
  reg: 'text-violet-300',
  plain: 'text-slate-200',
};

export function CodeBlock({ sample, tone = 'neutral' }: { sample: CodeSample; tone?: 'neutral' | 'bad' | 'good' }) {
  const [copied, setCopied] = useState(false);
  const tokens = useMemo(() => tokenize(sample.code, sample.language), [sample.code, sample.language]);
  const lineCount = sample.code.split('\n').length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sample.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };

  const toneBorder = tone === 'bad' ? 'border-nx-crimson/40' : tone === 'good' ? 'border-emerald-500/40' : 'border-line';

  return (
    <div className={`overflow-hidden rounded-lg border ${toneBorder} bg-[#05070b]`}>
      <div className="flex items-center justify-between border-b border-line bg-panel-2/60 px-3 py-1.5">
        <div className="flex items-center gap-2 font-mono text-xs text-mute">
          <span className="flex gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-nx-crimson/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-nx-amber/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
          </span>
          <span>{sample.filename ?? sample.language}</span>
        </div>
        <button onClick={copy} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-mute hover:text-ink" aria-label="Copy code">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="flex overflow-x-auto text-[13px] leading-6">
        <pre aria-hidden className="select-none border-r border-line/60 px-3 py-3 text-right font-mono text-slate-600">
          {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
        </pre>
        <pre className="flex-1 px-4 py-3 font-mono">
          <code>
            {tokens.map((tk, i) => (
              <span key={i} className={CLS[tk.t]}>
                {tk.v}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
