import type { Module } from '../../types';

const raw = String.raw;

export const antiAnalysisModule: Module = {
  id: 'cyber-antianalysis',
  title: 'Anti-Analysis, Packing & Safe Lab Setup',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'cyber-safe-lab',
      title: 'The Isolated Analysis Lab: Non-Negotiable Rules',
      summary: 'Before any sample runs, the rules that keep analysis from becoming an incident: isolation, snapshots, no network, and careful handling.',
      difficulty: 'Advanced',
      minutes: 16,
      xp: 110,
      analogy:
        "A microbiology lab does not study a dangerous culture on the lunch table. It uses a sealed glovebox, a fresh petri dish each time, an airlock, and a decontamination step on the way out. A malware analysis lab is the same idea in software: a sealed VM, a clean snapshot per sample, no open door to the network, and a careful way to carry samples in and results out.",
      intuition: [
        { title: 'Why running a sample is different from reading it', body: "Static triage (file, strings, headers) never executes code and is low-risk. The moment you run a sample, it can touch the filesystem, the network, other processes, and any shared folder. Everything below is about containing that moment." },
        { title: 'Isolation: a disposable VM, not your host', body: "Use a dedicated analysis VM with no access to your real files or credentials. Prefer a hypervisor with strong guest/host separation; disable shared clipboard, drag-and-drop and shared folders while a sample is live. The host must never be the place a sample runs." },
        { title: 'Snapshots: a clean slate every time', body: "Take a snapshot of the pristine VM. Analyze one sample, then revert to the snapshot before the next. This removes persistence the sample may have installed and guarantees every analysis starts identical and reproducible." },
        { title: 'No network by default', body: "Set the VM to host-only or an isolated internal network, not NAT or bridged. To study network behaviour, point the sample at a fake-services box (INetSim or FakeNet-NG) on that isolated segment, so DNS, HTTP and more are answered without reaching the real internet." },
        { title: 'Handle samples so they cannot run by accident', body: "Keep samples in password-protected, non-executable archives; many teams rename to defang (file.exe → file.exe.bin, hxxp:// for URLs). Track a SHA-256 for every sample. Never double-click an unknown file." },
        { title: 'Decontaminate on the way out', body: "Carry out only text: notes, hashes, indicators, screenshots. Do not copy the live sample to your host. When done, revert the snapshot. Treat the analysis network as contaminated until reverted." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Lab topology', body: 'The analysis VM can reach only a fake-services box, never the host or the internet.', flow: ['Host (clean, no samples run here)', 'Hypervisor isolation boundary', 'Analysis VM (snapshotted)', 'Host-only / internal network', 'INetSim / FakeNet (fake DNS/HTTP)'] },
        { kind: 'security', title: 'This is the prerequisite for the whole module', body: 'Everything about packers, obfuscation and anti-debugging below assumes you are in this lab. Analyze only samples you are authorised to handle, and never on a machine that matters.' },
      ],
      code: {
        basic: {
          language: 'text',
          filename: 'lab-checklist.md',
          explanation: 'A pre-flight checklist to run before executing any sample. Treat a failed line as a stop sign.',
          code: raw`# ANALYSIS PRE-FLIGHT CHECKLIST  (all boxes required before RUNNING a sample)
# Static triage (file/strings/headers) is fine without this; EXECUTION is not.
# A failed line is a stop sign: fix it before the sample ever runs.

[ ] Dedicated analysis VM, not my host, not a work machine
[ ] Current snapshot named "clean-base" exists and VM is reverted to it
[ ] Network set to HOST-ONLY or isolated internal segment (NOT NAT/bridged)
[ ] Shared folders OFF, shared clipboard OFF, drag-and-drop OFF
[ ] Fake services ready if needed (INetSim / FakeNet-NG) on the isolated net
[ ] Sample stored in a password-protected archive; SHA-256 recorded in notes
[ ] I am authorised to analyze this sample
[ ] Only text (notes, hashes, IOCs, screenshots) will leave the VM

POST-ANALYSIS
[ ] Exported findings as text only; no live sample copied to host
[ ] Reverted VM to "clean-base"
[ ] Logged sample hash + verdict in case notes`,
        },
        production: {
          language: 'bash',
          filename: 'snapshot-workflow.sh',
          explanation: 'Automation pattern on the analyst workstation (host side): snapshot, note the sample, and revert, so each run is clean and reproducible. Uses libvirt as an example.',
          code: raw`#!/usr/bin/env bash
# Runs on the HOST to manage the analysis guest. The sample NEVER runs on the host.
set -euo pipefail
VM="analysis-win10"
SAMPLE="$1"

sha=$(sha256sum "$SAMPLE" | cut -d' ' -f1)
echo "$(date -Is)  start  $sha  $(basename "$SAMPLE")" >> ~/lab/case-log.txt

# 1) ensure the isolated network has no route to the host or the internet
virsh net-info analysis-isolated >/dev/null || { echo "isolated net missing"; exit 1; }

# 2) revert to the pristine snapshot before this sample
virsh snapshot-revert "$VM" clean-base --running

# 3) copy the (still archived) sample in via a one-shot transfer disk, then detach
#    (left to the analyst UI; never auto-extract or auto-run)

echo "VM reverted to clean-base. Analyze '$sha' inside the guest, then run:"
echo "  virsh snapshot-revert $VM clean-base   # decontaminate when finished"`,
        },
        bug: {
          explanation:
            'The unsafe setup runs a sample with a shared folder and a bridged network, so anything it does can reach real files and the real network. The safe setup isolates the network and removes the shared path, so execution stays contained.',
          buggy: {
            language: 'bash',
            filename: 'unsafe-setup.sh',
            code: raw`# ❌ Sample can reach your files and the internet
VBoxManage sharedfolder add "analysis" --name host --hostpath "$HOME"   # whole home visible
VBoxManage modifyvm "analysis" --nic1 bridged --bridgeadapter1 eth0     # real network access
VBoxManage startvm "analysis"
# then double-clicking the sample inside can encrypt $HOME and phone home`,
          },
          fixed: {
            language: 'bash',
            filename: 'safe-setup.sh',
            code: raw`# ✅ Isolated, snapshotted, no host path
VBoxManage sharedfolder remove "analysis" --name host 2>/dev/null || true
VBoxManage modifyvm "analysis" --nic1 intnet --intnet1 "lab-isolated"   # internal net only
VBoxManage snapshot "analysis" take clean-base --live 2>/dev/null || true
VBoxManage snapshot "analysis" restore clean-base                       # start pristine
VBoxManage startvm "analysis"
# point samples at INetSim on the lab-isolated network to study behaviour safely`,
          },
        },
      },
      takeaways: [
        'Static triage is low-risk; executing a sample is the moment that needs containment.',
        'Isolated VM + per-sample snapshot revert + host-only/fake network + defanged handling.',
        'Carry out only text; never copy a live sample to your host; record every hash.',
        'Practice drill: write your own pre-flight checklist and set a VM to host-only networking, then confirm from inside it that you cannot reach the internet or the host.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-packers',
      title: 'Recognizing Packers & String Encryption (UPX and Beyond)',
      summary: 'How to tell a packed binary from a normal one using entropy, sections and imports, and how to get to the real code safely.',
      difficulty: 'Advanced',
      minutes: 20,
      xp: 130,
      analogy:
        "A packed binary is a flat-pack parcel: on the shelf it is a dense, taped box with almost no label (high entropy, few imports). It only becomes furniture after a small assembly routine unfolds it in memory. Recognising a packer is noticing the parcel; unpacking is letting the assembly routine finish, then photographing the furniture.",
      intuition: [
        { title: 'What a packer does', body: "A packer compresses or encrypts the original code and data, and prepends a small stub. At runtime the stub decompresses the real code into memory and jumps to the original entry point (OEP). On disk you see the stub and a blob; the real program only exists after unpacking runs." },
        { title: 'Entropy is the first tell', body: "Compressed or encrypted data looks random, so its Shannon entropy approaches 8.0 bits/byte. A normal code section is around 6; a packed section is often 7.5–8.0. A tool like Detect It Easy or a few lines of Python flags this instantly." },
        { title: 'Section and import anomalies', body: "UPX renames sections to UPX0 (empty on disk, large in memory) and UPX1 (the packed blob). Many packers leave a tiny import table (often just LoadLibraryA and GetProcAddress, which the stub uses to rebuild the real imports) and an entry point outside the first section." },
        { title: 'Known vs custom packers', body: "UPX is a legitimate, reversible compressor: `upx -d file.exe` restores the original, and detection tools name it outright. Custom or modified packers do not unpack with a switch and usually require dynamic unpacking." },
        { title: 'Dynamic unpacking, conceptually', body: "In the lab VM, run under a debugger and let the stub do its work; set a breakpoint where execution transfers to the unpacked code (the tail jump to the OEP), then dump the now-decrypted process memory and fix up the import table. Tools like x64dbg with Scylla, or unipacker, automate much of this." },
        { title: 'Then analyze normally', body: "Once unpacked, the binary is an ordinary PE/ELF: triage, strings, XREFs and the decompiler all work again. Packing only delays analysis; it does not prevent it." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Execution of a packed binary', body: 'The real code exists only after the stub decompresses it in memory.', flow: ['Loader runs the stub', 'Stub decompresses/decrypts blob', 'Rebuilds import table (IAT)', 'Tail jump to OEP', 'Original program runs'] },
        { kind: 'tip', title: 'Quick signals of packing', body: 'Entropy > 7.2 over most of the file, 1–3 imports only, section names like UPX0/UPX1/.petite, raw size far smaller than virtual size, and an entry point not in .text.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'detect_packing.py',
          explanation: 'A small packing detector: per-section entropy, import count, and UPX markers, exactly the signals an analyst checks first.',
          code: raw`# pip install pefile
import math, sys
from collections import Counter
import pefile

def entropy(b: bytes) -> float:
    if not b: return 0.0
    n = len(b)
    return -sum(c / n * math.log2(c / n) for c in Counter(b).values())

pe = pefile.PE(sys.argv[1])
ep = pe.OPTIONAL_HEADER.AddressOfEntryPoint
imports = sum(len(d.imports) for d in getattr(pe, "DIRECTORY_ENTRY_IMPORT", []))

print(f"imports: {imports}  (packed stubs often have < 5)")
ep_section = None
for s in pe.sections:
    name = s.Name.rstrip(b"\x00").decode(errors="replace")
    h = entropy(s.get_data())
    vsize, rsize = s.Misc_VirtualSize, s.SizeOfRawData
    note = []
    if h > 7.2: note.append("HIGH-ENTROPY")
    if name.upper().startswith("UPX"): note.append("UPX-marker")
    if rsize == 0 and vsize > 0: note.append("empty-on-disk")
    if s.VirtualAddress <= ep < s.VirtualAddress + max(vsize, rsize): ep_section = name
    print(f"  {name:8} H={h:.2f}  vsize={vsize:#8x} rsize={rsize:#8x}  {' '.join(note)}")

print(f"entry point in section: {ep_section}  (normal = .text/CODE; packed often = last section)")
# UPX specifically: 'upx -d sample.exe' restores the original if it is stock UPX`,
        },
        production: {
          language: 'bash',
          filename: 'unpack-workflow.sh',
          explanation: 'The analyst workflow for a suspected packer, inside the lab VM: identify, try the easy reversible case, and otherwise unpack dynamically.',
          code: raw`#!/usr/bin/env bash
# RUN INSIDE THE ISOLATED ANALYSIS VM ONLY
set -euo pipefail
f="$1"

# 1) identify the packer
die ./"$f"              # Detect It Easy CLI: names UPX / ASPack / Themida / etc.
python3 detect_packing.py "$f"

# 2) stock UPX is reversible with a switch (no execution needed)
if upx -t "$f" 2>/dev/null; then
    cp "$f" "$f.packed"
    upx -d "$f" -o "$f.unpacked"      # restores the original binary
    echo "unpacked statically -> $f.unpacked"
    exit 0
fi

# 3) custom packer: dynamic unpacking under a debugger
#    - open in x64dbg, run until the tail jump to the OEP (high-entropy section -> .text)
#    - dump the process with the Scylla plugin, then fix the IAT
#    - OR try: unipacker "$f"   (automated for several known packers)
echo "custom packer: unpack dynamically in x64dbg (Scylla) or try 'unipacker'"`,
        },
        bug: {
          explanation:
            'From the defender side, treating "packed = malicious" or "unpacked with upx -d = safe" are both mistakes. The sound approach scores multiple signals and still analyzes behaviour, because packers are used by benign software too and custom packers will not unpack with a switch.',
          buggy: {
            language: 'py',
            filename: 'triage.py',
            code: raw`# ❌ Naive verdicts
def verdict(path):
    if is_upx(path):
        run_upx_d(path)          # assumes stock UPX; custom UPX-like packers corrupt or no-op
        return "unpacked, safe"  # packing says nothing about intent
    return "not packed, safe"    # high entropy alone is not a verdict either`,
          },
          fixed: {
            language: 'py',
            filename: 'triage.py',
            code: raw`# ✅ Score signals; packing is a lead, not a conclusion
def triage(path):
    signals = {
        "high_entropy": mean_section_entropy(path) > 7.2,
        "few_imports": import_count(path) < 5,
        "packer_named": detect_it_easy(path),     # may be None
        "ep_last_section": entry_in_last_section(path),
    }
    packed = sum(bool(v) for v in signals.values()) >= 2
    # unpack (statically if stock UPX, else dynamically in the VM), THEN analyze behaviour
    return {"packed": packed, "signals": signals, "next": "unpack + behavioural analysis"}`,
          },
        },
      },
      takeaways: [
        'Packing signals: high entropy, very few imports, odd section names, entry point outside .text.',
        'Stock UPX reverses with `upx -d`; custom packers need dynamic unpacking in the VM.',
        'Packing is a lead, not a verdict; benign software packs too. Always analyze after unpacking.',
        'Practice drill: pack a harmless "hello world" you built with UPX, run detect_packing.py on it before and after `upx -d`, and compare the entropy and import count.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-obfuscation-antidebug',
      title: 'Obfuscation & Anti-Debugging: Recognition and Defeat',
      summary: 'Control-flow flattening, opaque predicates, and anti-debug checks like IsDebuggerPresent and timing, and how analysts recognise and get past them.',
      difficulty: 'Advanced',
      minutes: 22,
      xp: 150,
      analogy:
        "Obfuscation is giving someone directions as \"turn where the bakery used to be, then go the way you would NOT expect\" — technically correct, deliberately confusing. Anti-debugging is a shop that behaves differently when it notices an inspector is watching: it hides the interesting stock until the inspector leaves. The analyst's job is to recognise both tricks and keep reading anyway.",
      intuition: [
        { title: 'Control-flow flattening', body: "Instead of normal nested blocks, the code becomes one big switch driven by a state variable: every original block sets the next state and jumps back to a central dispatcher. The CFG looks like a fan of blocks around one hub. Recognise the hub-and-spokes shape; recover order by tracking the state values." },
        { title: 'Opaque predicates', body: "A condition that always evaluates the same way but is hard to prove statically, like `if ((x*x + x) % 2 == 0)` (always true, since x²+x is always even). It adds dead branches to confuse readers and tools. Once you prove the invariant, you can ignore the dead path." },
        { title: 'Junk and instruction substitution', body: "Dead code, do-nothing arithmetic, and replacing simple ops with convoluted equivalents (a + b written as (a ^ b) + 2*(a & b)) pad the listing. Compilers' own optimizers, or deobfuscation plugins, can often simplify these back." },
        { title: 'Anti-debug: direct checks', body: "On Windows, IsDebuggerPresent reads the PEB BeingDebugged flag; CheckRemoteDebuggerPresent and NtQueryInformationProcess query the kernel. On Linux, a process checks whether it can ptrace itself, or reads TracerPid in /proc/self/status. If a debugger is detected, the program may exit or behave benignly." },
        { title: 'Anti-debug: timing and traps', body: "Breakpoints and single-stepping slow execution, so code times a region with rdtsc or QueryPerformanceCounter and bails if it took too long. Some code also scans itself for 0xCC breakpoint bytes (self-checksumming)." },
        { title: 'Defeating it', body: "Use hardware breakpoints (no 0xCC), patch the checks (force IsDebuggerPresent to return 0, or set BeingDebugged to 0), use anti-anti-debug plugins (ScyllaHide, TitanHide), or sidestep execution entirely with static analysis. For timing, patch the comparison or use an emulator. The point is to recognise the pattern, then choose a bypass." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Control-flow flattening shape', body: 'Normal nesting becomes a dispatcher loop; the state variable encodes the real order.', flow: ['dispatcher: switch(state)', 'block A → state = 3', 'back to dispatcher', 'block (state 3) → state = 7', 'back to dispatcher …'] },
        { kind: 'security', title: 'Lab-only, authorised targets', body: 'Study these on CrackMes, CTF challenges, obfuscation test-benches, or samples you are authorised to analyze, inside the isolated VM. The goal is understanding and defense, not building evasive software.' },
      ],
      code: {
        basic: {
          language: 'c',
          filename: 'antidebug_checks.c',
          explanation: 'The common anti-debug checks shown as a defender would catalogue them, with what each one actually reads so you can recognise it in a disassembler.',
          code: raw`/*  RECOGNITION GUIDE: where each check gets its answer
 *  IsDebuggerPresent      -> reads PEB->BeingDebugged (fs:[0x30]+2 on x86)
 *  CheckRemoteDebugger... -> kernel query via NtQueryInformationProcess
 *  NtQueryInformationProcess(ProcessDebugPort) -> non-zero if a debugger is attached
 *  Linux ptrace(PTRACE_TRACEME) -> fails with EPERM if already being traced
 *  /proc/self/status TracerPid -> non-zero PID means a tracer is attached
 *  rdtsc delta            -> large gap suggests single-stepping/breakpoints
 */
#include <windows.h>
#include <intrin.h>

int being_analyzed(void) {
    if (IsDebuggerPresent()) return 1;                 // patch target #1

    BOOL remote = FALSE;
    CheckRemoteDebuggerPresent(GetCurrentProcess(), &remote);
    if (remote) return 1;                              // patch target #2

    unsigned long long t0 = __rdtsc();
    for (volatile int i = 0; i < 1000; i++) { }        // tiny timed region
    unsigned long long t1 = __rdtsc();
    if (t1 - t0 > 500000ULL) return 1;                 // single-stepping is slow -> patch the cmp

    return 0;
}
/*  An analyst neutralises these by: hardware breakpoints (no 0xCC),
 *  ScyllaHide/TitanHide to spoof the checks, or patching each "return 1" branch. */`,
        },
        production: {
          language: 'py',
          filename: 'find_antidebug.py',
          explanation: 'Reviewer/analyst pattern: scan a binary for imports and instructions associated with anti-debugging, so you know what to expect before you start debugging.',
          code: raw`# pip install capstone pefile
import sys, pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_64

ANTIDBG_IMPORTS = {
    "IsDebuggerPresent", "CheckRemoteDebuggerPresent", "NtQueryInformationProcess",
    "OutputDebugStringA", "GetTickCount", "QueryPerformanceCounter", "NtSetInformationThread",
}

def scan(path):
    pe = pefile.PE(path)
    for d in getattr(pe, "DIRECTORY_ENTRY_IMPORT", []):
        for imp in d.imports:
            if imp.name and imp.name.decode() in ANTIDBG_IMPORTS:
                print(f"[import] {imp.name.decode()}  (anti-debug candidate)")

    # also look for rdtsc / int3-scan / PEB access in the code sections
    md = Cs(CS_ARCH_X86, CS_MODE_64)
    for s in pe.sections:
        if not (s.Characteristics & 0x20000000):     # executable only
            continue
        base = pe.OPTIONAL_HEADER.ImageBase + s.VirtualAddress
        for ins in md.disasm(s.get_data(), base):
            if ins.mnemonic == "rdtsc":
                print(f"[code] {ins.address:#x} rdtsc  (timing check candidate)")
            if ins.mnemonic == "mov" and "fs:" in ins.op_str and "0x30" in ins.op_str:
                print(f"[code] {ins.address:#x} {ins.mnemonic} {ins.op_str}  (PEB access)")

scan(sys.argv[1])
# Then: set hardware breakpoints past these checks, or load ScyllaHide, before dynamic analysis.`,
        },
        bug: {
          explanation:
            'From the software-author side, anti-debugging is sometimes sold as copy protection, but it only inconveniences analysts and often breaks on real customers\' machines (AV conflicts, false positives). The sounder approach keeps the valuable logic server-side, so there is nothing worth debugging on the client.',
          buggy: {
            language: 'c',
            filename: 'protect.c',
            code: raw`// ❌ Client-side anti-debug as "protection": bypassed by any serious analyst,
//    and prone to crashing on legitimate users' machines
int main(void) {
    if (IsDebuggerPresent()) {
        exit(0);                       // patched to a nop/return in minutes
    }
    run_premium_features_locally();    // the thing worth protecting is still on the client
}`,
          },
          fixed: {
            language: 'c',
            filename: 'protect.c',
            code: raw`// ✅ Nothing valuable to debug on the client: the server gates the feature + data
int main(void) {
    token_t t = login_and_get_token();            // short-lived, signed by the server
    // premium content/logic is fetched from the server, which verifies entitlement
    content_t *c = fetch_premium_content(t);       // server returns nothing without a valid token
    if (c) render(c);
    // A debugged or patched client simply receives no premium data.
}`,
          },
        },
      },
      takeaways: [
        'Flattening = dispatcher + state variable; opaque predicates add provably-dead branches.',
        'Anti-debug reads PEB/TracerPid, queries the kernel, or times a region; recognise the source.',
        'Defeat with hardware breakpoints, anti-anti-debug tools, patching the check, or pure static analysis.',
        'Practice drill: run find_antidebug.py on a CrackMe that advertises anti-debugging, list the checks it uses, and plan one bypass per check before you open a debugger.',
      ],
    },
  ],
};
