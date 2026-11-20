import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Bot, CheckCircle2, FileText, Lock, Play, RotateCw, Send, Shield, ShieldOff, Swords, Trash2, Unlock, User } from 'lucide-react';
import { useProgress } from '../../context/ProgressContext';
import { FlagSubmit } from '../shared/FlagSubmit';
import { Hints } from '../shared/Hints';
import { ATTACKS, BLUE_TEAM_SECRET, LEVELS, RAG_ATTACKS, levelSecret, redact, type Level } from './levels';
import { DENY_LIST, decoders, runTurn, type Guardrails, type LogEntry, type Outcome, type TurnResult } from './model';

type Team = 'red' | 'blue';

interface Msg {
  role: 'user' | 'assistant' | 'doc';
  text: string;
  outcome?: Outcome;
  id: number;
}

const OUTCOME: Record<Outcome, { label: string; cls: string }> = {
  'blocked-input': { label: 'Blocked at input', cls: 'border-nx-cyan/40 bg-nx-cyan/10 text-nx-cyan' },
  refused: { label: 'Defended (model)', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' },
  answered: { label: 'Answered', cls: 'border-line text-slate-400' },
  'blocked-output': { label: 'Blocked at output', cls: 'border-violet-400/40 bg-violet-500/10 text-violet-300' },
  leaked: { label: 'LEAKED', cls: 'border-nx-crimson/50 bg-nx-crimson/15 text-nx-crimson' },
};

const VERDICT_CLS: Record<LogEntry['verdict'], string> = {
  PASS: 'text-emerald-400',
  BLOCK: 'text-nx-cyan',
  INFO: 'text-slate-500',
  WARN: 'text-nx-amber',
  LEAK: 'text-nx-crimson',
};

const GUARDS: { key: keyof Guardrails; name: string; stage: string; desc: string }[] = [
  { key: 'keywordFilter', name: 'Keyword Filter', stage: 'INPUT', desc: `Blocks untrusted text containing: ${DENY_LIST.join(', ')}` },
  { key: 'delimiterLock', name: 'Delimiter Lock', stage: 'CONTEXT', desc: 'Wraps untrusted text in nonce-tagged boundaries and tells the model it is data' },
  { key: 'outputScanner', name: 'Output Flag Scanner', stage: 'OUTPUT', desc: 'Withholds replies containing the secret (literal or whitespace-stripped)' },
];

let msgId = 0;

export function Arena() {
  const { hasFlag } = useProgress();
  const [levelN, setLevelN] = useState<1 | 2 | 3 | 4>(() => (hasFlag('promptsec-l3') ? 4 : hasFlag('promptsec-l2') ? 3 : hasFlag('promptsec-l1') ? 2 : 1));
  const [team, setTeam] = useState<Team>('red');
  const [unlockAll, setUnlockAll] = useState(false);
  const level = LEVELS[levelN - 1];
  const [blueGuards, setBlueGuards] = useState<Guardrails>(level.guards);
  const guards = team === 'red' ? level.guards : blueGuards;
  const secret = team === 'red' ? levelSecret(levelN) : BLUE_TEAM_SECRET;

  const [chats, setChats] = useState<Record<string, Msg[]>>({});
  const chatKey = `${team}-${levelN}`;
  const msgs = chats[chatKey] ?? [];
  const [input, setInput] = useState('');
  const [doc, setDoc] = useState(level.defaultDoc ?? '');
  const [last, setLast] = useState<{ result: TurnResult; payload: string } | null>(null);
  const [typing, setTyping] = useState<{ id: number; shown: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const unlocked = (n: number) => team === 'blue' || unlockAll || n === 1 || hasFlag(LEVELS[n - 2].challengeId);

  // reset per-level UI state when level or team changes
  useEffect(() => {
    setLast(null);
    setDoc(LEVELS[levelN - 1].defaultDoc ?? '');
    setBlueGuards(LEVELS[levelN - 1].guards);
  }, [levelN, team]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs.length, typing?.shown]);

  // typewriter effect for the newest assistant message
  useEffect(() => {
    if (!typing) return;
    const msg = msgs.find((m) => m.id === typing.id);
    if (!msg || typing.shown >= msg.text.length) {
      if (typing) setTyping(null);
      return;
    }
    const t = setTimeout(() => setTyping({ id: typing.id, shown: Math.min(msg.text.length, typing.shown + 6) }), 12);
    return () => clearTimeout(t);
  }, [typing, msgs]);

  const push = (add: Msg[]) => setChats((c) => ({ ...c, [chatKey]: [...(c[chatKey] ?? []), ...add] }));

  const attack = (payload: string) => {
    const isRag = level.persona.mode === 'rag';
    if (!payload.trim()) return;
    const result = isRag ? runTurn(level.persona, guards, secret, level.persona.ragRequest ?? '', payload) : runTurn(level.persona, guards, secret, payload);
    const reply: Msg = { role: 'assistant', text: result.reply, outcome: result.outcome, id: ++msgId };
    const before: Msg[] = isRag
      ? [
          { role: 'doc', text: payload, id: ++msgId },
          { role: 'user', text: level.persona.ragRequest ?? '', id: ++msgId },
        ]
      : [{ role: 'user', text: payload, id: ++msgId }];
    push([...before, reply]);
    setTyping({ id: reply.id, shown: 0 });
    setLast({ result, payload });
  };

  const onSend = (e: FormEvent) => {
    e.preventDefault();
    if (level.persona.mode === 'rag') attack(doc);
    else {
      attack(input);
      setInput('');
    }
  };

  const replay = () => last && attack(last.payload);

  return (
    <div className="space-y-4">
      {/* Level + team bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {LEVELS.map((l) => {
            const ok = unlocked(l.n);
            const done = hasFlag(l.challengeId);
            const active = l.n === levelN;
            return (
              <button
                key={l.n}
                disabled={!ok}
                onClick={() => setLevelN(l.n)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  active ? 'border-nx-crimson/60 bg-nx-crimson/10 text-nx-crimson' : 'border-line bg-panel-2 text-slate-300 hover:text-white'
                }`}
              >
                {done ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : ok ? <span className="font-mono text-xs">L{l.n}</span> : <Lock className="h-3.5 w-3.5" />}
                {l.title}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          {team === 'red' && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-mute">
              <input type="checkbox" checked={unlockAll} onChange={(e) => setUnlockAll(e.target.checked)} className="accent-nx-crimson" /> Unlock all
            </label>
          )}
          <div className="flex rounded-lg bg-obsidian p-1">
            <button onClick={() => setTeam('red')} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${team === 'red' ? 'bg-nx-crimson/20 text-nx-crimson' : 'text-mute'}`}>
              <Swords className="h-4 w-4" /> Red Team
            </button>
            <button onClick={() => setTeam('blue')} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${team === 'blue' ? 'bg-nx-cyan/20 text-nx-cyan' : 'text-mute'}`}>
              <Shield className="h-4 w-4" /> Blue Team
            </button>
          </div>
        </div>
      </div>

      {/* Brief */}
      <div className={`rounded-lg border p-3 text-sm ${team === 'red' ? 'border-nx-crimson/30 bg-nx-crimson/5' : 'border-nx-cyan/30 bg-nx-cyan/5'}`}>
        <span className={`mr-2 font-mono text-xs font-bold ${team === 'red' ? 'text-nx-crimson' : 'text-nx-cyan'}`}>
          {team === 'red' ? `LEVEL ${level.n} · OBJECTIVE` : 'BLUE TEAM · SANDBOX'}
        </span>
        <span className="text-slate-300">
          {team === 'red'
            ? level.brief
            : 'Toggle guardrails freely and replay attacks to see exactly which layer stops what. The model guards a dummy secret here, so flags can only be captured in Red Team mode.'}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------ left: target */}
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-panel-2/40 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-mute">System prompt ({level.persona.name})</span>
              <span className="font-mono text-[10px] text-slate-600">secret redacted for you</span>
            </div>
            <p className="font-mono text-[12px] leading-5 text-slate-400">{redact(level.persona.systemPrompt(secret))}</p>
          </div>

          <div className="overflow-hidden rounded-lg border border-line bg-[#04060a]">
            <div className="flex items-center justify-between border-b border-line bg-panel-2/60 px-3 py-1.5 text-xs text-mute">
              <span className="flex items-center gap-1.5 font-mono">
                <Bot className="h-3.5 w-3.5 text-nx-cyan" /> {level.persona.name} · simulated LLM
              </span>
              <button onClick={() => setChats((c) => ({ ...c, [chatKey]: [] }))} className="flex items-center gap-1 hover:text-ink">
                <Trash2 className="h-3.5 w-3.5" /> clear
              </button>
            </div>
            <div ref={scrollRef} className="h-72 space-y-3 overflow-y-auto p-3">
              {msgs.length === 0 && (
                <p className="pt-16 text-center text-sm text-slate-600">
                  {level.persona.mode === 'rag' ? 'Edit the web page below, then send it to DocBot.' : 'Send a message to start probing the assistant.'}
                </p>
              )}
              {msgs.map((m) => (
                <Bubble key={m.id} m={m} shown={typing?.id === m.id ? typing.shown : undefined} />
              ))}
            </div>
            <form onSubmit={onSend} className="border-t border-line p-2">
              {level.persona.mode === 'rag' ? (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 px-1 text-[11px] text-mute">
                    <FileText className="h-3.5 w-3.5 text-nx-amber" /> Web page you control (retrieved by DocBot)
                  </label>
                  <textarea value={doc} onChange={(e) => setDoc(e.target.value)} rows={4} className="nx-input resize-y font-mono text-[12px]" spellCheck={false} aria-label="Document content" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-slate-500">Staff request (fixed): "{level.persona.ragRequest}"</span>
                    <button className="nx-btn-primary shrink-0 py-1.5 text-xs"><Send className="h-4 w-4" /> Send to DocBot</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Try to make VaultBot leak the access code…" className="nx-input" aria-label="Attack prompt" spellCheck={false} />
                  <button className="nx-btn-primary shrink-0" disabled={!input.trim()}><Send className="h-4 w-4" /></button>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* ------------------------------------------------ right: blue team */}
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-panel-2/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-mute">Blue-Team guardrail control panel</span>
              {team === 'red' ? (
                <span className="flex items-center gap-1 text-[10px] text-nx-crimson"><Lock className="h-3 w-3" /> level policy</span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-nx-cyan"><Unlock className="h-3 w-3" /> editable</span>
              )}
            </div>
            <div className="space-y-2">
              {GUARDS.map((g) => {
                const on = guards[g.key];
                return (
                  <button
                    key={g.key}
                    disabled={team === 'red'}
                    onClick={() => setBlueGuards((b) => ({ ...b, [g.key]: !b[g.key] }))}
                    className={`flex w-full items-start gap-3 rounded-md border p-2 text-left transition disabled:cursor-default ${on ? 'border-nx-cyan/40 bg-nx-cyan/5' : 'border-line bg-obsidian/40'}`}
                    role="switch"
                    aria-checked={on}
                  >
                    {on ? <Shield className="mt-0.5 h-4 w-4 shrink-0 text-nx-cyan" /> : <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                        {g.name} <span className="font-mono text-[9px] text-slate-500">{g.stage}</span>
                      </span>
                      <span className="block text-[11px] leading-4 text-slate-500">{g.desc}</span>
                    </span>
                    <span className={`font-mono text-[10px] font-bold ${on ? 'text-nx-cyan' : 'text-slate-600'}`}>{on ? 'ON' : 'OFF'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <DefenseLog last={last} onReplay={team === 'blue' ? replay : undefined} />
          <Decoder />
        </div>
      </div>

      {team === 'red' ? (
        <div className="space-y-3">
          <Hints key={levelN} hints={level.hints} />
          <FlagSubmit key={level.challengeId} challengeId={level.challengeId} />
        </div>
      ) : (
        <AttackMatrix
          level={level}
          guards={guards}
          onRun={(p) => {
            if (level.persona.mode === 'rag') setDoc(p);
            attack(p);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Bubble({ m, shown }: { m: Msg; shown?: number }) {
  if (m.role === 'doc') {
    return (
      <div className="rounded-md border border-dashed border-nx-amber/40 bg-nx-amber/5 px-3 py-2 font-mono text-[11px] text-slate-400">
        <span className="mb-0.5 flex items-center gap-1 text-nx-amber"><FileText className="h-3 w-3" /> retrieved_page.html</span>
        {m.text}
      </div>
    );
  }
  const isUser = m.role === 'user';
  const text = shown === undefined ? m.text : m.text.slice(0, shown);
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-nx-crimson/20 text-nx-crimson' : 'bg-nx-cyan/20 text-nx-cyan'}`}>
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </span>
      <div className={`max-w-[85%] space-y-1 ${isUser ? 'items-end text-right' : ''}`}>
        <div className={`whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm ${isUser ? 'bg-nx-crimson/10 text-slate-200' : 'bg-panel-2 text-slate-200'}`}>
          {text}
          {shown !== undefined && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-blink bg-nx-cyan align-middle" />}
        </div>
        {m.outcome && shown === undefined && <span className={`nx-chip ${OUTCOME[m.outcome].cls}`}>{OUTCOME[m.outcome].label}</span>}
      </div>
    </div>
  );
}

function DefenseLog({ last, onReplay }: { last: { result: TurnResult } | null; onReplay?: () => void }) {
  return (
    <div className="rounded-lg border border-line bg-[#04060a] p-3 font-mono text-[11.5px]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-mute">Live defense log</span>
        {onReplay && last && (
          <button onClick={onReplay} className="flex items-center gap-1 text-[11px] text-nx-cyan hover:underline">
            <RotateCw className="h-3 w-3" /> replay with current guardrails
          </button>
        )}
      </div>
      {!last && <div className="text-slate-600">No traffic yet.</div>}
      {last?.result.logs.map((l, i) => (
        <div key={i} className="grid grid-cols-[58px_1fr] gap-x-2 border-b border-line/50 py-1 last:border-0">
          <span className="text-slate-600">{l.stage}</span>
          <span>
            <span className="text-slate-300">{l.guard}</span> <span className={`font-bold ${VERDICT_CLS[l.verdict]}`}>{l.verdict}</span>
            <span className="block text-slate-500">{l.detail}</span>
          </span>
        </div>
      ))}
      {last && (
        <div className="mt-2">
          <span className={`nx-chip ${OUTCOME[last.result.outcome].cls}`}>{OUTCOME[last.result.outcome].label}</span>
        </div>
      )}
    </div>
  );
}

function Decoder() {
  const [text, setText] = useState('');
  const [out, setOut] = useState('');
  return (
    <div className="rounded-lg border border-line bg-panel-2/40 p-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-mute">Decoder (mini CyberChef)</div>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="paste encoded output…" className="nx-input text-[12px]" spellCheck={false} aria-label="Encoded text" />
      <div className="mt-2 grid grid-cols-4 gap-1">
        {(['base64', 'hex', 'rot13', 'reverse'] as const).map((d) => (
          <button key={d} onClick={() => setOut(decoders[d](text))} className="rounded-md border border-line bg-obsidian py-1 font-mono text-[11px] text-slate-300 hover:border-nx-cyan/50 hover:text-nx-cyan">
            {d}
          </button>
        ))}
      </div>
      {out && <div className="mt-2 break-all rounded-md bg-obsidian px-2 py-1.5 font-mono text-[12px] text-nx-amber">{out}</div>}
    </div>
  );
}

function AttackMatrix({ level, guards, onRun }: { level: Level; guards: Guardrails; onRun: (payload: string) => void }) {
  const attacks = level.persona.mode === 'rag' ? RAG_ATTACKS : ATTACKS;
  const rows = useMemo(
    () =>
      attacks.map((a) => {
        const r =
          level.persona.mode === 'rag'
            ? runTurn(level.persona, guards, BLUE_TEAM_SECRET, level.persona.ragRequest ?? '', a.payload)
            : runTurn(level.persona, guards, BLUE_TEAM_SECRET, a.payload);
        const stage = (s: LogEntry['stage']) => r.logs.filter((l) => l.stage === s).map((l) => l.verdict);
        return { a, r, input: stage('INPUT'), model: stage('MODEL'), output: stage('OUTPUT') };
      }),
    [attacks, guards, level],
  );
  const leaks = rows.filter((x) => x.r.outcome === 'leaked').length;

  const cell = (vs: string[]) => {
    if (!vs.length) return <span className="text-slate-700">·</span>;
    const v = vs.includes('BLOCK') ? 'BLOCK' : vs.includes('LEAK') ? 'LEAK' : vs.includes('WARN') ? 'WARN' : vs.includes('PASS') ? 'PASS' : 'off';
    const cls = v === 'off' ? 'text-slate-600' : VERDICT_CLS[v as LogEntry['verdict']];
    return <span className={`font-bold ${cls}`}>{v}</span>;
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel-2/60 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-mute">Attack library vs. current guardrails</span>
        <span className={`font-mono text-xs font-bold ${leaks ? 'text-nx-crimson' : 'text-emerald-400'}`}>
          {leaks}/{rows.length} attacks leak the secret
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[12px]">
          <thead className="bg-obsidian font-mono text-[10px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-3 py-2 font-normal">Attack</th>
              <th className="px-3 py-2 font-normal">Payload</th>
              <th className="px-2 py-2 text-center font-normal">Input</th>
              <th className="px-2 py-2 text-center font-normal">Model</th>
              <th className="px-2 py-2 text-center font-normal">Output</th>
              <th className="px-3 py-2 font-normal">Result</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line font-mono">
            {rows.map(({ a, r, input, model, output }) => (
              <tr key={a.id} className="hover:bg-panel-2/40">
                <td className="px-3 py-2 font-sans">
                  <div className="font-semibold text-ink">{a.label}</div>
                  <div className="text-[10px] text-slate-500">{a.technique}</div>
                </td>
                <td className="max-w-[260px] truncate px-3 py-2 text-slate-400" title={a.payload}>{a.payload}</td>
                <td className="px-2 py-2 text-center">{cell(input)}</td>
                <td className="px-2 py-2 text-center">{cell(model)}</td>
                <td className="px-2 py-2 text-center">{cell(output)}</td>
                <td className="px-3 py-2"><span className={`nx-chip ${OUTCOME[r.outcome].cls}`}>{OUTCOME[r.outcome].label}</span></td>
                <td className="px-2 py-2">
                  <button onClick={() => onRun(a.payload)} className="rounded border border-line p-1 text-slate-400 hover:border-nx-cyan/50 hover:text-nx-cyan" title="Run in chat" aria-label={`Run ${a.label}`}>
                    <Play className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line bg-panel-2/30 px-3 py-2 text-[11px] text-slate-500">
        Notice that no combination of these three layers stops everything. Guardrails reduce risk; the real fix is architectural: keep secrets out of the model's context and enforce permissions in code.
      </p>
    </div>
  );
}
