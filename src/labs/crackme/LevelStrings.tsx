import { Terminal } from './Terminal';
import { Hints } from '../shared/Hints';
import { FlagSubmit } from '../shared/FlagSubmit';
import { BINARY_NAME } from './binary';
import type { ShellResult } from './shell';

export function LevelStrings({ revealed, onResult }: { revealed?: string; onResult: (r: ShellResult) => void }) {
  return (
    <div className="space-y-4">
      <Objective
        title="Level 1: Strings Analysis"
        items={[
          'Identify the file type of the target.',
          'Dump printable strings and look for anything a developer forgot to remove.',
          `Run the binary with the licence key you found: ./${BINARY_NAME} --license <KEY>`,
        ]}
      />
      <Terminal onResult={onResult} suggestions={['cat README.txt', `file ${BINARY_NAME}`, `strings ${BINARY_NAME}`, `xxd ${BINARY_NAME} | head -n 8`]} />
      <Hints
        hints={[
          'Developers often leave debug output in release builds. Try filtering the strings output.',
          `strings ${BINARY_NAME} | grep -i license`,
          'One key is a decoy that the binary explicitly rejects. The other is tagged [dbg].',
        ]}
      />
      <FlagSubmit challengeId="crackme-l1" revealed={revealed} />
    </div>
  );
}

export function Objective({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2/50 p-4">
      <h3 className="mb-2 font-mono text-sm font-bold text-white">{title}</h3>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ol>
    </div>
  );
}
