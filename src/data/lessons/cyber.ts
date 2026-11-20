import type { Track } from '../types';

export const cyberTrack: Track = {
  id: 'cyber',
  title: 'Cybersecurity & Reverse Engineering',
  short: 'Security',
  tagline: 'Web exploitation, cryptography, binary triage, assembly and legal CrackMe patching.',
  accent: 'crimson',
  icon: 'shield',
  modules: [
    {
      id: 'cyber-web',
      title: 'Web Exploitation (Defensive)',
      level: 'Beginner',
      lessons: [
        {
          id: 'cyber-sql-injection',
          title: 'SQL Injection & Parameterized Queries',
          summary: 'How string-built SQL lets input become code, and the one habit that eliminates the whole bug class.',
          difficulty: 'Beginner',
          minutes: 14,
          xp: 80,
          analogy:
            'Building SQL with string concatenation is like letting a customer write directly on the order slip the kitchen reads. A parameterized query hands the kitchen a sealed envelope: whatever is inside is treated as an ingredient, never as an instruction.',
          intuition: [
            { title: 'The database parses one string', body: "If you glue user input into the SQL text, the parser cannot tell where your code ends and their input begins." },
            { title: 'A quote breaks out', body: "Input like  ' OR '1'='1  closes your string literal early and adds a condition that is always true." },
            { title: 'Parameters separate code from data', body: 'With placeholders ($1, ?), the query structure is parsed first and the values are bound afterwards. The input can no longer change the structure.' },
            { title: 'Defence in depth', body: 'Least-privilege database users, allow-listed identifiers (for ORDER BY columns), and Row Level Security limit the damage of any bug that slips through.' },
          ],
          callouts: [
            {
              kind: 'architecture',
              title: 'Why binding works',
              body: 'The SQL text is fixed at the time it is parsed; values never pass through the parser.',
              flow: ['SQL template', 'Parse & plan', 'Bind values', 'Execute'],
            },
            { kind: 'security', title: 'Practise legally', body: 'Only test applications you own or have written permission to test, such as OWASP Juice Shop, DVWA, or this platform\'s labs.' },
          ],
          code: {
            basic: {
              language: 'sql',
              filename: 'what-the-db-sees.sql',
              explanation: "What the database receives when the username field contains  ' OR '1'='1' --",
              code: `-- Intended
SELECT * FROM users WHERE username = 'alice' AND password_hash = '...';

-- After string concatenation with malicious input:
SELECT * FROM users WHERE username = '' OR '1'='1' --' AND password_hash = '...';
--                                       ^^^^^^^^^ always true
--                                                  ^^ rest is a comment`,
            },
            production: {
              language: 'ts',
              filename: 'users.repo.ts',
              explanation: 'Parameterized query with node-postgres plus an allow-list for dynamic identifiers (which cannot be parameterized).',
              code: `import { Pool } from 'pg';
const pool = new Pool();

const SORTABLE = new Set(['created_at', 'username', 'last_login']);

export async function findUsers(search: string, sort = 'created_at') {
  const column = SORTABLE.has(sort) ? sort : 'created_at'; // allow-list identifiers
  const { rows } = await pool.query(
    'SELECT id, username, created_at FROM users WHERE username ILIKE $1 ORDER BY ' + column + ' DESC LIMIT 50',
    ['%' + search + '%'],                                       // bound value
  );
  return rows;
}`,
            },
            bug: {
              explanation: 'Escaping quotes by hand is incomplete (encodings, backslashes, numeric contexts). Use placeholders, every time.',
              buggy: {
                language: 'ts',
                filename: 'login.ts',
                code: `// ❌ Input becomes SQL
const sql = "SELECT * FROM users WHERE username = '" + req.body.username + "'";
const { rows } = await pool.query(sql);`,
              },
              fixed: {
                language: 'ts',
                filename: 'login.ts',
                code: `// ✅ Input stays data
const { rows } = await pool.query(
  'SELECT id, password_hash FROM users WHERE username = $1',
  [req.body.username],
);`,
              },
            },
          },
          takeaways: ['Never concatenate input into SQL.', 'Placeholders for values, allow-lists for identifiers.', 'Least privilege limits the blast radius.'],
        },
      ],
      planned: ['XSS & Content Security Policy', 'CSRF, SameSite & CORS', 'Authentication: Sessions vs. JWT Pitfalls', 'SSRF in Cloud Environments'],
    },
    {
      id: 'cyber-re',
      title: 'Reverse Engineering & Binary Triage',
      level: 'Intermediate',
      lessons: [
        {
          id: 'cyber-re-triage',
          title: 'Binary Triage: file, strings & hexdump',
          summary: 'The first five minutes with an unknown binary: identify it, read its strings, and form hypotheses.',
          difficulty: 'Beginner',
          minutes: 15,
          xp: 90,
          analogy:
            'Triage is reading the outside of a sealed box before opening it: the shipping label (file headers), the words printed on the side (strings), and how heavy it is (size and sections).',
          intuition: [
            { title: 'Identify the format', body: '`file` reads the magic bytes. Windows executables start with "MZ" and contain a "PE" header; Linux uses "\\x7fELF".' },
            { title: 'Strings reveal intent', body: '`strings` prints every run of printable characters. Error messages, URLs, registry keys, and, in badly written software, hardcoded secrets.' },
            { title: 'Hexdump shows the truth', body: '`xxd` shows raw bytes. When tools disagree, the bytes are what is really there.' },
            { title: 'Form a hypothesis, then go deeper', body: 'Strings such as "Invalid license" and "TRIAL EXPIRED" tell you which code paths to look for in a disassembler.' },
          ],
          callouts: [
            { kind: 'architecture', title: 'Triage workflow', body: 'Cheap, static steps first. Never run an unknown binary on your host.', flow: ['file / magic bytes', 'strings', 'imports & sections', 'disassemble hot spots', 'sandboxed dynamic run'] },
            { kind: 'security', title: 'Legal & ethical scope', body: 'Reverse engineer only software you own or that is written to be cracked (CrackMe challenges, CTFs). Bypassing licence checks on commercial software can violate copyright law and EULAs.' },
          ],
          code: {
            basic: {
              language: 'bash',
              filename: 'triage.sh',
              explanation: 'Standard first commands (run them in an isolated VM on real samples).',
              code: `file sample.exe                 # format, arch, subsystem
sha256sum sample.exe            # fingerprint for notes / threat intel
strings -n 8 sample.exe | less  # printable runs ≥ 8 chars
strings -el sample.exe          # UTF-16LE strings (common on Windows)
xxd sample.exe | head -n 8      # raw header bytes`,
            },
            production: {
              language: 'py',
              filename: 'mini_strings.py',
              explanation: 'A minimal `strings` implementation. Seeing how it works removes the magic.',
              code: `import re
import sys

PRINTABLE = re.compile(rb"[\\x20-\\x7e]{%d,}" % 6)

def strings(path: str):
    data = open(path, "rb").read()
    for m in PRINTABLE.finditer(data):
        yield m.start(), m.group().decode("ascii")

if __name__ == "__main__":
    for offset, s in strings(sys.argv[1]):
        print(f"0x{offset:08x}  {s}")`,
            },
            bug: {
              explanation: 'Developers often believe compiled code hides secrets. It does not: string literals are stored verbatim in the data section. Validate licences server-side or with signatures.',
              buggy: {
                language: 'c',
                filename: 'license.c',
                code: `// ❌ The key ships inside every copy of the binary
#define MASTER_KEY "ACME-PRO-2024-MASTER"
bool check(const char *k) { return strcmp(k, MASTER_KEY) == 0; }`,
              },
              fixed: {
                language: 'c',
                filename: 'license.c',
                code: `// ✅ Verify a signed licence with an embedded PUBLIC key.
//    Only the vendor's private key can mint valid licences.
bool check(const license_t *lic) {
  return ed25519_verify(lic->signature, lic->payload, lic->len, VENDOR_PUBKEY);
}`,
              },
            },
          },
          takeaways: ['file → strings → xxd before anything else.', 'Literals are visible in the binary.', 'Stay in legal scope: CrackMes and CTFs.'],
          labId: 'crackme',
        },
        {
          id: 'cyber-x86-flags-jumps',
          title: 'Reading x86: CMP, Flags & Conditional Jumps',
          summary: 'How if-statements compile to CMP + Jcc, and why flipping one byte changes the program\'s decision.',
          difficulty: 'Intermediate',
          minutes: 18,
          xp: 120,
          analogy:
            'CMP is asking a yes/no question and writing the answer on a sticky note (the FLAGS register). The jump instruction after it only reads the sticky note and decides which road to take.',
          intuition: [
            { title: 'Functions return in EAX', body: 'By convention on x86, a function\'s integer return value is placed in EAX.' },
            { title: 'CMP subtracts and throws away the result', body: 'CMP EAX, 0 computes EAX − 0 and only sets flags. If the result is zero, the Zero Flag (ZF) is 1.' },
            { title: 'Jcc reads the flags', body: 'JE/JZ jumps if ZF = 1. JNE/JNZ jumps if ZF = 0. JMP always jumps.' },
            { title: 'Opcodes are just bytes', body: 'Short JNE is 0x75, short JE is 0x74, and NOP is 0x90. Patching 75 → 74 inverts the branch; 75 0C → 90 90 removes it.' },
            { title: 'Patching inverts or removes a decision', body: 'Inverting (JE) breaks the valid case; NOP-ing makes the branch never happen. The lab lets you try both.' },
          ],
          callouts: [
            { kind: 'architecture', title: 'if (expired) goto locked;', body: 'The compiler turns a C condition into a compare plus a conditional jump.', flow: ['call is_trial_expired', 'EAX = 1', 'CMP EAX, 0 → ZF = 0', 'JNE locked (taken)', 'TRIAL EXPIRED'] },
            { kind: 'tip', title: 'TEST vs CMP', body: 'Compilers often emit TEST EAX, EAX (bitwise AND, sets ZF if zero) instead of CMP EAX, 0. Same effect, shorter encoding.' },
          ],
          code: {
            basic: {
              language: 'c',
              filename: 'trial.c',
              explanation: 'The source that compiles to the assembly in Lab Level 3.',
              code: `int main(void) {
  if (is_trial_expired()) {   // returns 1 after 30 days
    puts("TRIAL EXPIRED");
    return 1;
  }
  unlock_vault();
  return 0;
}`,
            },
            production: {
              language: 'asm',
              filename: 'trial.asm',
              explanation: 'Typical compiler output (x86, Intel syntax). Note the byte encoding on the left.',
              code: `0x401000  55                push   ebp
0x401001  89 E5             mov    ebp, esp
0x401003  E8 F8 0F 00 00    call   is_trial_expired   ; EAX = 1 or 0
0x401008  83 F8 00          cmp    eax, 0              ; sets ZF
0x40100B  75 0C             jne    0x401019 <locked>   ; ZF==0 → jump
0x40100D  E8 2E 10 00 00    call   unlock_vault
0x401012  31 C0             xor    eax, eax
0x401014  5D                pop    ebp
0x401015  C3                ret
0x401019  68 00 20 40 00    push   str_trial_expired   ; <locked>
0x40101E  E8 DD 0F 00 00    call   puts`,
            },
            bug: {
              explanation: 'A client-side boolean check is a single branch away from being bypassed. Real protection keeps the valuable logic or data on a server, or verifies signed entitlements.',
              buggy: {
                language: 'c',
                filename: 'gate.c',
                code: `// ❌ One JNE guards everything; patch it and the feature is free
if (!license_valid()) return show_paywall();
render_premium_feature();`,
              },
              fixed: {
                language: 'c',
                filename: 'gate.c',
                code: `// ✅ Premium content is fetched with a server-verified token;
//    patching the client yields nothing to render.
token_t t = request_entitlement_token(user_session);
content_t *c = fetch_premium_content(t);   // server checks t
if (c) render(c);`,
              },
            },
          },
          takeaways: ['CMP sets flags; Jcc reads them.', '0x75 = JNE, 0x74 = JE, 0x90 = NOP.', 'Client-side checks are bypassable by design.'],
          labId: 'crackme',
        },
      ],
      planned: ['PE & ELF File Formats', 'Ghidra Workflow: Decompile, Rename, Retype', 'Dynamic Analysis with x64dbg / GDB', 'Anti-Debugging Tricks'],
    },
    {
      id: 'cyber-crypto',
      title: 'Applied Cryptography',
      level: 'Advanced',
      lessons: [],
      planned: ['XOR, One-Time Pads & Why Key Reuse Fails', 'Hashing vs. Encryption vs. Signing', 'Password Storage: Argon2 & bcrypt', 'TLS 1.3 Handshake Walkthrough'],
    },
  ],
};
