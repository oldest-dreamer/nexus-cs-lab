import type { Module } from '../../types';

const raw = String.raw;

export const memoryModule: Module = {
  id: 'cyber-memory',
  title: 'Memory Safety & Modern Mitigations',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'cyber-stack-overflow',
      title: 'Stack Buffer Overflows: Why Unbounded Writes Are Dangerous',
      summary: 'Why writing past a fixed-size stack buffer corrupts the saved return address, how to detect it with sanitizers, and how to write code where it cannot happen.',
      difficulty: 'Advanced',
      minutes: 22,
      xp: 150,
      analogy:
        "Picture a row of pigeonholes: 16 for a guest's letters, then one holding the manager's note that says \"when you finish here, go back to the lobby.\" A careless clerk keeps stuffing letters in until the guest stops handing them over, spilling past the 16 into the manager's hole. Later the manager reads a note that is no longer the one they wrote. That note is the function's return address, and \"writing past the buffer\" is the whole bug.",
      intuition: [
        { title: 'A fixed buffer has neighbours', body: "In a function with `char buf[16]`, the compiler places buf in the stack frame. Just above it sit the saved frame pointer and the return address that CALL pushed. They are ordinary memory, a known distance from buf." },
        { title: 'Unbounded copies do not know the size', body: "`strcpy(buf, input)` copies bytes until it hits a 0 terminator. It has no idea buf holds only 16 bytes. If input is longer, the extra bytes land on whatever sits above buf. The same applies to `strcat`, `sprintf`, `gets`, and `scanf(\"%s\")`." },
        { title: 'Corruption shows up later, at return', body: "The function keeps running and finishes normally. The damage surfaces at `ret`, when the CPU reads a return address that is no longer valid and faults. A crash at a clean `ret` with a register full of your input bytes is the classic fingerprint of this bug." },
        { title: 'Why it is a security issue, not just a crash', body: "The return address decides where execution continues. A bug that lets attacker-controlled bytes reach it is the starting point for hijacking control flow, which is why this class has mattered for decades and why the mitigations in the next chapter exist." },
        { title: 'Detection is cheap and automatic', body: "AddressSanitizer surrounds stack buffers with poisoned redzones and reports the exact file and line of the overflowing write, with a stack trace. A fuzzer feeds it varied inputs so the bug is found in CI rather than in production." },
        { title: 'Prevention is a habit', body: "Use length-aware APIs (`snprintf`, `strlcpy`, `memcpy` with a checked size), prefer `std::string`/`std::vector` or Rust's bounds-checked slices, and treat every external length as hostile until checked against the destination size." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Stack frame layout (why order matters)', body: 'A buffer and the saved return address live in the same frame; an unbounded write into the buffer moves toward the return address.', flow: ['return address (saved by CALL)', 'saved frame pointer', 'char buf[16]  ← copy destination', 'other locals', 'rsp (top of stack)'] },
        { kind: 'security', title: 'Lab-only', body: 'Compile deliberately vulnerable examples only inside your isolated VM, and only to study detection and fixes. Never test memory-corruption techniques against systems you do not own.' },
      ],
      code: {
        basic: {
          language: 'c',
          filename: 'overflow_demo.c',
          explanation: 'A minimal vulnerable function and the stack picture that explains why an over-long input corrupts the saved return address. Build it in a VM with AddressSanitizer to see the exact report.',
          code: raw`/*  STACK FRAME of greet()   (addresses grow UP; the copy writes UP toward them)
 *
 *  higher addr  +-----------------------------+
 *               | return address (8 bytes)    |  <- read by "ret" at function exit
 *               | saved frame pointer (8)     |
 *               | char buf[16]                |  <- strcpy writes here, upward
 *  lower  addr  +-----------------------------+
 *
 *  strcpy copies until a 0 byte, so an input longer than 16 bytes runs past buf
 *  into the saved frame pointer and then the return address. The function still
 *  finishes; the fault appears at "ret", where the return address is now invalid.
 */
#include <stdio.h>
#include <string.h>

void greet(const char *name) {
    char buf[16];
    strcpy(buf, name);          /* ❌ no length check: the root cause */
    printf("hi %s\n", buf);
}

int main(int argc, char **argv) {
    if (argc > 1) greet(argv[1]);   /* long argv[1] -> overflow */
    return 0;
}
/*  Build WITH detection (lab VM):
 *    clang -g -O1 -fsanitize=address greet.c -o greet_asan
 *    ./greet_asan "$(python3 -c 'print("A"*40)')"
 *    => AddressSanitizer: stack-buffer-overflow ... WRITE of size 41 ... in greet greet.c:13
 */`,
        },
        production: {
          language: 'bash',
          filename: 'find-overflows.sh',
          explanation: 'Defender workflow: build with AddressSanitizer to get the exact faulting write, then fuzz the parser so new overflows are caught automatically in CI.',
          code: raw`#!/usr/bin/env bash
set -euo pipefail

# 1) AddressSanitizer pinpoints the bad write: file, line, and which variable overflowed
clang -g -O1 -fsanitize=address,undefined -fno-omit-frame-pointer parser.c -o parser_asan
./parser_asan ./corpus/*                 # replay known inputs

# 2) libFuzzer explores new inputs automatically; crashes are saved as crash-<hash>
cat > fuzz_target.c <<'EOF'
#include <stdint.h>
#include <stddef.h>
#include <string.h>
int parse_line(const char *s);           /* function under test */

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
    char tmp[4096];
    size_t n = size < sizeof tmp - 1 ? size : sizeof tmp - 1;
    memcpy(tmp, data, n); tmp[n] = 0;     /* the harness itself stays in bounds */
    parse_line(tmp);
    return 0;
}
EOF
clang -g -O1 -fsanitize=fuzzer,address parser.c fuzz_target.c -o fuzz_parser
./fuzz_parser -max_total_time=120 corpus/   # run in CI on every change

# 3) Ship a regression corpus so fixed crashes never come back`,
        },
        bug: {
          explanation:
            'The vulnerable version trusts the input length. The fix measures and bounds every write: snprintf always NUL-terminates and reports the length it wanted, so truncation is detectable, and the destination size is passed in rather than assumed.',
          buggy: {
            language: 'c',
            filename: 'greet.c',
            code: raw`// ❌ Unbounded writes into fixed-size stack buffers
void greet(const char *name) {
    char buf[16];
    strcpy(buf, name);                 // copies until NUL, ignores sizeof buf
    char line[64];
    sprintf(line, "user=%s role=admin", name);  // same problem, different API
    log_line(line);
}`,
          },
          fixed: {
            language: 'c',
            filename: 'greet.c',
            code: raw`// ✅ Bounded writes; truncation is detected, not silent
void greet(const char *name) {
    char buf[16];
    // snprintf writes at most sizeof buf - 1 chars + NUL, and returns what it WANTED to write
    int n = snprintf(buf, sizeof buf, "%s", name);
    if (n < 0 || (size_t)n >= sizeof buf) {
        return log_error("name too long");       // reject rather than overflow
    }
    char line[64];
    snprintf(line, sizeof line, "user=%.32s role=user", name);  // bounded field width too
    log_line(line);
}`,
          },
        },
      },
      takeaways: [
        'A stack buffer and the saved return address share a frame; an unbounded write bridges them.',
        'Use length-aware APIs (snprintf, strlcpy, checked memcpy); treat external lengths as hostile.',
        'AddressSanitizer + fuzzing find these bugs automatically; add a regression corpus.',
        'Practice drill: in a VM, build overflow_demo.c with -fsanitize=address, feed it 40 bytes, and read the exact file:line the report blames. Then rewrite greet() with snprintf.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-format-string',
      title: 'Format-String Bugs: When User Input Becomes the Format',
      summary: 'Why `printf(user_input)` is a vulnerability, how `%x`/`%s`/`%n` misread the stack, and the one-character habit that removes the whole class.',
      difficulty: 'Advanced',
      minutes: 18,
      xp: 120,
      analogy:
        "A format string is a fill-in-the-blanks template: \"Dear ___, your balance is ___.\" printf reads the blanks (%s, %d) and grabs the matching arguments you promised. If you let a stranger write the template itself, they can add blanks you never provided arguments for, so printf reaches for values that were never meant to be printed.",
      intuition: [
        { title: 'printf trusts the format to count arguments', body: "`printf(fmt, a, b)` reads fmt left to right. Each conversion (%d, %s, %x) tells it to fetch the next argument from registers/stack. printf cannot tell how many arguments were actually passed; it believes the format string." },
        { title: 'Input as the format breaks that contract', body: "`printf(user)` means the USER chooses the conversions. If they include `%x %x %x`, printf reads words that are not arguments at all, leaking stack contents such as saved pointers or canary bytes, which undermines other defenses." },
        { title: '%s dereferences, which can crash or leak', body: "`%s` treats the fetched value as a pointer and prints the string there. Pointed at an unmapped address it faults; pointed at a secret it leaks. Either way the program did not choose what gets read." },
        { title: '%n writes, which is the dangerous one', body: "`%n` stores the number of characters printed so far into an argument treated as an int pointer. With input as the format, that becomes a controlled memory write. Most modern libc builds reject or restrict %n (for example FORTIFY_SOURCE), but the correct fix is never to let input be the format." },
        { title: 'The fix is one word', body: "Always pass a constant format and put the data in an argument: `printf(\"%s\", user)`. Now `user` is only ever printed as text; none of its characters are interpreted as conversions." },
        { title: 'Finding them', body: "Compilers warn with `-Wformat -Wformat-security` when the format is not a literal. Static analyzers and code review flag `printf(var)`, `fprintf(f, var)`, `syslog(level, var)`, and logging wrappers that forward a user string as the format." },
      ],
      callouts: [
        { kind: 'architecture', title: 'How a conversion fetches an argument', body: 'Each conversion advances printf to the next promised argument; extra conversions read beyond them.', flow: ['parse format left→right', '%d → read next int arg', '%s → read next ptr, deref', '%n → write count to next ptr', 'no matching arg → reads stack'] },
        { kind: 'security', title: 'Lab-only', body: 'Study format-string behaviour on your own programs in a VM. The goal here is recognising and removing the bug, not weaponising it.' },
      ],
      code: {
        basic: {
          language: 'c',
          filename: 'format_demo.c',
          explanation: 'The difference between a safe and an unsafe call, shown with the argument-fetch model. Compile with -Wformat-security and watch the warning fire on the bad line.',
          code: raw`#include <stdio.h>

/*  printf's mental model for  printf("%s is %d", name, age):
 *    "%s" -> fetch arg1 (name), print the string it points to
 *    "%d" -> fetch arg2 (age),  print as decimal
 *  It counts arguments from the FORMAT, so the format must be trusted.
 */
void log_name(const char *name) {
    printf(name);                 /* ❌ user controls the format: %x leaks, %s may crash */
    printf("\n");
}

void log_name_safe(const char *name) {
    printf("%s\n", name);         /* ✅ name is data; its % signs are printed literally */
}

int main(int argc, char **argv) {
    if (argc > 1) {
        log_name(argv[1]);        /* try argv[1] = "%x %x %x"  -> prints stack words */
        log_name_safe(argv[1]);   /* prints "%x %x %x" verbatim */
    }
}
/*  gcc -O2 -Wformat -Wformat-security format_demo.c
 *    warning: format not a string literal and no format arguments [-Wformat-security]
 */`,
        },
        production: {
          language: 'py',
          filename: 'find_format_bugs.py',
          explanation: 'Reviewer pattern: flag calls where a variable (not a string literal) is used as the format argument of printf-family functions. This is how teams sweep a C codebase quickly.',
          code: raw`import re, pathlib, sys

FUNCS = r"(printf|fprintf|sprintf|snprintf|vprintf|vfprintf|syslog|err|warn)"
# the format argument is the 1st (printf/syslog) or 2nd (fprintf) etc.; a bare identifier there is suspect
BARE_FMT = re.compile(FUNCS + r"\s*\(\s*(?:[A-Za-z_]\w*\s*,\s*)?([A-Za-z_]\w*)\s*[),]")

def scan(root: str):
    for path in pathlib.Path(root).rglob("*.c"):
        for n, line in enumerate(path.read_text(errors="ignore").splitlines(), 1):
            m = BARE_FMT.search(line)
            if m and '"' not in line.split(m.group(2))[0].rsplit("(", 1)[-1]:
                print(f"{path}:{n}: format arg is variable '{m.group(2)}' -> {line.strip()[:100]}")

scan(sys.argv[1] if len(sys.argv) > 1 else "./src")
# also enforce at build time:  CFLAGS += -Wformat -Wformat-security -Werror=format-security`,
        },
        bug: {
          explanation:
            'A logging helper forwards a caller-supplied message straight into the format slot, so any user text containing conversions is interpreted. The fix pins a constant format and passes the message as data.',
          buggy: {
            language: 'c',
            filename: 'logger.c',
            code: raw`// ❌ The message becomes the format string
#include <stdio.h>
void log_event(const char *msg) {
    fprintf(stderr, msg);                 // msg = "%x%x%x" leaks; "%n" may write
}
// caller: log_event(request_header);     // attacker controls request_header`,
          },
          fixed: {
            language: 'c',
            filename: 'logger.c',
            code: raw`// ✅ Constant format; message is strictly data
#include <stdio.h>
void log_event(const char *msg) {
    fprintf(stderr, "%s\n", msg);         // %-signs in msg are printed literally
}`,
          },
        },
      },
      takeaways: [
        'Never pass user input as the format string; pass a constant format and the data as an argument.',
        '%x/%s read beyond the real arguments; %n can write. The fix removes all of them at once.',
        'Enable -Wformat-security (and -Werror=format-security) and review logging wrappers.',
        'Practice drill: grep a C project you own for printf-family calls whose first argument is a variable, and rewrite each as printf("%s", v).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-mitigations',
      title: 'Modern Mitigations: ASLR, DEP/NX, Stack Canaries & PIE',
      summary: 'The four OS/compiler defenses that turn most memory bugs into crashes instead of compromises, how to check they are on, and why you still fix the bug.',
      difficulty: 'Advanced',
      minutes: 22,
      xp: 140,
      analogy:
        "Think of a building's safety systems. NX is making the furniture non-flammable so a spark cannot catch (data pages cannot run as code). ASLR is rearranging every room each night so an intruder cannot memorise the layout. The stack canary is a tripwire that screams if someone climbs over the back fence. PIE is putting the whole building on wheels so even the floor plan moves. None removes the intruder; together they make the break-in far harder.",
      intuition: [
        { title: 'DEP / NX: data pages are not executable', body: "The CPU's NX (No-eXecute) bit marks stack and heap pages non-executable. Bytes an attacker writes into a buffer can no longer run as code, which killed classic 'inject shellcode onto the stack' attacks. Check with `readelf -lW` for a GNU_STACK segment marked RW (no E)." },
        { title: 'Stack canaries: a tripwire before the return address', body: "With `-fstack-protector-strong`, the prologue stores a random value (read from `fs:0x28` on Linux) just below the saved return address; the epilogue checks it before `ret` and calls `__stack_chk_fail` if it changed. A linear overflow must smash the canary first, so it is caught." },
        { title: 'ASLR: addresses are randomized per run', body: "The OS loads the stack, heap and libraries at random base addresses each execution, so an attacker cannot hard-code where anything is. On Linux, `cat /proc/sys/kernel/randomize_va_space` returns 2 when full ASLR is on." },
        { title: 'PIE: randomize the program itself too', body: "A Position-Independent Executable has type DYN and is loaded at a random base, so the program's own code and globals move as well, not just the libraries. Without PIE, the main binary stays at a fixed address and partially defeats ASLR." },
        { title: 'They raise cost, they do not fix bugs', body: "Each mitigation removes a technique, and attackers adapt (information leaks defeat ASLR; reusing existing code sidesteps NX). Defense in depth means an attacker must defeat several at once, but the only real fix is to not have the memory bug." },
        { title: 'Verify, do not assume', body: "Toolchains usually enable these by default, but build flags, old targets and embedded systems often disable them. `checksec` (pwntools) or `hardening-check` reports NX, canary, PIE, RELRO and Fortify for a binary in one line." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Layered defenses on one overflow', body: 'A single linear stack overflow now has to get past several independent checks.', flow: ['Overflow writes upward', 'hits stack canary → __stack_chk_fail', 'NX: written bytes cannot execute', 'ASLR/PIE: targets are unknown', 'net effect: crash, not control'] },
        { kind: 'tip', title: 'Recommended build flags (Linux/Clang/GCC)', body: '-fstack-protector-strong -D_FORTIFY_SOURCE=2 -fPIE -pie -Wl,-z,relro,-z,now, plus -fstack-clash-protection and -fcf-protection on supported targets.' },
      ],
      code: {
        basic: {
          language: 'bash',
          filename: 'check-mitigations.sh',
          explanation: 'How to confirm each mitigation is actually enabled, for the running system and for a specific binary. Run inside your VM.',
          code: raw`#  SYSTEM-WIDE
cat /proc/sys/kernel/randomize_va_space      # 2 = full ASLR (stack, heap, mmap, PIE base)

#  PER-BINARY (pick one)
checksec --file=./app                         # pwntools: RELRO, Canary, NX, PIE, FORTIFY
hardening-check ./app                         # devscripts equivalent

#  MANUAL, with standard tools
readelf -lW ./app | grep GNU_STACK            # want "RW " (no E) -> NX stack
readelf -hW ./app | grep Type                 # "DYN" = PIE, "EXEC" = not PIE
readelf -sW ./app | grep -q __stack_chk_fail && echo "canary: yes" || echo "canary: no"
readelf -dW ./app | grep -E 'BIND_NOW|FLAGS'  # "BIND_NOW" + relro = Full RELRO (GOT read-only)

#  Observe ASLR moving the stack between runs:
for i in 1 2 3; do cat /proc/self/maps | awk '/\[stack\]/{print $1}'; done`,
        },
        production: {
          language: 'py',
          filename: 'audit_mitigations.py',
          explanation: 'Fleet/CI pattern: read ELF headers with pyelftools and report which hardening features each binary is missing, so builds that regress on security flags fail the pipeline.',
          code: raw`# pip install pyelftools
import sys
from elftools.elf.elffile import ELFFile
from elftools.elf.dynamic import DynamicSection
from elftools.elf.sections import SymbolTableSection

def audit(path: str) -> dict:
    with open(path, "rb") as f:
        elf = ELFFile(f)
        pie = elf.header.e_type == "ET_DYN"
        nx = all(seg["p_type"] != "PT_GNU_STACK" or not (seg["p_flags"] & 0x1)   # X bit clear
                 for seg in elf.iter_segments())
        names = set()
        for sec in elf.iter_sections():
            if isinstance(sec, SymbolTableSection):
                names.update(s.name for s in sec.iter_symbols())
        canary = "__stack_chk_fail" in names
        fortify = any(n.endswith("_chk") for n in names)      # memcpy_chk, sprintf_chk, ...
        now = False
        for sec in elf.iter_sections():
            if isinstance(sec, DynamicSection):
                flags = [t.entry.d_val for t in sec.iter_tags() if t.entry.d_tag == "DT_FLAGS_1"]
                now = any(v & 0x1 for v in flags)              # DF_1_NOW -> Full RELRO
        return {"pie": pie, "nx": nx, "canary": canary, "fortify": fortify, "relro_now": now}

res = audit(sys.argv[1])
missing = [k for k, v in res.items() if not v]
print(sys.argv[1], res)
if missing:
    print("MISSING:", ", ".join(missing))
    sys.exit(1)        # fail CI if any hardening feature is off`,
        },
        bug: {
          explanation:
            'A build script silently strips the defenses (old habit, "it was slower", copied flags). The fix restores the standard hardening set so the same source compiles into a far more resilient binary, without changing a line of code.',
          buggy: {
            language: 'bash',
            filename: 'build.sh',
            code: raw`# ❌ Hardening disabled: every memory bug becomes much easier to exploit
gcc -O2 \
    -fno-stack-protector \      # no canary
    -z execstack \              # executable stack (NX off for the stack)
    -no-pie \                   # fixed load address (weakens ASLR)
    app.c -o app`,
          },
          fixed: {
            language: 'bash',
            filename: 'build.sh',
            code: raw`# ✅ Standard hardening set (same source, hardened binary)
gcc -O2 \
    -fstack-protector-strong \        # canary before the return address
    -D_FORTIFY_SOURCE=2 \             # bounds-checked libc wrappers (*_chk)
    -fPIE -pie \                      # position-independent -> full ASLR
    -fstack-clash-protection \        # probe large stack allocations
    -fcf-protection=full \            # control-flow enforcement (CET) where supported
    -Wl,-z,relro,-z,now \             # Full RELRO: GOT mapped read-only after startup
    -Wl,-z,noexecstack \              # non-executable stack
    app.c -o app
# verify:  checksec --file=./app`,
          },
        },
      },
      takeaways: [
        'NX stops written data from executing; canaries catch linear stack overwrites; ASLR+PIE hide addresses.',
        'Mitigations raise attacker cost but are not a substitute for fixing the memory bug.',
        'Verify they are on with checksec / readelf, and fail CI when a build regresses.',
        'Practice drill: compile overflow_demo.c once with -fno-stack-protector -z execstack and once with the hardened flags, run checksec on both, and list which protections changed.',
      ],
    },
  ],
};
