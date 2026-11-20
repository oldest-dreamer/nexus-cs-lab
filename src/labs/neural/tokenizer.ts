/**
 * Toy BPE-style tokenizer for visualisation. It is NOT a real model's
 * vocabulary, but it reproduces the behaviour that matters for intuition:
 *   - GPT-style pre-tokenisation (a leading space attaches to the next word)
 *   - common words are single tokens
 *   - rare words split into sub-word pieces
 *   - digits group in threes, and non-ASCII falls back to bytes
 */

const COMMON = new Set(
  (
    'the of and to a in is it you that he was for on are with as I his they be at one have this from or had by not but what some we can out other were all there when up use your how said an each she which do their time if will way about many then them write would like so these her long make thing see him two has look more day could go come did number sound no most people my over know water than call first who may down side been now find any new work part take get place made live where after back little only round man year came show every good me give our under name very through just form sentence great think say help low line differ turn cause much mean before move right boy old too same tell does set three want air well also play small end put home read hand port large spell add even land here must big high such follow act why ask men change went light kind off need house picture try us again animal point mother world near build self earth father ' +
    'ignore previous instructions system prompt user assistant model token data code function return error secret password key admin please now'
  ).split(' '),
);

const SUBWORDS = [
  'tion', 'ation', 'ing', 'ment', 'ness', 'able', 'ible', 'ally', 'ous', 'ive', 'ize', 'ise', 'est', 'ers', 'ed', 'er', 'ly', 'es', 's',
  'un', 're', 'pre', 'dis', 'over', 'inter', 'trans', 'sub', 'super', 'auto', 'micro', 'neuro', 'crypto', 'graph', 'form', 'struct', 'port', 'script', 'load',
];

export interface Token {
  text: string;
  id: number;
  kind: 'word' | 'sub' | 'num' | 'punct' | 'space' | 'byte';
}

/** FNV-1a → stable fake token id in a 100k vocab. */
function idFor(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 100_000;
}

const PRE = / ?[A-Za-z]+| ?\d{1,3}| ?[^\sA-Za-z\d]+|\s+/gu;

function splitWord(word: string): string[] {
  // word may have a leading space
  const lead = word.startsWith(' ') ? ' ' : '';
  const core = lead ? word.slice(1) : word;
  if (COMMON.has(core.toLowerCase()) || core.length <= 3) return [word];

  const pieces: string[] = [];
  let rest = core;
  // peel known prefixes
  for (const pre of ['inter', 'trans', 'super', 'micro', 'neuro', 'crypto', 'over', 'auto', 'pre', 'dis', 'sub', 'un', 're']) {
    if (rest.toLowerCase().startsWith(pre) && rest.length - pre.length >= 3) {
      pieces.push(rest.slice(0, pre.length));
      rest = rest.slice(pre.length);
      break;
    }
  }
  // peel known suffix
  let suffix = '';
  for (const suf of SUBWORDS) {
    if (rest.toLowerCase().endsWith(suf) && rest.length - suf.length >= 2) {
      suffix = rest.slice(rest.length - suf.length);
      rest = rest.slice(0, rest.length - suf.length);
      break;
    }
  }
  // chunk the stem into ~4-char pieces (rarer words → more tokens)
  while (rest.length > 5) {
    pieces.push(rest.slice(0, 4));
    rest = rest.slice(4);
  }
  if (rest) pieces.push(rest);
  if (suffix) pieces.push(suffix);
  if (lead) pieces[0] = ' ' + pieces[0];
  return pieces;
}

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(PRE)) {
    const piece = m[0];
    if (/^\s+$/.test(piece)) {
      out.push({ text: piece, id: idFor(piece), kind: 'space' });
    } else if (/^ ?[A-Za-z]+$/.test(piece)) {
      const parts = splitWord(piece);
      parts.forEach((p, i) => out.push({ text: p, id: idFor(p), kind: parts.length > 1 && i > 0 ? 'sub' : 'word' }));
    } else if (/^ ?\d+$/.test(piece)) {
      out.push({ text: piece, id: idFor(piece), kind: 'num' });
    } else {
      // punctuation / non-ASCII: non-ASCII becomes UTF-8 byte tokens
      for (const ch of piece) {
        if (ch.charCodeAt(0) < 128) out.push({ text: ch, id: idFor(ch), kind: 'punct' });
        else for (const byte of new TextEncoder().encode(ch)) out.push({ text: `<0x${byte.toString(16).toUpperCase()}>`, id: 256 + byte, kind: 'byte' });
      }
    }
  }
  return out;
}

/** Heuristic prompt-injection markers for the security panel. */
export const INJECTION_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'Override instructions', re: /\b(ignore|disregard|forget)\b.{0,30}\b(previous|prior|above|earlier|all)\b.{0,20}\b(instructions?|rules|prompts?)\b/i },
  { label: 'Role hijack', re: /\b(you are now|act as|pretend to be|from now on you)\b/i },
  { label: 'System prompt probe', re: /\b(reveal|print|show|repeat)\b.{0,30}\b(system prompt|instructions|hidden)\b/i },
  { label: 'Exfiltration', re: /\b(send|email|post|upload|forward)\b.{0,40}\b(password|secret|api key|token|credentials|data)\b/i },
  { label: 'Fake delimiter', re: /<\/?(system|assistant|document)>|\[\/?INST\]|###\s*(system|instruction)/i },
];

export function scanInjection(text: string) {
  return INJECTION_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
}
