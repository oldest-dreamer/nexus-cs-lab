import type { Module } from '../../types';

const raw = String.raw;

export const x64Module: Module = {
  id: 'cyber-x64',
  title: 'Computer Architecture & Reading x86-64 Assembly',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'cyber-x64-registers-memory',
      title: 'Registers, Memory & Addressing (RAX → RSP, RIP)',
      summary: "The CPU's 16 general-purpose registers, little-endian memory, and how one `mov` instruction reads or writes bytes.",
      difficulty: 'Intermediate',
      minutes: 18,
      xp: 100,
      analogy:
        "Registers are the 16 sticky notes on a chef's hands: tiny, instant to read. Memory is the pantry: huge, but every trip costs time. RIP is the finger tracking which recipe line comes next, and RSP is the top of the plate stack. Assembly is just the chef's moves: copy a number to a sticky note, fetch from the pantry, compare two notes, jump to another line.",
      intuition: [
        { title: 'Sixteen 64-bit general-purpose registers', body: "RAX, RBX, RCX, RDX, RSI, RDI, RBP, RSP and R8–R15. Conventions give them jobs: RAX holds return values, RSP points to the top of the stack, RBP often anchors the current frame, and RDI/RSI/RDX/RCX/R8/R9 carry arguments on Linux." },
        { title: 'Sub-registers are views, with one trap', body: "EAX is the low 32 bits of RAX, AX the low 16, AL the low 8. Writing a 32-bit register (`mov eax, 1`) ZERO-EXTENDS into the full RAX; writing AX or AL leaves the upper bits unchanged. Many decompiler oddities come from this rule." },
        { title: 'RIP and RFLAGS', body: "RIP holds the address of the next instruction; you never `mov` into it directly, only change it with jmp/call/ret/jcc. RFLAGS holds condition bits (ZF, CF, SF, OF) set by arithmetic and comparisons." },
        { title: 'Memory is little-endian', body: "Storing 0x1122334455667788 at address 0x1000 puts byte 0x88 at 0x1000 and 0x11 at 0x1007. In a hex dump the number looks reversed. This is why `xxd` output of an integer seems backwards." },
        { title: 'One addressing formula', body: "Every memory operand is `[base + index*scale + displacement]`, scale ∈ {1,2,4,8}. `mov eax, [rdi + rcx*4 + 8]` reads 4 bytes from the element at index rcx of an int array that starts 8 bytes into a struct pointed to by rdi." },
        { title: 'lea computes, mov fetches', body: "`lea rax, [rdi+rcx*4]` calculates the address without touching memory (compilers also use it as fast arithmetic). `mov rax, [rdi+rcx*4]` dereferences. Confusing the two is the most common beginner misread." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Fetch → decode → execute', body: 'Every instruction follows this cycle; RIP advances by the instruction length unless the instruction itself changes it.', flow: ['RIP → fetch bytes', 'Decode (e.g. 8B 04 8F)', 'Read registers / memory', 'Execute in ALU', 'Write result + RFLAGS', 'RIP += length'] },
        { kind: 'tip', title: 'Intel vs AT&T syntax', body: 'Intel (`mov rax, rbx`: destination first) is used by Ghidra, IDA and x64dbg. AT&T (`movq %rbx, %rax`: source first, % registers) is the GDB/objdump default; use `set disassembly-flavor intel` or `objdump -M intel`.' },
      ],
      code: {
        basic: {
          language: 'asm',
          filename: 'registers.asm',
          explanation: 'Annotated instructions with the register layout and little-endian memory picture they operate on.',
          code: raw`; RAX register views (64 bits)
; |63 ............................ 32|31 ........ 16|15 .. 8|7 ... 0|
; |              (upper)              |      EAX     | AH    | AL    |
;                                      |<---- AX ------------------->|
;
; MEMORY at 0x1000 after storing the 8-byte value 0x1122334455667788 there
;   0x1000: 88 77 66 55 44 33 22 11      <- little-endian: lowest byte first

mov  rax, 0x1122334455667788   ; RAX = 1122334455667788
mov  al, 0xFF                  ; RAX = 11223344556677FF   (only low 8 bits change)
mov  eax, 1                    ; RAX = 0000000000000001   (32-bit write ZERO-EXTENDS!)

; int arr[] at rdi, index in rcx:  value = arr[rcx]
mov  eax, dword [rdi + rcx*4]  ; base=rdi, index=rcx, scale=4 (sizeof int) -> loads 4 bytes
lea  rdx, [rdi + rcx*4]        ; rdx = &arr[rcx]   (address only, no memory read)

; struct { long id; int scores[4]; } *p in rdi  ->  p->scores[2]
mov  eax, dword [rdi + 8 + 2*4]  ; displacement 8 skips 'id', then 2 ints in`,
        },
        production: {
          language: 'bash',
          filename: 'gdb-inspect.sh',
          explanation: 'Researcher pattern: inspecting registers and memory in GDB on a lab binary you compiled yourself, using the commands you will use in every RE session.',
          code: raw`# compile a tiny lab program WITH symbols so you can compare against the source
gcc -O0 -g -o regs regs.c

gdb -q ./regs <<'EOF'
set disassembly-flavor intel
break main
run
info registers rax rbx rcx rdx rsi rdi rbp rsp rip   # register snapshot
x/8xb  $rsp            # 8 bytes at RSP, one per column   (eXamine, heX, Byte)
x/2xg  $rsp            # same memory as two 8-byte Giant words: note the byte order flip
x/4dw  &scores         # 4 decimal words (32-bit ints) from a global array
p/x    $rax            # print RAX in hex
p      $eflags         # decoded flags, e.g. [ ZF PF ]
stepi                  # execute ONE instruction
x/3i   $rip            # next 3 instructions at RIP
EOF`,
        },
        bug: {
          explanation:
            'A sign-extension bug: a length byte is read as signed char. The compiler emits movsx, so 0xFF becomes -1, the "> 64" check passes, and the conversion to size_t in memcpy becomes 0xFFFFFFFFFFFFFFFF. The fix uses an unsigned type (movzx) and checks bounds against the real buffer.',
          buggy: {
            language: 'c',
            filename: 'parse.c',
            code: raw`// ❌ signed length: hdr[0] = 0xFF -> n = -1 -> passes check -> huge memcpy
void read_field(const unsigned char *hdr, const unsigned char *src) {
    char buf[64];
    int n = (signed char)hdr[0];   // asm: movsx eax, byte ptr [rdi]   (sign-extend)
    if (n > 64) return;            // -1 > 64 is false, so we continue
    memcpy(buf, src, n);           // n converted to size_t 0xFFFFFFFFFFFFFFFF -> overflow
}`,
          },
          fixed: {
            language: 'c',
            filename: 'parse.c',
            code: raw`// ✅ unsigned length, bounds checked against the buffer and the input size
int read_field(const unsigned char *hdr, const unsigned char *src, size_t src_len) {
    char buf[64];
    size_t n = hdr[0];             // asm: movzx eax, byte ptr [rdi]   (zero-extend, 0..255)
    if (n > sizeof buf || n > src_len) return -1;
    memcpy(buf, src, n);
    return (int)n;
}`,
          },
        },
      },
      takeaways: [
        'RAX…R15 + RIP + RSP + RFLAGS are the whole working state you track while reversing.',
        '32-bit register writes zero-extend; 8/16-bit writes do not.',
        'Memory is little-endian; operands are [base + index*scale + disp]; lea computes, mov loads.',
        'Practice drill: write the 8 bytes stored for 0xDEADBEEFCAFEBABE in memory order, then check with `x/8xb` in GDB on a variable holding that value.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-stack-frames-calls',
      title: 'The Stack Frame & Calling Conventions (System V vs. Windows x64)',
      summary: 'What PUSH, POP, CALL and RET do to RSP and memory, how a frame is laid out, and where arguments live on Linux vs. Windows.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "The stack is a pile of trays in a canteen that grows downward from the ceiling. CALL puts a note on the pile saying \"come back to line 42\", then the function stacks its own trays (locals) under it. RET pulls the note and jumps back. If anything scribbles over that note, the CPU returns to the wrong place; that is exactly what a stack overflow attack aims for.",
      intuition: [
        { title: 'The stack grows down', body: "RSP points to the last pushed 8-byte slot. `push rax` = `sub rsp, 8` then `mov [rsp], rax`. `pop rax` = `mov rax, [rsp]` then `add rsp, 8`. Higher addresses are older data." },
        { title: 'CALL and RET', body: "`call f` pushes the address of the NEXT instruction (the return address) and jumps to f. `ret` pops 8 bytes into RIP. The CPU blindly trusts whatever value sits at [RSP] when ret executes." },
        { title: 'Prologue and epilogue', body: "Unoptimized code starts with `push rbp; mov rbp, rsp; sub rsp, N` (save the caller's frame pointer, anchor ours, reserve locals) and ends with `leave; ret` (`leave` = `mov rsp, rbp; pop rbp`). Locals live at negative offsets from RBP." },
        { title: 'System V AMD64 (Linux, macOS)', body: "Integer/pointer args: RDI, RSI, RDX, RCX, R8, R9, then the stack. Return in RAX. Callee-saved: RBX, RBP, R12–R15. RSP must be 16-byte aligned at each call. Leaf functions may use the 128-byte red zone below RSP." },
        { title: 'Microsoft x64 (Windows)', body: "First four args: RCX, RDX, R8, R9; the 5th onward at [rsp+0x20] and up. The caller always reserves 32 bytes of shadow space. Callee-saved: RBX, RBP, RDI, RSI, RSP, R12–R15 (and XMM6–15). Same 16-byte alignment rule." },
        { title: 'Reading arguments in a disassembler', body: "At a call site, look at the registers written just before the call. On Windows, `mov dword [rsp+0x20], 3; xor r9d, r9d; mov r8d, 1; mov edx, 0x80000000; lea rcx, [path]; call CreateFileW` reads as: path, GENERIC_READ, FILE_SHARE_READ, no security attributes, OPEN_EXISTING (5th arg on the stack)." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Lifecycle of one call', body: 'Every arrow changes RSP by 8 or by the frame size.', flow: ['caller: args in RDI/RSI…', 'call f → push return addr', 'push rbp; mov rbp,rsp', 'sub rsp, N (locals)', 'leave → pop rbp', 'ret → RIP = return addr'] },
        { kind: 'tip', title: 'Frame pointers may be omitted', body: 'At -O2, GCC/Clang usually drop RBP framing (-fomit-frame-pointer) and address locals relative to RSP. Disassemblers track the RSP delta for you; watch for it when offsets look odd.' },
      ],
      code: {
        basic: {
          language: 'c',
          filename: 'frame.c',
          explanation: 'A small function with its -O0 x86-64 assembly and the exact stack layout during its execution (System V).',
          code: raw`/*  STACK DURING add3()   (GCC 13, -O0; offsets taken from the real output below)
 *
 *  higher addr  +--------------------------+
 *               | caller's frame ...       |
 *  rbp+8  --->  | return address (8 bytes) |  <- pushed by CALL, popped by RET
 *  rbp    --->  | saved rbp (caller's)     |  <- pushed by "push rbp"; rsp == rbp here
 *  rbp-4  --->  | s  (int)                 |
 *  rbp-8..-16   | (unused padding)         |
 *  rbp-20 --->  | a  (int)  spilled EDI    |
 *  rbp-24 --->  | b  (int)  spilled ESI    |
 *  rbp-28 --->  | c  (int)  spilled EDX    |  leaf function: no "sub rsp", it uses the
 *  lower addr   +--------------------------+  128-byte red zone below RSP
 */
int add3(int a, int b, int c) {    /* a=EDI, b=ESI, c=EDX on entry */
    int s = a + b + c;
    return s;                      /* result in EAX */
}
/*  gcc 13 -O0 -masm=intel (exact output):
 *  add3:
 *    push  rbp                         ; save caller frame pointer
 *    mov   rbp, rsp                    ; anchor our frame
 *    mov   DWORD PTR [rbp-20], edi     ; spill a
 *    mov   DWORD PTR [rbp-24], esi     ; spill b
 *    mov   DWORD PTR [rbp-28], edx     ; spill c
 *    mov   edx, DWORD PTR [rbp-20]     ; edx = a
 *    mov   eax, DWORD PTR [rbp-24]     ; eax = b
 *    add   edx, eax                    ; edx = a + b
 *    mov   eax, DWORD PTR [rbp-28]     ; eax = c
 *    add   eax, edx                    ; eax = a + b + c
 *    mov   DWORD PTR [rbp-4], eax      ; s = eax
 *    mov   eax, DWORD PTR [rbp-4]      ; return value in EAX
 *    pop   rbp                         ; restore caller frame pointer
 *    ret                               ; pops return address into RIP
 */`,
        },
        production: {
          language: 'asm',
          filename: 'win64-callsite.asm',
          explanation: 'Researcher pattern: recovering API arguments at a Windows x64 call site, a skill used constantly when triaging binaries in a disassembler.',
          code: raw`; HANDLE CreateFileW(lpFileName, dwDesiredAccess, dwShareMode,
;                     lpSecurityAttributes, dwCreationDisposition,
;                     dwFlagsAndAttributes, hTemplateFile);
;
;  arg#  register / slot      value here           meaning
;  1     RCX                  &L"C:\\lab\\cfg.ini"   lpFileName
;  2     RDX                  0x80000000           GENERIC_READ
;  3     R8                   1                    FILE_SHARE_READ
;  4     R9                   0                    no security attributes
;  5     [rsp+0x20]           3                    OPEN_EXISTING
;  6     [rsp+0x28]           0x80                 FILE_ATTRIBUTE_NORMAL
;  7     [rsp+0x30]           0                    no template
;  [rsp+0x00..0x1F] = 32-byte shadow space reserved by the caller

sub   rsp, 0x48                         ; shadow space + 3 stack args + alignment
mov   qword [rsp+0x30], 0               ; arg7
mov   dword [rsp+0x28], 0x80            ; arg6
mov   dword [rsp+0x20], 3               ; arg5
xor   r9d, r9d                          ; arg4 = NULL
mov   r8d, 1                            ; arg3
mov   edx, 0x80000000                   ; arg2
lea   rcx, [rel path]                   ; arg1
call  qword [rel __imp_CreateFileW]     ; indirect call through the import table
cmp   rax, -1                           ; INVALID_HANDLE_VALUE ?
je    open_failed`,
        },
        bug: {
          explanation:
            "Returning a pointer to a local variable: the local lives in the callee's frame, which is released by `leave; ret`. The next call reuses that stack memory and silently overwrites the data. The fix gives the data a lifetime that outlives the frame.",
          buggy: {
            language: 'c',
            filename: 'name.c',
            code: raw`// ❌ Dangling stack pointer
const char *make_greeting(const char *name) {
    char buf[64];                                   // lives in make_greeting's frame
    snprintf(buf, sizeof buf, "Hello, %s", name);
    return buf;                                     // frame destroyed on 'ret' -> dangling
}
// printf("%s\n", make_greeting("Nadim")); // may print garbage after other calls reuse the stack`,
          },
          fixed: {
            language: 'c',
            filename: 'name.c',
            code: raw`// ✅ Caller owns the buffer (or allocate on the heap and document who frees it)
int make_greeting(char *out, size_t out_len, const char *name) {
    int n = snprintf(out, out_len, "Hello, %s", name);
    return (n < 0 || (size_t)n >= out_len) ? -1 : 0;     // detect truncation
}
// char msg[64]; if (make_greeting(msg, sizeof msg, "Nadim") == 0) puts(msg);`,
          },
        },
      },
      takeaways: [
        'call pushes the return address; ret pops it into RIP, trusting whatever is there.',
        'SysV args: RDI, RSI, RDX, RCX, R8, R9. Win64 args: RCX, RDX, R8, R9 + 32-byte shadow space.',
        'Locals die when the frame is popped; never return their addresses.',
        'Practice drill: compile frame.c with `gcc -O0 -S -masm=intel frame.c`, open frame.s, and label every instruction with which stack slot it touches.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-x86-flags-jumps',
      title: 'CPU Flags & Conditional Jumps (CMP, TEST, ZF, CF, SF, OF)',
      summary: 'How if-statements compile to a flag-setting instruction plus a conditional jump, signed vs. unsigned branches, and why flipping one byte changes a program\'s decision.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 130,
      analogy:
        "CMP is asking a yes/no question and writing the answers on a row of sticky notes (the flags). The jump that follows does not redo the maths; it only reads one or two sticky notes and picks a road. Change which note the jump reads (JNE → JE) and the program takes the other road with the exact same data.",
      intuition: [
        { title: 'CMP subtracts and discards', body: "`cmp eax, 5` computes EAX − 5, throws the result away and sets flags. `test eax, eax` computes EAX AND EAX (= EAX) and sets flags, the compiler's favourite way to ask \"is it zero?\"." },
        { title: 'The four flags that matter', body: "ZF (zero): the result was 0. CF (carry): an unsigned borrow/overflow happened, meaning left < right as unsigned. SF (sign): the result's top bit is 1 (negative as signed). OF (overflow): the signed result did not fit." },
        { title: 'Signed vs. unsigned jumps', body: "Equality: JE/JZ (ZF=1), JNE/JNZ (ZF=0). Unsigned: JB (CF=1), JAE (CF=0), JA (CF=0 and ZF=0), JBE. Signed: JL (SF≠OF), JGE (SF=OF), JG (ZF=0 and SF=OF), JLE. Seeing JB vs JL tells you the source variable's signedness." },
        { title: 'Worked example', body: "EAX = 3, `cmp eax, 5` → 3 − 5 = −2 = 0xFFFFFFFE. ZF=0 (not zero), CF=1 (3 < 5 unsigned), SF=1 (negative), OF=0. So JL is taken (SF≠OF), JB is taken (CF=1), JE is not." },
        { title: 'Opcodes are bytes you can patch', body: "Short (rel8) forms: 74 = JE, 75 = JNE, EB = JMP, 90 = NOP. Near (rel32) forms: 0F 84 = JE, 0F 85 = JNE. Patching 75 → 74 inverts a branch; 75 xx → 90 90 removes it." },
        { title: 'Inverting vs. NOP-ing', body: "Inverting (JE) also breaks the legitimate path, because valid users now take the bad branch. NOP-ing makes the branch never happen. The CrackMe Lab's L3 Binary Patching tab lets you try both on the same listing." },
      ],
      callouts: [
        { kind: 'architecture', title: 'if (expired) goto locked;', body: 'The compiler emits a compare plus the INVERSE condition jump around the "then" body.', flow: ['call is_trial_expired → EAX', 'test eax, eax → ZF', 'jne locked (taken if EAX≠0)', 'fall-through: unlock_vault()'] },
        { kind: 'security', title: 'Legal patching only', body: 'Patch only binaries built to be patched (CrackMes, CTFs, your own programs). Bypassing licence checks in commercial software can violate copyright law and licence agreements. In the lab below, open the "L3 Binary Patching" tab.' },
      ],
      code: {
        basic: {
          language: 'asm',
          filename: 'flags.asm',
          explanation: 'The flag results for one comparison, the jump table every reverser memorises, and the encodings you patch.',
          code: raw`; cmp eax, 5   with EAX = 3      ->  3 - 5 = 0xFFFFFFFE (discarded)
;
;   +----+----+----+----+
;   | ZF | CF | SF | OF |
;   +----+----+----+----+
;   |  0 |  1 |  1 |  0 |      not zero | 3 < 5 unsigned | negative | no signed overflow
;   +----+----+----+----+
;
;  JUMP     MEANING            CONDITION          TAKEN HERE?
;  je/jz    ==                 ZF=1               no
;  jne/jnz  !=                 ZF=0               yes
;  jb/jc    <  (unsigned)      CF=1               yes
;  ja       >  (unsigned)      CF=0 and ZF=0      no
;  jl       <  (signed)        SF != OF           yes
;  jg       >  (signed)        ZF=0 and SF=OF     no
;
;  BYTE ENCODINGS             74 xx = je rel8      75 xx = jne rel8
;                             EB xx = jmp rel8     90    = nop
;                             0F 84 xx xx xx xx = je rel32   0F 85 ... = jne rel32

check_trial:
    call   is_trial_expired        ; EAX = 1 if expired
    test   eax, eax                ; ZF = (EAX == 0)
    jne    .locked                 ; 75 08 : skip the next 8 bytes (call 5 + xor 2 + ret 1)
    call   unlock_vault            ; reached only when EAX == 0
    xor    eax, eax
    ret
.locked:
    lea    rdi, [rel msg_expired]
    call   puts
    mov    eax, 1
    ret`,
        },
        production: {
          language: 'py',
          filename: 'find_branches.py',
          explanation: 'Researcher pattern: use the Capstone disassembler to list every compare-then-branch pair in a code blob, with offsets and raw bytes, exactly what you need to decide where to set breakpoints or which byte a CrackMe patch would touch.',
          code: raw`# pip install capstone        (run inside your analysis VM)
from capstone import Cs, CS_ARCH_X86, CS_MODE_64

FLAG_SETTERS = {"cmp", "test", "sub", "and", "xor"}
BRANCHES = {"je", "jne", "jb", "jae", "ja", "jbe", "jl", "jge", "jg", "jle", "js", "jns"}

def list_decisions(code: bytes, base: int):
    md = Cs(CS_ARCH_X86, CS_MODE_64)
    prev = None
    for ins in md.disasm(code, base):
        if prev and prev.mnemonic in FLAG_SETTERS and ins.mnemonic in BRANCHES:
            print(f"{prev.address:#x}  {prev.mnemonic:5} {prev.op_str:22} "
                  f"-> {ins.address:#x}  {ins.bytes.hex(' '):12} {ins.mnemonic} {ins.op_str}")
        prev = ins

# bytes of check_trial from flags.asm (call rel32 is a placeholder here)
blob = bytes.fromhex("e800000000" "85c0" "7508" "e800000000" "31c0" "c3")
list_decisions(blob, 0x401000)
# 0x401005  test  eax, eax               -> 0x401007  75 08        jne 0x401011`,
        },
        bug: {
          explanation:
            'A signed/unsigned mix-up in a bounds check. The compiler emits a signed comparison (JG/JLE family) for `int len`, so a negative length passes the check and memcpy receives it as a huge size_t. Making the length unsigned changes the emitted branch to JA/JBE (unsigned) and the check becomes correct.',
          buggy: {
            language: 'c',
            filename: 'copy.c',
            code: raw`// ❌ signed check:  cmp esi, 128 ; jg too_big   -> len = -1 passes
int copy_packet(char *dst, const char *src, int len) {
    if (len > 128) return -1;          // signed compare (SF/OF-based jump)
    memcpy(dst, src, len);             // -1 becomes 0xFFFFFFFFFFFFFFFF
    return 0;
}`,
          },
          fixed: {
            language: 'c',
            filename: 'copy.c',
            code: raw`// ✅ unsigned size:  cmp rdx, 128 ; ja too_big   -> no negative values exist
int copy_packet(char *dst, size_t dst_len, const char *src, size_t len) {
    if (len > dst_len) return -1;      // unsigned compare (CF/ZF-based jump)
    memcpy(dst, src, len);
    return 0;
}`,
          },
        },
      },
      takeaways: [
        'CMP/TEST set flags; Jcc reads them. JB/JA are unsigned, JL/JG are signed.',
        '74 = JE, 75 = JNE, EB = JMP, 90 = NOP (rel32 forms: 0F 84 / 0F 85).',
        'Inverting a branch breaks the valid path; NOP-ing removes the decision.',
        'Practice drill: for `cmp eax, ebx` with EAX=0xFFFFFFFF and EBX=1, compute ZF/CF/SF/OF and say whether JB and JL are taken. Then solve the CrackMe Lab L3 with a NOP patch.',
      ],
      labId: 'crackme',
      labMode: 'l3',
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-compile-and-compare',
      title: 'Compile & Compare: Mapping C Loops, Ifs and Switches to Assembly',
      summary: 'The fastest way to learn to read assembly: write the C yourself, compile it, and line the two up at -O0 and -O2.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "Learning to read assembly from random binaries is like learning a language from overheard arguments. Compile & compare is a phrasebook: you write the sentence in C, the compiler translates it, and you study both side by side until you can read the translation without the original.",
      intuition: [
        { title: 'if/else becomes compare + inverted jump', body: "`if (x > 10) A(); else B();` compiles to `cmp x, 10; jle .else; A; jmp .end; .else: B`. The jump skips the THEN block, so its condition is the opposite of what you wrote. Expect inversions everywhere." },
        { title: 'Loops are jumps backwards', body: "A for loop at -O0 is: init, `jmp .cond`, body, increment, `.cond: cmp; jl .body`. Any backward conditional jump in a control-flow graph is a loop. The loop counter is whatever is compared and incremented." },
        { title: 'Optimization changes the shape, not the meaning', body: "At -O2 the counter may vanish into a pointer that walks the array, variables live only in registers, and the loop may be unrolled or vectorized (SSE/AVX). Recognise the pattern: setup, a tight body, a compare, a back-edge." },
        { title: 'switch becomes a jump table', body: "Dense cases compile to a bounds check (`cmp eax, 4; ja .default`) plus an indirect jump through a table of offsets (`jmp [table + rax*8]` or relative variants). Spotting the table reveals every case target at once." },
        { title: 'Undefined behaviour can delete your checks', body: "Signed overflow is undefined in C, so an optimizer may assume `x + 100 < x` is always false and remove it. Reading the -O2 output is how you discover a safety check that no longer exists." },
      ],
      callouts: [
        { kind: 'architecture', title: 'The compile & compare loop', body: 'Repeat it with each construct until the assembly shapes become familiar.', flow: ['Write 5–15 lines of C', 'gcc -O0 -g / -O2', 'objdump -d -M intel -S', 'Annotate each instruction', 'Predict a new function, then check'] },
        { kind: 'tip', title: 'Compiler Explorer', body: 'godbolt.org shows source and assembly side by side with colour-matched lines for many compilers and flags. It is the quickest place to run this method.' },
      ],
      code: {
        basic: {
          language: 'c',
          filename: 'sum.c',
          explanation: 'A loop in C and its real GCC -O0 output, followed by the typical optimized shape. Read them line by line.',
          code: raw`int sum(const int *a, int n) {          /* a = RDI, n = ESI */
    int s = 0;
    for (int i = 0; i < n; i++)
        s += a[i];
    return s;                            /* EAX */
}
/*  gcc 13 -O0 -masm=intel (exact output)    CONTROL FLOW
 *  sum:                                    +-----------+
 *    push  rbp                             |  entry    |
 *    mov   rbp, rsp                        +-----+-----+
 *    mov   QWORD PTR [rbp-24], rdi  ; a          | jmp .L4
 *    mov   DWORD PTR [rbp-28], esi  ; n          v
 *    mov   DWORD PTR [rbp-8], 0     ; s = 0  +-----------+  jl (back-edge)
 *    mov   DWORD PTR [rbp-4], 0     ; i = 0  |  .L4 cond |<-----------+
 *    jmp   .L4                               +-----+-----+            |
 *  .L5:                             ; body         | fall: exit  +----+----+
 *    mov   eax, DWORD PTR [rbp-4]   ; eax = i      v             | .L5 body|
 *    cdqe                           ; rax = (long)i              +---------+
 *    lea   rdx, [0+rax*4]           ; rdx = i*4
 *    mov   rax, QWORD PTR [rbp-24]  ; rax = a
 *    add   rax, rdx                 ; rax = &a[i]
 *    mov   eax, DWORD PTR [rax]     ; eax = a[i]
 *    add   DWORD PTR [rbp-8], eax   ; s += a[i]
 *    add   DWORD PTR [rbp-4], 1     ; i++
 *  .L4:
 *    mov   eax, DWORD PTR [rbp-4]
 *    cmp   eax, DWORD PTR [rbp-28]  ; i < n ?   (signed: int)
 *    jl    .L5                      ; back-edge = loop
 *    mov   eax, DWORD PTR [rbp-8]   ; return s
 *    pop   rbp
 *    ret
 *
 *  gcc 13 -O1 (exact output): the counter i is gone, a pointer walks the array
 *  sum:
 *    test   esi, esi            ; n <= 0 ?
 *    jle    .L5                 ; -> return 0 (block not shown)
 *    mov    rax, rdi            ; p = a
 *    movsx  rsi, esi            ; sign-extend n to 64 bits
 *    lea    rcx, [rdi+rsi*4]    ; end = a + n
 *    mov    edx, 0              ; s = 0
 *  .L4:
 *    add    edx, DWORD PTR [rax]   ; s += *p
 *    add    rax, 4                 ; p++
 *    cmp    rax, rcx               ; p != end ?
 *    jne    .L4                    ; back-edge
 *    mov    eax, edx               ; return s
 *    ret
 */`,
        },
        production: {
          language: 'bash',
          filename: 'compile-compare.sh',
          explanation: 'The researcher workflow on your own machine: build the same file at two optimization levels and diff the interleaved source/assembly.',
          code: raw`#!/usr/bin/env bash
set -euo pipefail
src=sum.c

for opt in O0 O2; do
  gcc -$opt -g -fno-asynchronous-unwind-tables -c "$src" -o "sum_$opt.o"
  # -d disassemble, -S interleave source, -M intel syntax, --no-show-raw-insn hide bytes
  objdump -d -S -M intel --no-show-raw-insn "sum_$opt.o" > "sum_$opt.txt"
done

diff -y -W 160 sum_O0.txt sum_O2.txt | less    # side-by-side comparison

# switch statements: look for the bounds check + jump table
gcc -O2 -S -masm=intel switch.c -o - | grep -nE 'cmp|ja |jmp|\.L[0-9]+:|\.long|\.quad'`,
        },
        bug: {
          explanation:
            'Signed integer overflow is undefined behaviour, so the optimizer may assume `len + 100 < len` is always false. Verified with GCC 13 -O2: the whole function compiles to `add edi, 100; movsx rdi, edi; jmp malloc` with NO compare at all. The fix uses a well-defined check, which compiles to `add rdi, 100; jc .fail`.',
          buggy: {
            language: 'c',
            filename: 'alloc.c',
            code: raw`// ❌ UB-based overflow check: may be optimized away at -O2
char *alloc_with_header(int len) {
    if (len + 100 < len)          // signed overflow is UB -> compiler may treat as always false
        return NULL;
    return malloc(len + 100);     // len = INT_MAX -> wraps negative -> malloc(huge or tiny)
}`,
          },
          fixed: {
            language: 'c',
            filename: 'alloc.c',
            code: raw`// ✅ Defined overflow detection (GCC/Clang builtin) and unsigned sizes
#include <stdlib.h>
char *alloc_with_header(size_t len) {
    size_t total;
    if (__builtin_add_overflow(len, (size_t)100, &total))   // emits: add + jc (carry check)
        return NULL;
    return malloc(total);
}`,
          },
        },
      },
      takeaways: [
        'if → compare + inverted jump; loop → backward jump; switch → bounds check + jump table.',
        'Optimizations change shape (registers, pointer bumps, unrolling) but not meaning.',
        'Undefined behaviour can silently remove safety checks; read the -O2 output.',
        'Practice drill: write a 4-case switch, compile with -O2, find the jump table, and map each table entry to its case.',
      ],
      labId: 'crackme',
      labMode: 'l2',
    },
  ],
};
