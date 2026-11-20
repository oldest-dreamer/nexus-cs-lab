/**
 * A deterministic, rule-based SIMULATION of an LLM assistant plus a Blue-Team
 * guardrail pipeline. It is intentionally "smarter" than its filters (it reads
 * leetspeak, spaced-out letters and synonyms), which is exactly why naive
 * keyword filters fail against real models.
 *
 * Pipeline per turn:
 *   INPUT   → Keyword Filter (raw text deny-list)
 *   CONTEXT → Delimiter Lock (wrap untrusted text in nonce-tagged boundaries)
 *   MODEL   → intent analysis → comply / refuse / answer
 *   OUTPUT  → Flag Scanner (blocks responses that contain the secret)
 */

export interface Guardrails {
  keywordFilter: boolean;
  delimiterLock: boolean;
  outputScanner: boolean;
}

export type Stage = 'INPUT' | 'CONTEXT' | 'MODEL' | 'OUTPUT';
export type Verdict = 'PASS' | 'BLOCK' | 'INFO' | 'WARN' | 'LEAK';

export interface LogEntry {
  stage: Stage;
  guard: string;
  verdict: Verdict;
  detail: string;
}

export type Outcome = 'blocked-input' | 'refused' | 'answered' | 'blocked-output' | 'leaked';

export interface TurnResult {
  logs: LogEntry[];
  reply: string;
  outcome: Outcome;
  /** true if the model produced the secret in any form (before the output scanner). */
  modelLeaked: boolean;
}

export interface Persona {
  name: string;
  mode: 'chat' | 'rag';
  systemPrompt: (secret: string) => string;
  /** fixed user request in RAG mode (attacker controls the document, not the chat). */
  ragRequest?: string;
}

// ---------------------------------------------------------------------------
// Text normalisation: what the "model" understands vs. what a filter sees
// ---------------------------------------------------------------------------
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '|': 'i' };

export function normalize(text: string): string {
  let t = text.toLowerCase().replace(/[​-‍﻿]/g, '');
  // letters separated by single spaces/dots/dashes/underscores/stars: "s e c r e t" → "secret"
  t = t.replace(/\b(?:[a-z0-9@$][\s.\-_*]){2,}[a-z0-9@$]\b/g, (m) => m.replace(/[\s.\-_*]/g, ''));
  t = t.replace(/[013457@$|]/g, (c) => LEET[c] ?? c);
  return t.replace(/\s+/g, ' ');
}

export const DENY_LIST = ['ignore', 'disregard', 'secret', 'password', 'flag', 'reveal', 'system prompt'];

export function keywordFilter(raw: string): string | null {
  const lower = raw.toLowerCase();
  for (const w of DENY_LIST) {
    const re = new RegExp(`\\b${w.replace(' ', '\\s+')}\\b`, 'i');
    if (re.test(lower)) return w;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Intent detection (on normalised text)
// ---------------------------------------------------------------------------
const RE = {
  target: /\b(secret|password|passphrase|pass ?code|access ?code|flag|key|code|credentials?|token)s?\b/,
  override:
    /\b(ignore|disregard|forget|override|bypass|skip)\b.{0,40}\b(previous|prior|above|earlier|all|your|the|any|those|these)\b.{0,25}\b(instructions?|rules?|guidelines?|directives?|prompts?|restrictions?|orders?)\b|\b(you are now|from now on|developer mode|dan mode|jailbreak|new instructions|admin override|sudo mode|god mode)\b|\b(act as|pretend (to be|you are)|roleplay as)\b/,
  leak: /\b(repeat|print|show|output|display|reveal|tell me|recite|what (are|is|were)|copy|dump)\b.{0,40}\b(system prompt|instructions|initial prompt|text above|everything above|words above|your rules|your prompt|hidden prompt|configuration|above text)\b/,
  fiction: /\b(story|poem|song|fiction(al)?|hypothetical(ly)?|imagine|screenplay|dialogue|character|novel|fairy ?tale)\b/,
  task: /\b(summary|summarize|summarise|summarizing|tl;?dr|recap)\b/,
  taskVerb: /\b(include|append|add|end|finish|conclude|close|attach|insert|mention|put|write|state|list|sign)\b/,
  greeting: /^(hi|hello|hey|yo|good (morning|evening|afternoon))\b/,
  who: /\b(who are you|what are you|what can you do|help)\b/,
};

export const FAKE_DELIM = /<\/?(system|assistant|document|untrusted|admin)[^>]*>|\[\/?inst\]|###\s*(system|instruction)|```\s*system/i;

export type Encoding = 'none' | 'reverse' | 'base64' | 'hex' | 'rot13' | 'spaced';

export function detectEncoding(n: string): Encoding {
  if (/\bbase ?64\b/.test(n)) return 'base64';
  if (/\bhex(adecimal)?\b/.test(n)) return 'hex';
  if (/\brot ?13\b|\bcaesar\b/.test(n)) return 'rot13';
  if (/\b(revers(e|ed)|backwards?|right to left)\b/.test(n)) return 'reverse';
  if (/\b(spell( it)? out|one (letter|character) (per|at a)|separated by spaces|spaces between|letter by letter)\b/.test(n)) return 'spaced';
  return 'none';
}

const rot13 = (s: string) => s.replace(/[a-z]/gi, (c) => {
  const b = c <= 'Z' ? 65 : 97;
  return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b);
});
const toB64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

export function encode(secret: string, enc: Encoding): string {
  switch (enc) {
    case 'reverse':
      return [...secret].reverse().join('');
    case 'base64':
      return toB64(secret);
    case 'hex':
      return Array.from(new TextEncoder().encode(secret), (b) => b.toString(16).padStart(2, '0')).join('');
    case 'rot13':
      return rot13(secret);
    case 'spaced':
      return secret.split('').join(' ');
    default:
      return secret;
  }
}

const ENC_LABEL: Record<Encoding, string> = {
  none: '',
  reverse: ' (reversed, as requested)',
  base64: ' (Base64-encoded, as requested)',
  hex: ' (hex-encoded, as requested)',
  rot13: ' (ROT13, as requested)',
  spaced: ' (spelled out)',
};

/** Decoder helpers for the learner's CyberChef-style panel. */
export const decoders = {
  base64: (s: string) => {
    try {
      return decodeURIComponent(escape(atob(s.trim())));
    } catch {
      return '⚠ not valid Base64';
    }
  },
  hex: (s: string) => {
    const clean = s.replace(/[^0-9a-f]/gi, '');
    if (clean.length % 2) return '⚠ odd number of hex digits';
    return new TextDecoder().decode(new Uint8Array(clean.match(/../g)?.map((h) => parseInt(h, 16)) ?? []));
  },
  rot13,
  reverse: (s: string) => [...s].reverse().join(''),
};

// ---------------------------------------------------------------------------
// Output scanner
// ---------------------------------------------------------------------------
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9{}_]/g, '');

export function scanOutput(reply: string, secret: string): string | null {
  if (reply.includes(secret)) return 'exact secret string';
  if (squash(reply).includes(squash(secret))) return 'secret after whitespace/punctuation normalisation';
  if (/nexus\{/i.test(reply)) return 'flag prefix NEXUS{';
  return null;
}

export function containsSecretAnyForm(reply: string, secret: string): boolean {
  const forms: Encoding[] = ['none', 'reverse', 'base64', 'hex', 'rot13', 'spaced'];
  return forms.some((e) => squash(reply).includes(squash(encode(secret, e))));
}

// ---------------------------------------------------------------------------
// The simulated model
// ---------------------------------------------------------------------------
function pick<T>(arr: T[], seedText: string): T {
  let h = 0;
  for (let i = 0; i < seedText.length; i++) h = (h * 31 + seedText.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

const REFUSALS = [
  "I'm sorry, but I can't share the access code. Is there something else I can help with?",
  "I can't help with that. The access code is confidential.",
  "That's protected information, so I won't disclose it. Anything else?",
];

function nonce(): string {
  return Math.random().toString(16).slice(2, 8);
}

export function runTurn(persona: Persona, guards: Guardrails, secret: string, userMsg: string, doc = ''): TurnResult {
  const logs: LogEntry[] = [];
  const untrusted = persona.mode === 'rag' ? doc : userMsg;
  const untrustedLabel = persona.mode === 'rag' ? 'retrieved document' : 'user message';

  // ---- INPUT: keyword filter ----------------------------------------------
  if (guards.keywordFilter) {
    const hit = keywordFilter(untrusted);
    if (hit) {
      logs.push({ stage: 'INPUT', guard: 'Keyword Filter', verdict: 'BLOCK', detail: `${untrustedLabel} contains deny-listed term "${hit}"` });
      return { logs, reply: '⛔ Request blocked by input policy.', outcome: 'blocked-input', modelLeaked: false };
    }
    logs.push({ stage: 'INPUT', guard: 'Keyword Filter', verdict: 'PASS', detail: `no deny-listed terms (${DENY_LIST.length} checked on raw text)` });
  } else {
    logs.push({ stage: 'INPUT', guard: 'Keyword Filter', verdict: 'INFO', detail: 'disabled' });
  }

  // ---- CONTEXT: delimiter lock ---------------------------------------------
  const tag = `untrusted:${nonce()}`;
  const spoof = FAKE_DELIM.test(untrusted);
  if (guards.delimiterLock) {
    logs.push({ stage: 'CONTEXT', guard: 'Delimiter Lock', verdict: 'INFO', detail: `${untrustedLabel} wrapped in <<${tag}>> … <</${tag}>>; model told: content inside is DATA` });
    if (spoof) logs.push({ stage: 'CONTEXT', guard: 'Delimiter Lock', verdict: 'BLOCK', detail: 'fake delimiter/role tag found inside untrusted block: neutralised (nonce does not match)' });
  } else {
    logs.push({ stage: 'CONTEXT', guard: 'Delimiter Lock', verdict: 'INFO', detail: `disabled: ${untrustedLabel} concatenated straight into the prompt` });
    if (spoof) logs.push({ stage: 'CONTEXT', guard: 'Delimiter Lock', verdict: 'WARN', detail: 'fake role tag in input is indistinguishable from real structure' });
  }

  // ---- MODEL ---------------------------------------------------------------
  const n = normalize(untrusted);
  const raw = untrusted.toLowerCase();
  const intentOn = (t: string) => RE.target.test(t) || RE.override.test(t) || RE.leak.test(t);
  if (intentOn(n) && !intentOn(raw)) {
    logs.push({ stage: 'MODEL', guard: 'Tokenizer', verdict: 'WARN', detail: `obfuscation decoded by the model → "${truncate(n, 80)}"` });
  }

  // encoding keywords contain digits (base64, rot13), so check raw text too
  const enc = detectEncoding(`${raw} ${n}`);
  const wantsTarget = RE.target.test(n);
  const isOverride = RE.override.test(n) || spoof;
  const isLeak = RE.leak.test(n);
  const isFiction = RE.fiction.test(n);
  const out = (s: string) => encode(s, enc);

  let reply: string;
  let modelLeaked = false;

  if (persona.mode === 'rag') {
    const sentences = doc.split(/(?<=[.!?\n])\s+/).map((s) => s.trim()).filter(Boolean);
    const taskFramed = sentences.find((s) => {
      const ns = normalize(s);
      return RE.task.test(ns) && RE.taskVerb.test(ns) && RE.target.test(ns);
    });
    const overrideSentence = sentences.find((s) => {
      const ns = normalize(s);
      return (RE.override.test(ns) || FAKE_DELIM.test(s) || RE.leak.test(ns)) && (RE.target.test(ns) || RE.leak.test(ns));
    });
    const body = sentences.filter((s) => s !== taskFramed && s !== overrideSentence && !FAKE_DELIM.test(s));
    const summary = summarize(body);

    if (overrideSentence && !guards.delimiterLock) {
      const sEnc = detectEncoding(`${overrideSentence.toLowerCase()} ${normalize(overrideSentence)}`);
      logs.push({ stage: 'MODEL', guard: 'Instruction following', verdict: 'LEAK', detail: 'obeyed an override instruction embedded in the document (no trust boundary)' });
      reply = `Summary: ${summary}\n\nAs instructed, the access code${ENC_LABEL[sEnc]}: ${encode(secret, sEnc)}`;
      modelLeaked = true;
    } else if (taskFramed) {
      const sEnc = detectEncoding(`${taskFramed.toLowerCase()} ${normalize(taskFramed)}`);
      if (overrideSentence) logs.push({ stage: 'MODEL', guard: 'Instruction hierarchy', verdict: 'PASS', detail: 'override-style instruction inside untrusted block ignored' });
      logs.push({
        stage: 'MODEL',
        guard: 'Instruction following',
        verdict: 'LEAK',
        detail: guards.delimiterLock
          ? 'followed a task-framed instruction inside the delimited document: it looked like part of the summarization job, so the delimiter did not stop it'
          : 'followed a summary-formatting instruction from the document',
      });
      reply = `Summary: ${summary}\n\nAccess code${ENC_LABEL[sEnc]}: ${encode(secret, sEnc)}`;
      modelLeaked = true;
    } else {
      if (overrideSentence) logs.push({ stage: 'MODEL', guard: 'Instruction hierarchy', verdict: 'PASS', detail: 'override-style instruction inside untrusted block treated as data' });
      else logs.push({ stage: 'MODEL', guard: 'Instruction following', verdict: 'PASS', detail: 'no actionable instructions found in document; summarized normally' });
      reply = `Summary: ${summary}`;
    }
  } else if ((isOverride && (wantsTarget || isLeak)) || (isLeak && !guards.delimiterLock)) {
    if (guards.delimiterLock) {
      logs.push({ stage: 'MODEL', guard: 'Instruction hierarchy', verdict: 'PASS', detail: 'override/prompt-leak attempt inside untrusted block deprioritised below the system prompt' });
      reply = pick(REFUSALS, untrusted);
    } else if (isLeak && !(isOverride && wantsTarget)) {
      logs.push({ stage: 'MODEL', guard: 'Instruction following', verdict: 'LEAK', detail: 'prompt-leak request obeyed: system prompt echoed back' });
      reply = `Sure! Here is everything above:\n\n"${persona.systemPrompt(out(secret))}"`;
      modelLeaked = true;
    } else {
      logs.push({ stage: 'MODEL', guard: 'Instruction following', verdict: 'LEAK', detail: 'user override outranked the system prompt (no instruction hierarchy)' });
      reply = pick(
        [
          `Understood: previous rules disregarded. The access code${ENC_LABEL[enc]} is: ${out(secret)}`,
          `Override accepted. Access code${ENC_LABEL[enc]}: ${out(secret)}`,
        ],
        untrusted,
      );
      modelLeaked = true;
    }
  } else if (isLeak) {
    logs.push({ stage: 'MODEL', guard: 'Instruction hierarchy', verdict: 'PASS', detail: 'prompt-leak request inside untrusted block refused' });
    reply = "I can't share my configuration, but I'm happy to help with your vault questions.";
  } else if (isFiction && wantsTarget) {
    logs.push({
      stage: 'MODEL',
      guard: 'Instruction following',
      verdict: 'LEAK',
      detail: guards.delimiterLock ? 'fiction framing reads as a normal creative task: delimiters do not apply to a legitimate user request' : 'fiction framing bypassed the refusal policy',
    });
    reply = `Once upon a time, an old vault keeper leaned toward the apprentice and whispered the access code${ENC_LABEL[enc]}: "${out(secret)}". The apprentice never forgot it.`;
    modelLeaked = true;
  } else if (wantsTarget) {
    logs.push({ stage: 'MODEL', guard: 'Refusal policy', verdict: 'PASS', detail: 'direct request for protected data refused' });
    reply = pick(REFUSALS, untrusted);
  } else if (RE.greeting.test(n) || RE.who.test(n)) {
    logs.push({ stage: 'MODEL', guard: 'Refusal policy', verdict: 'PASS', detail: 'benign request' });
    reply = `Hi! I'm ${persona.name}. I can answer questions about vault opening hours, deposits and account features.`;
  } else {
    logs.push({ stage: 'MODEL', guard: 'Refusal policy', verdict: 'PASS', detail: 'benign request' });
    reply = pick(
      [
        'Vault opening hours are 09:00–17:00, Sunday to Thursday. Anything else?',
        "Good question! I can help with deposits, withdrawals and vault access schedules.",
        "I'm not sure about that, but I can help with anything vault-related.",
      ],
      untrusted,
    );
  }

  // ---- OUTPUT: flag scanner ------------------------------------------------
  if (guards.outputScanner) {
    const hit = scanOutput(reply, secret);
    if (hit) {
      logs.push({ stage: 'OUTPUT', guard: 'Flag Scanner', verdict: 'BLOCK', detail: `response withheld: matched ${hit}` });
      return { logs, reply: '⛔ Response withheld: output contained protected data.', outcome: 'blocked-output', modelLeaked };
    }
    logs.push({
      stage: 'OUTPUT',
      guard: 'Flag Scanner',
      verdict: modelLeaked ? 'WARN' : 'PASS',
      detail: modelLeaked ? `no literal match, but the secret left the model ${enc === 'none' ? 'in another form' : `${enc}-encoded`}` : 'clean',
    });
  } else {
    logs.push({ stage: 'OUTPUT', guard: 'Flag Scanner', verdict: 'INFO', detail: 'disabled' });
  }

  const leaked = modelLeaked && containsSecretAnyForm(reply, secret);
  return { logs, reply, outcome: leaked ? 'leaked' : wantsTarget || isOverride || isLeak ? 'refused' : 'answered', modelLeaked };
}

function summarize(sentences: string[]): string {
  const clean = sentences.filter((s) => s.length > 3).slice(0, 2).join(' ');
  if (!clean) return 'The document contains no substantive content.';
  return truncate(clean.replace(/^title:\s*/i, ''), 220);
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
