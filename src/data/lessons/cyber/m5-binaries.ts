import type { Module } from '../../types';

const raw = String.raw;

export const binariesModule: Module = {
  id: 'cyber-re',
  title: 'Binary Formats & Static Triage (PE & ELF)',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'cyber-pe-elf-formats',
      title: 'Inside PE & ELF: Headers, Sections, Imports, Exports & Symbols',
      summary: 'How Windows and Linux executables are laid out on disk and in memory, and what each structure tells an analyst before any code is read.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "An executable is a shipping container with a manifest stapled to the door. The headers are the manifest: what kind of cargo, where each crate goes when unloaded, which outside suppliers it depends on (imports), and what it offers to others (exports). Reading the manifest tells you a lot about the cargo before you open a single crate.",
      intuition: [
        { title: 'Magic bytes identify the format', body: "PE (Windows) starts with `MZ` (4D 5A); the DWORD at offset 0x3C (e_lfanew) points to the `PE\\0\\0` signature, then the COFF header and Optional Header. ELF (Linux) starts with `7F 45 4C 46` (\\x7fELF), then class (32/64-bit), endianness, type (EXEC, DYN for PIE/shared libs) and entry point." },
        { title: 'Sections group bytes by purpose', body: "`.text` = executable code (R-X). `.rodata` (ELF) / `.rdata` (PE) = constants and string literals (R--). `.data` = initialised globals (RW-). `.bss` = zero-initialised globals (no bytes on disk). PE adds `.rsrc` (icons, manifests, embedded files) and `.reloc` (relocations)." },
        { title: 'Disk layout ≠ memory layout', body: "The loader maps sections to virtual addresses. PE section headers give both VirtualAddress (RVA) and PointerToRawData (file offset); ELF has section headers for linking and program headers (segments) for loading. Converting VA ↔ file offset is the first step of any patch." },
        { title: 'Imports reveal capabilities', body: "PE imports live in the Import Directory and the IAT (Import Address Table) the loader fills in. ELF uses `.dynsym` plus PLT/GOT stubs resolved by ld.so. `CreateRemoteThread`, `VirtualAllocEx`, `WinHttpOpen` or `socket`/`connect` tell you a lot before any disassembly." },
        { title: 'Exports and symbols', body: "DLLs and shared objects export functions by name/ordinal. Debug and symbol tables (`.symtab`, PDB files) name every function; release builds are usually stripped, leaving only dynamic symbols. Unstripped binaries are a gift." },
        { title: 'Anomalies are signals', body: "A section that is both writable and executable, very high entropy, a tiny import table with only `LoadLibraryA`/`GetProcAddress`, or an entry point outside `.text` are classic signs of packing or self-modifying code (see the Anti-Analysis module)." },
      ],
      callouts: [
        { kind: 'architecture', title: 'From file to running process', body: 'The loader reads headers, maps segments, resolves imports, applies relocations, then jumps to the entry point.', flow: ['Read headers (MZ/PE or ELF)', 'Map sections / segments', 'Resolve imports (IAT / GOT)', 'Apply relocations (ASLR)', 'Jump to entry point'] },
        { kind: 'tip', title: 'Tools of the trade', body: 'Linux: readelf, objdump, nm, pyelftools. Windows: PE-bear, CFF Explorer, dumpbin, pefile. Cross-platform: Detect It Easy, rabin2, LIEF.' },
      ],
      code: {
        basic: {
          language: 'text',
          filename: 'pe-vs-elf-layout.txt',
          explanation: 'Side-by-side on-disk layouts with the exact bytes and offsets an analyst checks first.',
          code: raw`PE (Windows .exe/.dll)                         ELF (Linux executable / .so)
+----------------------------------+          +----------------------------------+
| 0x00  DOS header  "MZ" 4D 5A     |          | 0x00  e_ident 7F 45 4C 46 ("\x7fELF")
| 0x3C  e_lfanew -> PE header      |          |       class=02 (64-bit) data=01 (LE)
+----------------------------------+          | 0x10  e_type: 02 EXEC / 03 DYN(PIE)
| "PE\0\0" 50 45 00 00             |          | 0x18  e_entry: entry point VA
| COFF: Machine 0x8664 (x64),      |          | 0x20  e_phoff -> program headers
|       NumberOfSections, TimeStamp|          | 0x28  e_shoff -> section headers
| Optional hdr: Magic 0x20B (PE32+)|          +----------------------------------+
|   AddressOfEntryPoint (RVA)      |          | Program headers (segments, for the LOADER)
|   ImageBase, DllCharacteristics  |          |   LOAD R-X  -> .text .plt .rodata
|   DataDirectories: Import, Export|          |   LOAD RW-  -> .data .bss .got
|   Reloc, TLS, Debug ...          |          |   GNU_STACK (RW- = NX stack)
+----------------------------------+          +----------------------------------+
| Section table                    |          | .text    code                    |
|  .text   R-X  code               |          | .rodata  string literals         |
|  .rdata  R--  consts, IAT, strs  |          | .data    initialised globals     |
|  .data   RW-  globals            |          | .bss     zeroed globals (no bytes)|
|  .rsrc   R--  icons, resources   |          | .dynsym/.dynstr  dynamic symbols |
|  .reloc  R--  relocations        |          | .plt/.got  import stubs + table  |
+----------------------------------+          | .symtab  full symbols (if not stripped)
                                               | Section headers (for the LINKER) |
                                               +----------------------------------+
VA -> file offset (PE):  offset = (VA - ImageBase) - section.VirtualAddress + section.PointerToRawData`,
        },
        production: {
          language: 'py',
          filename: 'headers.py',
          explanation: 'Researcher pattern: one script that summarises either format (sections with permissions and entropy, imports, exports, symbols) using pefile and pyelftools. Run it inside your analysis VM.',
          code: raw`# pip install pefile pyelftools
import math, sys
from collections import Counter

def entropy(data: bytes) -> float:
    if not data: return 0.0
    n = len(data)
    return -sum(c / n * math.log2(c / n) for c in Counter(data).values())   # 0..8 bits/byte

def pe_report(path):
    import pefile
    pe = pefile.PE(path)
    print("PE32+" if pe.OPTIONAL_HEADER.Magic == 0x20B else "PE32",
          "entry RVA", hex(pe.OPTIONAL_HEADER.AddressOfEntryPoint))
    for s in pe.sections:
        ch = s.Characteristics
        perms = ("R" if ch & 0x40000000 else "-") + ("W" if ch & 0x80000000 else "-") + ("X" if ch & 0x20000000 else "-")
        name = s.Name.rstrip(b"\x00").decode(errors="replace")      # no backslashes inside f-string braces
        print(f"  {name:8} {perms}  raw={s.SizeOfRawData:#8x}  H={s.get_entropy():.2f}")
    for d in getattr(pe, "DIRECTORY_ENTRY_IMPORT", []):
        print("  import", d.dll.decode(), [i.name.decode() for i in d.imports if i.name][:8])
    for e in getattr(getattr(pe, "DIRECTORY_ENTRY_EXPORT", None), "symbols", []):
        print("  export", e.name)

def elf_report(path):
    from elftools.elf.elffile import ELFFile
    with open(path, "rb") as f:
        elf = ELFFile(f)
        print(elf.header.e_type, "entry", hex(elf.header.e_entry))
        for sec in elf.iter_sections():
            flags = sec["sh_flags"]
            perms = "A" + ("W" if flags & 1 else "-") + ("X" if flags & 4 else "-")
            h = entropy(sec.data()) if sec["sh_type"] != "SHT_NOBITS" else 0.0
            print(f"  {sec.name:18} {perms}  size={sec['sh_size']:#8x}  H={h:.2f}")
        dyn = elf.get_section_by_name(".dynsym")
        if dyn: print("  dynamic imports:", [s.name for s in dyn.iter_symbols() if s.name and s["st_shndx"] == "SHN_UNDEF"][:12])
        print("  stripped:", elf.get_section_by_name(".symtab") is None)

path = sys.argv[1]
magic = open(path, "rb").read(4)
pe_report(path) if magic[:2] == b"MZ" else elf_report(path) if magic == b"\x7fELF" else print("unknown format")`,
        },
        bug: {
          explanation:
            'A real-world loader bug: loading a DLL by bare name searches the application directory (and possibly the current directory) first, so a planted version.dll runs with the app\'s privileges (DLL search-order hijacking). The fix restricts the search to System32 or uses a full, trusted path.',
          buggy: {
            language: 'c',
            filename: 'plugin_loader.c',
            code: raw`// ❌ Bare DLL name: default search order includes the app folder (and possibly CWD)
#include <windows.h>

void load_helpers(void) {
    HMODULE h = LoadLibraryW(L"version.dll");        // attacker drops version.dll next to the exe
    if (h) {
        FARPROC f = GetProcAddress(h, "GetFileVersionInfoW");
        /* ... */
    }
}`,
          },
          fixed: {
            language: 'c',
            filename: 'plugin_loader.c',
            code: raw`// ✅ Restrict DLL search paths process-wide, then load from System32 explicitly
#include <windows.h>

void harden_dll_search(void) {
    SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32);   // call early in main/WinMain
}

void load_helpers(void) {
    HMODULE h = LoadLibraryExW(L"version.dll", NULL, LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (h) {
        FARPROC f = GetProcAddress(h, "GetFileVersionInfoW");
        /* ... */
    }
}`,
          },
        },
      },
      takeaways: [
        'PE: MZ → e_lfanew → PE header → sections + data directories. ELF: \\x7fELF → program headers (load) + section headers (link).',
        '.text code, .rodata/.rdata constants, .data/.bss globals; imports reveal capabilities.',
        'VA ↔ file offset conversion is the foundation of every binary patch.',
        'Practice drill: run headers.py on /bin/ls inside a VM, then answer: is it PIE, is it stripped, and which section has the highest entropy? Then check the CrackMe Lab L1 tab with `file` and `xxd`.',
      ],
      labId: 'crackme',
      labMode: 'l1',
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-re-triage',
      title: 'Static Triage in 10 Minutes: file, strings, xxd, readelf',
      summary: 'A repeatable first pass on any unknown binary that answers "what is it, what does it talk to, and where should I look first?" without running it.',
      difficulty: 'Intermediate',
      minutes: 18,
      xp: 110,
      analogy:
        "Triage is what an emergency nurse does in the first two minutes: pulse, breathing, obvious wounds, then decide which specialist to call. For binaries: identify the format, fingerprint it, read the visible text, check what it imports, then decide whether it needs a disassembler, a debugger, or a sandbox.",
      intuition: [
        { title: 'Identify and fingerprint', body: "`file` reads magic bytes and headers (format, architecture, PIE, stripped?). `sha256sum` gives an ID for your notes and threat-intel lookups. Never rename samples to something runnable on your host." },
        { title: 'Strings: ASCII and UTF-16', body: "`strings -n 8` prints runs of printable ASCII. Windows programs often store text as UTF-16LE (`H\\0e\\0l\\0l\\0o\\0`), so also run `strings -el`. Look for URLs, IPs, registry paths, file paths, error messages, format strings (`%s-%02d`) and suspicious words (license, debug, password)." },
        { title: 'Hex for ground truth', body: "`xxd file | head` shows the raw header. When tools disagree, the bytes win. You can spot MZ/ELF magic, PE timestamps, and padding patterns." },
        { title: 'Structure: readelf / objdump', body: "`readelf -h` (header: type, entry), `-S` (sections), `-l` (segments and permissions), `-d` (needed libraries), `--dyn-syms` (imported functions). `objdump -p` shows the same NEEDED entries for ELF." },
        { title: 'Do not run it to inspect it', body: "`ldd` may execute the program's own loader logic, so never run ldd on an untrusted binary. Use `readelf -d` or `objdump -p` instead. Execution belongs in the isolated VM, later." },
        { title: 'Form hypotheses, then go deeper', body: "Strings like \"Invalid license key\" and imports like `strcmp` point to the check you will find in a disassembler. The CrackMe Lab's L1 Strings Analysis tab runs exactly this workflow in a simulated terminal." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Triage pipeline', body: 'Cheap, static, no-execution steps first. Each step narrows where to look next.', flow: ['file + sha256', 'strings (ASCII + UTF-16LE)', 'xxd header', 'readelf / PE headers + imports', 'hypothesis → disassembler'] },
        { kind: 'security', title: 'Legal & ethical scope', body: 'Reverse engineer only software you own, CrackMe/CTF targets, or samples you are authorised to analyse, inside an isolated VM. In the lab below, open the "L1 Strings Analysis" tab.' },
      ],
      code: {
        basic: {
          language: 'bash',
          filename: 'triage.sh',
          explanation: 'The standard first-pass commands, annotated with what each output answers. Run inside your analysis VM.',
          code: raw`#  TRIAGE DECISION FLOW
#  [file] -> format? arch? PIE? stripped?
#     |
#  [strings] -> URLs / keys / messages? --yes--> note hypotheses
#     |
#  [readelf/objdump] -> imports? (network, crypto, process injection)
#     |
#  [entropy/sections] -> packed? --yes--> Anti-Analysis module
#     v
#  open in Ghidra at the function referencing the interesting string

f=./sample.bin
file "$f"                          # ELF 64-bit LSB pie executable, x86-64, ..., stripped
sha256sum "$f" | tee -a notes.md   # fingerprint for your notes
strings -n 8 "$f" | sort -u | less # ASCII runs >= 8 chars
strings -el -n 6 "$f" | less       # UTF-16LE strings (common in Windows binaries)
xxd "$f" | head -n 8               # magic bytes + header fields
readelf -h "$f"                    # Type: DYN (PIE) / EXEC, Entry point address
readelf -lW "$f" | grep -E 'LOAD|GNU_STACK|GNU_RELRO'   # segment permissions
readelf -d "$f" | grep NEEDED      # shared libraries (safe alternative to ldd)
readelf --dyn-syms -W "$f" | awk '$7=="UND"{print $8}' | sort -u   # imported functions`,
        },
        production: {
          language: 'py',
          filename: 'triage_report.py',
          explanation: 'Researcher pattern: an automated triage report that hashes the file, extracts ASCII and UTF-16LE strings, and flags indicators with regexes, so every sample gets the same first look.',
          code: raw`import hashlib, re, sys, math
from collections import Counter

INDICATORS = {
    "url":      rb"https?://[\w.-]+(?:/[\w./?%&=-]*)?",
    "ipv4":     rb"\b(?:\d{1,3}\.){3}\d{1,3}\b",
    "registry": rb"HKEY_[A-Z_]+\\[\w\\]+",
    "keyword":  rb"(?i)(license|serial|passw(or)?d|debug|token|api[_-]?key)",
    "format":   rb"%[0-9]*[sdxp]",
}

def strings_ascii(data, n=6):
    # runs of n+ printable ASCII bytes (0x20..0x7e)
    return re.findall(rb"[\x20-\x7e]{%d,}" % n, data)

def strings_utf16le(data, n=6):
    # UTF-16LE = printable byte followed by 0x00; common in Windows binaries
    return [m.decode("utf-16le").encode() for m in re.findall(rb"(?:[\x20-\x7e]\x00){%d,}" % n, data)]

def entropy(b):
    n = len(b); return -sum(c/n * math.log2(c/n) for c in Counter(b).values()) if n else 0

data = open(sys.argv[1], "rb").read()        # read the whole sample (no execution)
print("sha256 :", hashlib.sha256(data).hexdigest())   # fingerprint for case notes
print("size   :", len(data), "bytes   entropy:", round(entropy(data), 2), "(> 7.2 often = packed/encrypted)")
print("magic  :", data[:4])
found = strings_ascii(data) + strings_utf16le(data)
for kind, rx in INDICATORS.items():
    hits = sorted({s for s in found if re.search(rx, s)})
    for h in hits[:10]:
        print(f"[{kind:8}] {h.decode(errors='replace')[:100]}")`,
        },
        bug: {
          explanation:
            'Compiled code does not hide string literals: they sit verbatim in .rodata/.rdata, so `strings` finds a hard-coded key in seconds (exactly the CrackMe L1 bug). The fix ships only a PUBLIC key and verifies signed licences, so nothing in the binary can mint a valid key.',
          buggy: {
            language: 'c',
            filename: 'license.c',
            code: raw`// ❌ The master key ships inside every copy of the binary (.rodata)
#include <string.h>
#define MASTER_KEY "ACME-PRO-2024-MASTER"

int check_license(const char *key) {
    return strcmp(key, MASTER_KEY) == 0;     // strings ./app | grep ACME  -> game over
}`,
          },
          fixed: {
            language: 'c',
            filename: 'license.c',
            code: raw`// ✅ Verify a vendor-signed licence with an embedded PUBLIC key (libsodium)
#include <sodium.h>

extern const unsigned char VENDOR_PK[crypto_sign_PUBLICKEYBYTES];  // public: safe to ship

int check_license(const unsigned char *lic, size_t lic_len, unsigned char *payload, size_t cap) {
    unsigned long long n;
    if (lic_len > cap + crypto_sign_BYTES) return 0;
    // signed message = 64-byte Ed25519 signature || payload (e.g. {"user":"..","exp":..})
    if (crypto_sign_open(payload, &n, lic, lic_len, VENDOR_PK) != 0) return 0;
    return 1;   // only the vendor's PRIVATE key (never shipped) can create valid licences
}`,
          },
        },
      },
      takeaways: [
        'file → sha256 → strings (ASCII + UTF-16LE) → xxd → readelf/PE headers, before any disassembler.',
        'Never run ldd or the sample itself on your host to "check" it.',
        'String literals are visible; secrets do not belong in client binaries.',
        'Practice drill: solve CrackMe Lab L1 using only `file`, `strings | grep -i license` and the binary, then write two sentences explaining why the decoy key was rejected.',
      ],
      labId: 'crackme',
      labMode: 'l1',
    },
  ],
};
