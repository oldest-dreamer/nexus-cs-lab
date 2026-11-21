import type { Module } from '../../types';

const raw = String.raw;

export const reversingModule: Module = {
  id: 'cyber-reversing',
  title: 'Static & Dynamic Reverse Engineering (Ghidra + x64dbg/GDB)',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'cyber-ghidra-static',
      title: 'Static Analysis in Ghidra: CFGs, XREFs & Decompiler Pitfalls',
      summary: 'Navigate an unknown binary by following strings and cross-references, read control-flow graphs, and know when not to trust the decompiler.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 140,
      analogy:
        "A disassembler is a city map; cross-references are the \"who visits this building?\" index at the back. You do not read a city street by street. You find a landmark (an error string), look up every road leading to it (XREFs), and follow the nearest one into the neighbourhood that matters. The decompiler is a tour guide: fast and helpful, but sometimes confidently wrong. The assembly is the actual street.",
      intuition: [
        { title: 'Basic blocks and the CFG', body: "A basic block is a straight run of instructions with one entry and one exit. Conditional jumps split blocks into a control-flow graph (CFG). Ghidra's Function Graph draws it: green/red edges for taken/not-taken, back-edges for loops." },
        { title: 'Pivot from strings via XREFs', body: "Search strings (Window → Defined Strings), find \"Invalid serial\", then Show References To it. The referencing instruction is inside the check function. This is usually faster than starting at the entry point." },
        { title: 'Rename and retype as you learn', body: "Rename `FUN_00401240` to `check_serial` (L), fix its signature (`bool check_serial(char *user, char *serial)`), and retype variables. Ghidra propagates names everywhere, and the decompiler output improves dramatically." },
        { title: 'Decompiler pitfalls', body: "Wrong or missing argument counts when the calling convention guess is off; bool returns shown as ints; stack strings shown as integer constants; unresolved switch jump tables; merged or split variables after optimization; obfuscated or overlapping code. Each produces plausible-looking but wrong C." },
        { title: '"Assembly never lies"', body: "When the decompiler output looks odd, check the listing: which register holds the return value, which flags the jump uses (signed vs unsigned), what the stack adjustment is. The bytes executed are the truth; the C is a hypothesis." },
        { title: 'From pseudocode to keygen', body: "Once check_serial is understood, rewrite its logic in Python. The CrackMe Lab's L2 Logic Reversal tab gives you Ghidra-style pseudocode to reverse into a valid serial." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Static analysis workflow', body: 'Landmark → reference → function → understand → document.', flow: ['Auto-analyse', 'Defined Strings → "Invalid serial"', 'XREF → FUN_00401240', 'Rename/retype, read CFG', 'Verify in listing → write notes'] },
        { kind: 'security', title: 'Scope', body: 'Use these techniques on CrackMes, CTF binaries, your own software, or samples you are authorised to analyse. In the lab below, open the "L2 Logic Reversal" tab.' },
      ],
      code: {
        basic: {
          language: 'text',
          filename: 'check_serial-cfg.txt',
          explanation: 'A control-flow graph as Ghidra would show it, the decompiler output next to it, and the pitfall a careful analyst catches in the listing.',
          code: raw`FUNCTION GRAPH: check_serial  (XREF from main @ 0x4012a8 "Invalid serial")

            +--------------------------------------------+
            | 00401240  push rbp ... (prologue)          |
            | 0040124c  xor  ecx, ecx       ; i = 0      |
            +----------------------+---------------------+
                                   v
            +--------------------------------------------+  <---------+
            | 00401250  movzx eax, byte [rdi+rcx] ; user[i]|            |
            | 00401254  test  al, al                       |            |
            | 00401256  je    00401270   ; end of string   |--+         |
            +----------------------+---------------------+  |         |
                                   v (not taken)            |         |
            +--------------------------------------------+  |         |
            | 00401258  xor   al, 0x2a                     |  |  back-  |
            | 0040125a  ... store, add ecx, 1              |  |  edge   |
            | 0040126b  jmp   00401250                     |--+---------+
            +--------------------------------------------+  |
                                   +------------------------+
                                   v
            +--------------------------------------------+
            | 00401270  ... call strcmp ; test eax,eax    |
            | 0040127a  sete  al         ; return (bool) |
            +--------------------------------------------+

DECOMPILER (before retyping):          WHAT THE LISTING SAYS:
  undefined8 FUN_00401240(long p1)       two args are used: RDI (user) AND RSI (serial,
  {                                      passed to strcmp) -> signature guess missed one.
    ...                                  "sete al" returns a bool in AL only; the upper
    return iVar1 == 0;                   EAX bits are garbage -> callers test AL, not EAX.
  }`,
        },
        production: {
          language: 'py',
          filename: 'xref_strings.py',
          explanation: 'Researcher pattern: a Ghidra script (Script Manager, Python) that lists interesting strings and every function that references them. This is the first thing many analysts run on a new binary.',
          code: raw`# @category NEXUS.Triage
# Lists strings matching keywords and the functions that reference each one.
KEYWORDS = ("license", "serial", "invalid", "expired", "trial", "debug", "password", "key")

listing = currentProgram.getListing()
fm = currentProgram.getFunctionManager()

for data in listing.getDefinedData(True):          # iterate every defined data item
    if not data.hasStringValue():
        continue
    text = str(data.getValue())
    if not any(k in text.lower() for k in KEYWORDS):
        continue
    print("%s  %r" % (data.getAddress(), text[:60]))
    for ref in getReferencesTo(data.getAddress()):  # FlatProgramAPI: who points at this string?
        src = ref.getFromAddress()
        func = fm.getFunctionContaining(src)
        print("      <- %s in %s" % (src, func.getName() if func else "<no function>"))

# Next: double-click each function, rename it (L), fix its signature, read its graph.`,
        },
        bug: {
          explanation:
            'From the analyst\'s side: XOR-"encrypting" an embedded secret only hides it from `strings`. One XREF from the decode routine to the blob, plus a 5-line script, recovers it. The fix removes the secret from the client entirely and verifies with a public key, so static analysis finds nothing worth stealing.',
          buggy: {
            language: 'c',
            filename: 'secret.c',
            code: raw`// ❌ "Obfuscated" secret: recovered in minutes via XREF + XOR
static const unsigned char BLOB[] = { 0x6b, 0x69, 0x7f, 0x07, 0x7a, 0x78, 0x65 };   // "ACU-PRO" ^ 0x2a

static void decode(char *out) {               // XREF from check() -> here -> BLOB
    for (int i = 0; i < 7; i++) out[i] = BLOB[i] ^ 0x2a;
    out[7] = 0;
}

int check(const char *key) {
    char real[8]; decode(real);
    return strcmp(key, real) == 0;             // breakpoint here shows the plaintext too
}`,
          },
          fixed: {
            language: 'c',
            filename: 'secret.c',
            code: raw`// ✅ Nothing secret in the client: verify a signed token with the vendor PUBLIC key
#include <sodium.h>
extern const unsigned char VENDOR_PK[crypto_sign_PUBLICKEYBYTES];

int check(const unsigned char *signed_key, size_t len) {
    unsigned char msg[256]; unsigned long long n;
    if (len > sizeof msg + crypto_sign_BYTES) return 0;
    return crypto_sign_open(msg, &n, signed_key, len, VENDOR_PK) == 0;
}
// Static analysis now reveals only a public key: useful for verification, useless for forging.`,
          },
        },
      },
      takeaways: [
        'Pivot from strings and imports via XREFs instead of reading from the entry point.',
        'Rename and retype aggressively; the decompiler output improves with every fix.',
        'Decompiler output is a hypothesis. Assembly never lies.',
        'Practice drill: in the CrackMe Lab L2 tab, rewrite check_serial as a Python function and compute the serial for the target user before pressing Run.',
      ],
      labId: 'crackme',
      labMode: 'l2',
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-dynamic-debugging',
      title: 'Dynamic Analysis with GDB & x64dbg: Breakpoints, Registers & Live Memory',
      summary: 'Pause a program at the exact instruction you care about, read its registers and memory, and confirm what static analysis only suggested.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 140,
      analogy:
        "Static analysis is reading a recipe. Dynamic analysis is standing in the kitchen with a pause button: you freeze the chef mid-step, look at exactly what is in each bowl (registers, memory), take one step at a time, and even swap an ingredient to see what happens.",
      intuition: [
        { title: 'Software breakpoints are a patched byte', body: "Setting a breakpoint replaces the first byte of an instruction with `0xCC` (INT3). When the CPU executes it, it traps to the debugger, which restores the original byte, rewinds RIP by one and shows you the state. Self-checksumming code can notice these patches." },
        { title: 'Hardware breakpoints and watchpoints', body: "x86 has four debug registers (DR0–DR3) that trigger on execute, write or read of an address without modifying code. `watch *(int*)0x404040` in GDB stops when that memory changes, perfect for finding who writes a flag or counter." },
        { title: 'Stepping', body: "Step into (`stepi` / F7) follows calls; step over (`nexti` / F8) runs a call as one step; `finish` (Ctrl+F9 in x64dbg) runs until the current function returns, with the result in RAX." },
        { title: 'Read arguments at the call', body: "Break on a library function like `strcmp` or `memcmp`. On Linux x86-64 the two arguments are in RDI and RSI: `x/s $rdi`, `x/s $rsi`. In CrackMes this often reveals the expected value directly." },
        { title: 'Change state to test hypotheses', body: "`set $rax = 0` after a check, or flipping ZF, lets you test \"what if this returned success?\" without patching the file. If the program unlocks, you have found the decision point to study (or patch, legally)." },
        { title: 'Isolation still applies', body: "Debugging runs the target. Unknown samples run only inside the isolated VM described in the Safe Malware Lab chapter, never on your host." },
      ],
      callouts: [
        { kind: 'architecture', title: 'What happens on a breakpoint hit', body: 'The debugger sits between the CPU trap and the program.', flow: ['CPU executes 0xCC (INT3)', 'Kernel delivers SIGTRAP / exception', 'Debugger restores byte, RIP -= 1', 'You inspect / modify state', 'Continue'] },
        { kind: 'tip', title: 'x64dbg essentials', body: 'F2 breakpoint, F7 step into, F8 step over, F9 run, Ctrl+G go to address, right-click → Follow in Dump, and the Symbols tab to break on imported APIs like strcmp or IsDebuggerPresent.' },
      ],
      code: {
        basic: {
          language: 'bash',
          filename: 'gdb-session.sh',
          explanation: 'A full GDB session on a lab CrackMe, with the INT3 mechanism and register checks spelled out. Run inside your analysis VM.',
          code: raw`#  SOFTWARE BREAKPOINT ON 0x401270:
#    before:  0x401270: 48 89 c6        mov rsi, rax
#    armed :  0x401270: CC 89 c6        <- first byte replaced by INT3
#    hit   :  trap -> GDB restores 48, RIP = 0x401270, shows prompt
gdb -q ./crackme <<'EOF'
set disassembly-flavor intel
set pagination off
starti --serial AAAA-1111     # stop at the very first instruction (works on stripped/PIE)
info proc mappings            # where .text, heap, stack and libc are mapped
break strcmp                  # library call: args are RDI, RSI (System V)
continue
x/s $rdi                      # what we typed
x/s $rsi                      # what it is compared with   <- the expected value
bt                            # who called strcmp (return addresses into the binary)
finish                        # run to strcmp's return; result in EAX (0 = equal)
p $eax
set $eax = 0                  # hypothesis test: pretend they matched
x/6i $rip                     # see the test/jne that consumes the result
continue
EOF`,
        },
        production: {
          language: 'bash',
          filename: 'trace-compares.gdb',
          explanation: 'Researcher pattern: an unattended GDB command file that logs every string/memory comparison with its arguments, plus the ltrace one-liner equivalent. Ideal for surveying how a CrackMe validates input.',
          code: raw`# usage: gdb -q -batch -x trace-compares.gdb --args ./crackme --serial AAAA-1111
set pagination off
set confirm off

break strcmp
commands
  silent
  printf "strcmp(\"%s\", \"%s\")\n", (char*)$rdi, (char*)$rsi
  continue
end

break memcmp
commands
  silent
  printf "memcmp(%p, %p, %d)\n", $rdi, $rsi, $rdx
  x/16xb $rdi
  x/16xb $rsi
  continue
end

run

# lighter-weight alternative for dynamically linked targets:
#   ltrace -e strcmp+memcmp+strncmp ./crackme --serial AAAA-1111`,
        },
        bug: {
          explanation:
            'If the program computes the correct serial and then compares it with strcmp, the expected value sits in RSI at the breakpoint, so the debugger reveals it instantly. Comparing MACs of the input in constant time, or better verifying a signature, means the correct value never exists in memory. (The branch can still be patched; this defeats keygen-by-debugger, not patching.)',
          buggy: {
            language: 'c',
            filename: 'serial.c',
            code: raw`// ❌ The correct answer is materialised in memory right before the compare
int check_serial(const char *user, const char *serial) {
    char expected[32];
    make_serial(user, expected);           // break on strcmp -> x/s $rsi shows it
    return strcmp(serial, expected) == 0;
}`,
          },
          fixed: {
            language: 'c',
            filename: 'serial.c',
            code: raw`// ✅ Licence = Ed25519 signature over the user name; verify, never generate
#include <sodium.h>
extern const unsigned char VENDOR_PK[crypto_sign_PUBLICKEYBYTES];

int check_serial(const char *user, const unsigned char sig[crypto_sign_BYTES]) {
    return crypto_sign_verify_detached(sig, (const unsigned char *)user, strlen(user), VENDOR_PK) == 0;
}`,
          },
        },
      },
      takeaways: [
        'INT3 (0xCC) software breakpoints patch code; DR0–DR3 hardware breakpoints and watchpoints do not.',
        'At a call: SysV args in RDI/RSI/RDX…, result in RAX after `finish`.',
        'Change registers to test hypotheses before patching anything.',
        'Practice drill: compile a tiny C program that calls strcmp on two strings, then run trace-compares.gdb on it inside a VM and confirm the printed arguments. Then open CrackMe Lab L2.',
      ],
      labId: 'crackme',
      labMode: 'l2',
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-crackme-keygen-vs-patch',
      title: 'Legal CrackMe Workflow: Keygenning vs. Surgical Patching (JNE → JE / NOP)',
      summary: 'The end-to-end professional workflow on an authorised CrackMe: rules, triage, locate the check, then either reimplement the algorithm or patch one branch, and document it.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 150,
      analogy:
        "A locked puzzle box has two honest solutions. Keygenning is understanding the mechanism so well that you can cut a working key for any name. Patching is filing down one pin so the lock no longer checks. The keygen proves deeper understanding; the patch is quicker but changes the box. In a CrackMe, both are allowed and the write-up is the real deliverable.",
      intuition: [
        { title: 'Step 0: rules and scope', body: "Read the CrackMe's rules (e.g. crackmes.one difficulty and \"no patching\" notes). Work in an isolated VM. Keep notes: hashes, tools, every address you touch. Never apply these techniques to commercial software licensing." },
        { title: 'Step 1: triage and locate', body: "file/strings → find \"Invalid serial\" → XREF to the check function → identify its inputs (RDI/RSI) and the branch that consumes its result (`test eax, eax; jne` …)." },
        { title: 'Step 2a: keygen', body: "Translate the check into Python, step by step, verifying intermediate values in a debugger (e.g. watch `expected[i]` fill). A keygen works for any username and survives program updates that only move code around." },
        { title: 'Step 2b: patch', body: "Convert the branch's virtual address to a file offset (VA − ImageBase − section RVA + section raw offset), confirm the original bytes (e.g. `75 08`), and write the new ones to a COPY: `74 08` (invert) or `90 90` (NOP). Record before/after hashes." },
        { title: 'Choosing NOP vs invert', body: "Inverting turns valid input into failure; NOP-ing removes the decision entirely; an unconditional JMP (EB) forces one path. The CrackMe Lab's L3 tab shows all three outcomes with a trial-clock toggle." },
        { title: 'Step 3: verify and write up', body: "Run the patched copy and your keygen inside the VM, then document: algorithm, addresses, bytes changed, why it works, and how the author could harden it (server-side checks, signatures)." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Two paths from one analysis', body: 'Both start with locating and understanding the check.', flow: ['Triage + XREF', 'Understand check()', 'Keygen: reimplement in Python', 'or Patch: VA → offset → 75→74/90 90', 'Verify in VM + write-up'] },
        { kind: 'security', title: 'Legal boundary', body: 'Keygens and patches are only for CrackMes, CTFs and your own software. Distributing cracks or bypassing licensing of commercial products can be illegal. In the lab below, open the "L3 Binary Patching" tab.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'keygen.py',
          explanation: 'A keygen for a practice CrackMe (a different algorithm from the lab, so it does not spoil L2). The decompiled C is in the comment; the Python mirrors it line by line.',
          code: raw`#  DECOMPILED (renamed) from practice_crackme_02:
#
#  bool check(char *name, char *serial) {
#    uint32_t h = 0x1505;                         // seed
#    for (int i = 0; name[i]; i++)
#      h = (h * 33) ^ (uint8_t)name[i];           // djb2-xor variant
#    uint16_t lo = h & 0xFFFF, hi = (h >> 16) ^ 0x5A5A;
#    char buf[16]; sprintf(buf, "%04X-%04X", hi, lo);
#    return strcmp(serial, buf) == 0;
#  }
#
#  MEMORY PICTURE for name="NADIM" (h after each step, 32-bit wrap):
#   seed 0x00001505 -> 'N' ... -> final h -> hi/lo -> "HHHH-LLLL"

def keygen(name: str) -> str:
    h = 0x1505
    for ch in name.encode():
        h = ((h * 33) & 0xFFFFFFFF) ^ ch      # emulate uint32_t wrap-around
    lo = h & 0xFFFF
    hi = (h >> 16) ^ 0x5A5A
    return f"{hi:04X}-{lo:04X}"

for user in ("NADIM", "ADA", "root"):
    print(user, keygen(user))
# verify one result in the debugger: break on strcmp, x/s $rsi must equal keygen(name)`,
        },
        production: {
          language: 'py',
          filename: 'patch_branch.py',
          explanation: 'Researcher pattern: a careful, reproducible patcher. It converts a VA to a file offset with pefile, refuses to patch if the original bytes do not match, writes a COPY, and prints hashes for the write-up.',
          code: raw`# pip install pefile      (authorised CrackMe only; run in your analysis VM)
import hashlib, shutil, sys
import pefile

def patch(path: str, va: int, expected: bytes, new: bytes) -> str:
    assert len(expected) == len(new), "patch must keep the same length"
    pe = pefile.PE(path)
    rva = va - pe.OPTIONAL_HEADER.ImageBase
    off = pe.get_offset_from_rva(rva)                 # handles section RVA -> raw offset
    data = bytearray(open(path, "rb").read())
    if bytes(data[off:off + len(expected)]) != expected:
        sys.exit(f"abort: bytes at {off:#x} are {data[off:off+len(expected)].hex()} not {expected.hex()}")
    out = path.replace(".exe", ".patched.exe")
    shutil.copyfile(path, out)                        # never modify the original sample
    data[off:off + len(new)] = new
    open(out, "wb").write(data)
    print(f"VA {va:#x} -> RVA {rva:#x} -> file offset {off:#x}")
    print("original:", hashlib.sha256(open(path, 'rb').read()).hexdigest())
    print("patched :", hashlib.sha256(data).hexdigest())
    return out

# jne locked (75 08) -> nop nop, exactly as in the CrackMe Lab L3 listing
patch("vault_trial_v1.exe", 0x40100B, bytes.fromhex("7508"), bytes.fromhex("9090"))`,
        },
        bug: {
          explanation:
            'From the author\'s side: a trial that trusts a local timestamp file and one branch is defeated by editing the file or patching the jump. A sturdier design keeps the entitlement decision on a server and uses short-lived signed tokens, so a patched client gets nothing valuable.',
          buggy: {
            language: 'c',
            filename: 'trial.c',
            code: raw`// ❌ Client-side trial: edit trial.dat or patch one JNE and it is unlocked forever
int trial_expired(void) {
    FILE *f = fopen("trial.dat", "rb");      // stores install time in plain text
    long installed = 0;
    if (f) { fscanf(f, "%ld", &installed); fclose(f); }
    return time(NULL) - installed > 30L * 86400;
}
// main: if (trial_expired()) { puts("TRIAL EXPIRED"); return 1; }   <- cmp + jne`,
          },
          fixed: {
            language: 'c',
            filename: 'trial.c',
            code: raw`// ✅ Entitlement checked server-side; client only verifies a short-lived signed token
// token = Ed25519_sign(vendor_sk, {"user":"..","feature":"pro","exp":<unix time + 1 day>})
int has_pro_feature(const unsigned char *token, size_t len, time_t now) {
    unsigned char claims[256]; unsigned long long n;
    if (len > sizeof claims + crypto_sign_BYTES) return 0;
    if (crypto_sign_open(claims, &n, token, len, VENDOR_PK) != 0) return 0;
    return parse_exp(claims, n) > now;        // and the server only serves pro DATA to valid tokens
}
// A patched client can skip this check, but the server still refuses to deliver pro content.`,
          },
        },
      },
      takeaways: [
        'Workflow: rules → isolate → triage → XREF → understand → keygen or patch → verify → write-up.',
        'Keygens prove understanding; patches change one decision (74 invert, 90 90 remove, EB force).',
        'Always patch a copy, verify the original bytes, and record hashes.',
        'Practice drill: solve CrackMe Lab L3 twice, once with JE and once with NOP, toggling the trial clock each time, and explain in your write-up why NOP is the cleaner patch.',
      ],
      labId: 'crackme',
      labMode: 'l3',
    },
  ],
};
