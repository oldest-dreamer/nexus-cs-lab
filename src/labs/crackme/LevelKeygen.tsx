import { useMemo, useState, type FormEvent } from 'react';
import { Dices, Play } from 'lucide-react';
import { CodeBlock } from '../../components/CodeBlock';
import { BINARY_NAME, PSEUDOCODE, USERNAMES, XOR_KEY, decodeFlag, keygen } from './binary';
import { FlagSubmit } from '../shared/FlagSubmit';
import { Hints } from '../shared/Hints';
import { Objective } from './LevelStrings';

const pick = () => USERNAMES[Math.floor(Math.random() * USERNAMES.length)];
const bin8 = (n: number) => n.toString(2).padStart(8, '0');

export function LevelKeygen({ revealed, onReveal }: { revealed?: string; onReveal: (flag: string) => void }) {
  const [user, setUser] = useState(pick);
  const [serial, setSerial] = useState('');
  const [out, setOut] = useState<{ ok: boolean; lines: string[] } | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = serial.trim().toUpperCase();
    if (keygen(user) === s) {
      const flag = decodeFlag('l2');
      setOut({ ok: true, lines: [`Validating serial for user "${user}"...`, 'Serial accepted. Vault level 2 unlocked.', `>> FLAG: ${flag}`] });
      onReveal(flag);
    } else {
      setOut({ ok: false, lines: [`Validating serial for user "${user}"...`, 'Invalid serial.'] });
    }
  };

  // Workbench: shows ASCII + XOR for each char (the learner still does % 26, letter mapping and checksum).
  const rows = useMemo(
    () =>
      Array.from(user, (ch) => {
        const c = ch.charCodeAt(0);
        return { ch, c, x: c ^ XOR_KEY };
      }),
    [user],
  );

  return (
    <div className="space-y-4">
      <Objective
        title="Level 2: Logic Reversal (Keygen)"
        items={[
          'Read the decompiled check_serial() routine below.',
          'Work out, by hand, the serial the binary expects for the target username.',
          `Submit it, just like running: ./${BINARY_NAME} --user ${user} --serial <SERIAL>`,
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <CodeBlock sample={{ language: 'c', filename: 'check_serial.c (decompiled)', code: PSEUDOCODE }} />

        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-[#05070b] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-widest text-mute">ASCII / XOR workbench</span>
              <button className="flex items-center gap-1 text-xs text-mute hover:text-nx-cyan" onClick={() => { setUser(pick()); setSerial(''); setOut(null); }}>
                <Dices className="h-3.5 w-3.5" /> new target
              </button>
            </div>
            <div className="mb-2 font-mono text-sm">
              target user: <span className="font-bold text-nx-cyan">{user}</span>
            </div>
            <table className="w-full font-mono text-[12px]">
              <thead className="text-slate-500">
                <tr>
                  <th className="text-left font-normal">char</th>
                  <th className="text-right font-normal">dec</th>
                  <th className="text-right font-normal">hex</th>
                  <th className="text-right font-normal">bin</th>
                  <th className="text-right font-normal">^0x2A</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="text-slate-300">
                    <td className="text-nx-cyan">'{r.ch}'</td>
                    <td className="text-right">{r.c}</td>
                    <td className="text-right">0x{r.c.toString(16).toUpperCase()}</td>
                    <td className="text-right text-slate-500">{bin8(r.c)}</td>
                    <td className="text-right text-nx-amber">{r.x}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-slate-500">
              0x2A = {bin8(XOR_KEY)}. You still need to apply <code className="text-nx-cyan">% 26</code>, map to a letter, and compute the checksum.
            </p>
          </div>

          <form onSubmit={submit} className="flex gap-2">
            <input className="nx-input" placeholder="e.g. ABCD-42" value={serial} onChange={(e) => setSerial(e.target.value)} spellCheck={false} aria-label="Serial" />
            <button className="nx-btn-primary shrink-0"><Play className="h-4 w-4" /> Run</button>
          </form>
          {out && (
            <div className="rounded-lg border border-line bg-[#04060a] p-3 font-mono text-[12.5px]">
              {out.lines.map((l, i) => (
                <div key={i} className={l.startsWith('>>') ? 'font-bold text-nx-amber' : i === out.lines.length - 1 && !out.ok ? 'text-nx-crimson' : out.ok && i === 1 ? 'text-emerald-400' : 'text-slate-300'}>{l}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Hints
        hints={[
          'Each character becomes one letter: XOR it with 0x2A, take the remainder mod 26, then add it to \'A\' (65).',
          'Worked example for the letter \'A\' (65): 65 ^ 42 = 107 → 107 % 26 = 3 → \'A\' + 3 = \'D\'.',
          'The part after the dash is (sum of the ASCII codes of the username) % 97, zero-padded to 2 digits.',
        ]}
      />
      <FlagSubmit challengeId="crackme-l2" revealed={revealed} />
    </div>
  );
}
