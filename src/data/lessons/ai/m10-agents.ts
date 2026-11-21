import type { Module } from '../../types';

const raw = String.raw;

export const agentsModule: Module = {
  id: 'ai-agents',
  title: 'Agents, Tool Calling & MCP',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'ai-agent-loops',
      title: 'The Agent Loop: Reason, Act, Observe (with Limits)',
      summary: 'An agent is a loop around a model that can call tools. Build one from scratch, then add the stop conditions, budgets and error handling that keep it from running forever.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "An agent is an intern with a phone and a to-do list. They think about what to do next, make one call, listen to the answer, and decide again. A good manager gives them a clear goal, a short list of numbers they may call, a budget, a deadline, and an instruction to come back and ask when stuck, instead of dialling the same wrong number forever.",
      intuition: [
        { title: 'The loop', body: "1) Send the goal, history and tool definitions to the model. 2) If it returns tool calls, execute them and append the results. 3) If it returns a final answer, stop. Repeat. Everything else is engineering around this loop." },
        { title: 'Workflows before agents', body: "If the steps are known in advance (extract → validate → store), write a fixed workflow and use the model inside steps. Use an open-ended agent only when the path genuinely depends on what is discovered along the way." },
        { title: 'Always bound the loop', body: "Cap the number of steps, tokens, wall-clock time and money. Detect repetition (the same tool with the same arguments three times) and stop or escalate." },
        { title: 'Errors are observations', body: "When a tool fails, return a concise, actionable error as the tool result (\"file not found: reports/q3.csv; available: q1.csv, q2.csv\") instead of crashing. Models recover well when told what went wrong." },
        { title: 'Good tools make good agents', body: "Few tools, clear names, precise descriptions and parameter docs, and outputs that are short and structured. Most agent failures are tool-design failures." },
        { title: 'Trace everything', body: "Log every step: the model's tool choice, arguments, result size, latency and cost. You cannot debug or evaluate an agent you cannot replay (Module 11)." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Bounded agent loop', body: 'Each iteration is one model call plus zero or more tool calls.', flow: ['goal + tools', 'model: think → tool call or answer', 'validate + execute tool', 'append observation', 'check limits (steps, cost, repeats)', 'final answer / escalate'] },
        { kind: 'warning', title: 'Autonomy multiplies mistakes', body: 'A 95%-reliable step repeated over 20 steps succeeds end-to-end only about 36% of the time (0.95²⁰). Shorten chains, verify intermediate results, and keep humans in the loop for consequential actions.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'agent_loop.ts',
          explanation: 'Runnable TypeScript with a scripted mock model (no API key): the full reason–act–observe loop, tool errors fed back as observations, and three independent stop conditions (final answer, step limit, repeated identical calls), each asserted.',
          code: raw`//  AGENT LOOP
//
//   +--> model(history, tools) --answer--> DONE
//   |          | tool_call
//   |          v
//   |    run tool (errors become observations)
//   |          |
//   +-- append result <-- check: steps < max, no repeat x3
import assert from 'node:assert/strict';

type ToolCall = { name: string; args: Record<string, unknown> };
type ModelTurn = { toolCall?: ToolCall; answer?: string };
type Msg = { role: 'user' | 'assistant' | 'tool'; content: string };

const tools: Record<string, (a: any) => string> = {
  list_files: () => JSON.stringify(['q1.csv', 'q2.csv']),
  read_file: (a: { path: string }) => {
    const files: Record<string, string> = { 'q1.csv': 'revenue,120', 'q2.csv': 'revenue,150' };
    if (!(a.path in files)) throw new Error('file not found: ' + a.path + '; try list_files');
    return files[a.path];
  },
};

function runAgent(goal: string, model: (h: Msg[]) => ModelTurn, maxSteps = 6) {
  const history: Msg[] = [{ role: 'user', content: goal }];
  const seen = new Map<string, number>();
  for (let step = 1; step <= maxSteps; step++) {
    const turn = model(history);
    if (turn.answer !== undefined) return { status: 'done', answer: turn.answer, steps: step, history };
    const call = turn.toolCall!;
    const key = call.name + JSON.stringify(call.args);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (seen.get(key)! >= 3) return { status: 'stopped: repeated call', steps: step, history };
    history.push({ role: 'assistant', content: 'CALL ' + key });
    let result: string;
    try {
      result = call.name in tools ? tools[call.name](call.args) : 'error: unknown tool ' + call.name;
    } catch (e) {
      result = 'error: ' + (e as Error).message;            // the model sees the error and can recover
    }
    history.push({ role: 'tool', content: result });
  }
  return { status: 'stopped: max steps', steps: maxSteps, history };
}

// scripted model: guesses a wrong file, recovers from the error, then answers
const script: ModelTurn[] = [
  { toolCall: { name: 'read_file', args: { path: 'q3.csv' } } },
  { toolCall: { name: 'list_files', args: {} } },
  { toolCall: { name: 'read_file', args: { path: 'q1.csv' } } },
  { toolCall: { name: 'read_file', args: { path: 'q2.csv' } } },
  { answer: 'Revenue grew from 120 to 150 (+25%).' },
];
let i = 0;
const good = runAgent('How did revenue change from Q1 to Q2?', () => script[i++]);
assert.equal(good.status, 'done');
assert.equal(good.steps, 5);
assert.ok(good.history.some((m) => m.role === 'tool' && m.content.startsWith('error: file not found')));
assert.equal((150 - 120) / 120, 0.25);

// a stuck model that repeats itself is stopped
const stuck = runAgent('?', () => ({ toolCall: { name: 'read_file', args: { path: 'nope.csv' } } }));
assert.equal(stuck.status, 'stopped: repeated call');

// a wandering model hits the step limit
let n = 0;
const wander = runAgent('?', () => ({ toolCall: { name: 'read_file', args: { path: 'f' + n++ } } }), 4);
assert.equal(wander.status, 'stopped: max steps');

assert.ok(Math.abs(0.95 ** 20 - 0.3585) < 1e-4);                       // why long chains fail
console.log(good.answer, '| steps:', good.steps, '| stuck:', stuck.status, '| wander:', wander.status);`,
        },
        production: {
          language: 'py',
          filename: 'agent.py',
          explanation: 'Production, provider-agnostic agent loop: a tool registry with JSON-schema parameters, argument validation before execution, per-tool timeouts, step/cost/repeat limits, truncated observations, and a structured trace for every step. `call_model` wraps your provider\'s tool-calling API.',
          code: raw`import asyncio
import json
import time
from collections import Counter
from dataclasses import dataclass
from jsonschema import validate, ValidationError      # pip install jsonschema

@dataclass
class Tool:
    name: str
    description: str
    parameters: dict           # JSON Schema
    fn: callable
    timeout_s: float = 20

class Agent:
    def __init__(self, call_model, tools: list[Tool], max_steps=12, max_cost_usd=0.50):
        self.call_model, self.tools = call_model, {t.name: t for t in tools}
        self.max_steps, self.max_cost = max_steps, max_cost_usd

    async def run(self, goal: str, trace: list) -> str:
        msgs, cost, repeats = [{"role": "user", "content": goal}], 0.0, Counter()
        specs = [{"name": t.name, "description": t.description, "parameters": t.parameters}
                 for t in self.tools.values()]
        for step in range(self.max_steps):
            turn = await self.call_model(msgs, tools=specs)      # -> {text, tool_calls, cost}
            cost += turn["cost"]
            msgs.append(turn["message"])
            if not turn["tool_calls"]:
                return turn["text"]
            if cost > self.max_cost:
                return "Stopped: budget exceeded. Partial findings: " + turn["text"]
            for call in turn["tool_calls"]:
                key = call["name"] + json.dumps(call["args"], sort_keys=True)
                repeats[key] += 1
                t0, result = time.monotonic(), await self._execute(call, repeats[key])
                trace.append({"step": step, "tool": call["name"], "args": call["args"],
                              "ms": int((time.monotonic() - t0) * 1000), "result_chars": len(result)})
                msgs.append({"role": "tool", "tool_call_id": call["id"], "content": result[:4000]})
        return "Stopped: step limit reached. Escalating to a human."

    async def _execute(self, call, n_repeat) -> str:
        tool = self.tools.get(call["name"])
        if tool is None:
            return "error: unknown tool; available: " + ", ".join(self.tools)
        if n_repeat >= 3:
            return "error: identical call repeated 3 times; change approach or ask the user"
        try:
            validate(call["args"], tool.parameters)              # never trust model-made arguments
            return str(await asyncio.wait_for(tool.fn(**call["args"]), tool.timeout_s))
        except ValidationError as e:
            return "error: invalid arguments: " + e.message
        except asyncio.TimeoutError:
            return f"error: {tool.name} timed out after {tool.timeout_s}s"
        except Exception as e:                                   # report, don't crash the loop
            return f"error: {type(e).__name__}: {e}"`,
        },
        bug: {
          explanation:
            'A while-True loop with no step, cost or repetition limit will spin forever when a tool keeps failing or the model keeps choosing the same action, burning tokens and money until someone notices. Bound every agent loop and give it a defined way to stop and escalate.',
          buggy: {
            language: 'py',
            filename: 'loop.py',
            code: raw`# ❌ Unbounded: one persistent tool error = an infinite, expensive loop
while True:
    turn = call_model(msgs, tools=specs)
    if not turn["tool_calls"]:
        break
    for call in turn["tool_calls"]:
        msgs.append(run_tool(call))`,
          },
          fixed: {
            language: 'py',
            filename: 'loop.py',
            code: raw`# ✅ Bounded by steps and cost, with repeat detection and escalation
for step in range(MAX_STEPS):
    turn = call_model(msgs, tools=specs)
    spent += turn["cost"]
    if not turn["tool_calls"]:
        return turn["text"]
    if spent > MAX_COST or repeated_three_times(turn["tool_calls"], history):
        return escalate_to_human(msgs)
    for call in turn["tool_calls"]:
        msgs.append(run_tool(call))
return escalate_to_human(msgs)`,
          },
        },
      },
      takeaways: [
        'An agent = model + tools + a loop that appends observations until a final answer.',
        'Prefer fixed workflows when the steps are known; use agents when the path must be discovered.',
        'Bound every loop: steps, cost, time and repeated identical calls.',
        'Return tool errors as observations; validate arguments before executing anything.',
        'Practice drill: compute end-to-end success for 10 steps at 98% each (0.98¹⁰ ≈ 0.817), then change maxSteps in Tab 1 to 3 and predict which status the scripted run returns ("stopped: max steps").',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'ai-tool-calling-mcp',
      title: 'Tool Calling, Safe Tool Design & the Model Context Protocol (MCP)',
      summary: 'How models emit tool calls, how to design and validate tools so model-chosen arguments cannot escape their sandbox, and how MCP standardises tools, resources and prompts across apps.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 140,
      analogy:
        "Tool calling is a restaurant order slip: the model writes the dish and modifications in a fixed format, and the kitchen (your code) decides whether to cook it. MCP is a universal power socket: any appliance (tool server) that follows the standard works in any kitchen (AI app) without custom wiring. A good kitchen still refuses an order for \"one chef, deep-fried\".",
      intuition: [
        { title: 'The model proposes, your code disposes', body: "You send tool names, descriptions and JSON-Schema parameters. The model replies with a tool name and arguments; nothing runs until your code executes it. Every argument is untrusted input, exactly like a form field from the internet." },
        { title: 'Describe tools for a reader who cannot ask questions', body: "Say what the tool does, when to use it, what each parameter means (with formats and examples), and what it returns. Ambiguous descriptions cause wrong calls far more often than model weakness." },
        { title: 'Least privilege', body: "Expose the narrowest capability: `get_invoice(invoice_id)` rather than `run_sql(query)`; read-only by default; scope credentials to the current user; separate tools for reading and for changing things." },
        { title: 'Sandbox paths, URLs and commands', body: "Resolve file paths and require them to stay inside an allowed root (no `../`), allowlist outbound hosts, never pass arguments to a shell, and parameterise every database query." },
        { title: 'MCP architecture', body: "A host app (IDE, chat app, agent) runs MCP clients that connect to MCP servers. Servers expose tools (actions), resources (readable data) and prompts (templates) over JSON-RPC, locally via stdio or remotely via HTTP. Write a server once; use it from any MCP-capable host." },
        { title: 'Trust boundaries in MCP', body: "Only install servers you trust, review the tools they expose, and remember that tool descriptions and results are model inputs: a malicious server or a poisoned document can attempt prompt injection. Require user confirmation for consequential actions." },
      ],
      callouts: [
        { kind: 'architecture', title: 'MCP in one picture', body: 'One host, many servers, one protocol.', flow: ['host app + model', 'MCP client', 'JSON-RPC (stdio / HTTP)', 'MCP server', 'tools · resources · prompts', 'your systems (files, DB, APIs)'] },
        { kind: 'security', title: 'Validate, then authorise, then execute', body: 'Schema-validate arguments, check the current user is allowed to perform this action on this object, sandbox the operation, and log it. The model\'s intent is never authorisation.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'tool_dispatch_from_scratch.py',
          explanation: 'Runnable, dependency-free tool dispatcher: schema checks on model-supplied arguments, an allowlist of tools, and a file tool that resolves paths and rejects traversal and absolute-path escapes. Every rejection is asserted.',
          code: raw`#  SAFE TOOL EXECUTION
#
#   model: {"name": "read_doc", "args": {"path": "../../etc/passwd"}}
#      -> tool allowlisted?          yes
#      -> args match schema?         yes (a string)
#      -> resolved path inside root? NO  -> "error: path outside workspace"
import json
import tempfile
from pathlib import Path

ROOT = Path(tempfile.mkdtemp()).resolve()
(ROOT / "notes").mkdir()
(ROOT / "notes" / "todo.md").write_text("ship v2")

def read_doc(path: str) -> str:
    target = (ROOT / path).resolve()
    if not target.is_relative_to(ROOT):                 # blocks ../ and absolute paths
        raise PermissionError("path outside workspace")
    if not target.is_file():
        raise FileNotFoundError("no such document: " + path)
    return target.read_text()[:2000]

TOOLS = {"read_doc": {"fn": read_doc, "params": {"path": str}, "required": ["path"]}}

def dispatch(call_json: str) -> str:
    try:
        call = json.loads(call_json)
        spec = TOOLS.get(call.get("name"))
        if spec is None:
            return "error: unknown tool"
        args = call.get("args", {})
        missing = [p for p in spec["required"] if p not in args]
        extra = [p for p in args if p not in spec["params"]]
        wrong = [p for p, t in spec["params"].items() if p in args and not isinstance(args[p], t)]
        if missing or extra or wrong:
            return "error: invalid args " + json.dumps({"missing": missing, "extra": extra, "wrong_type": wrong})
        return spec["fn"](**args)
    except (PermissionError, FileNotFoundError) as e:
        return "error: " + str(e)
    except json.JSONDecodeError:
        return "error: tool call was not valid JSON"

call = lambda name, **args: json.dumps({"name": name, "args": args})
assert dispatch(call("read_doc", path="notes/todo.md")) == "ship v2"
assert dispatch(call("read_doc", path="../../etc/passwd")) == "error: path outside workspace"
assert dispatch(call("read_doc", path="/etc/passwd")) == "error: path outside workspace"
assert dispatch(call("read_doc", path="notes/../../x")) == "error: path outside workspace"
assert dispatch(call("read_doc", path="notes/missing.md")).startswith("error: no such document")
assert dispatch(call("delete_everything")) == "error: unknown tool"
assert dispatch(call("read_doc", path=42)).startswith("error: invalid args")
assert dispatch(call("read_doc", path="notes/todo.md", mode="w")).startswith("error: invalid args")
assert dispatch("not json") == "error: tool call was not valid JSON"
print("all unsafe calls rejected; workspace =", ROOT)`,
        },
        production: {
          language: 'py',
          filename: 'docs_mcp_server.py',
          explanation: 'Production MCP server with the official Python SDK (FastMCP): typed tools whose signatures become JSON Schemas, a read-only resource, path sandboxing, size limits and structured errors. Run it over stdio for a local host app.',
          code: raw`# pip install "mcp[cli]"
from pathlib import Path
from mcp.server.fastmcp import FastMCP

ROOT = Path("/srv/team-docs").resolve()
MAX_BYTES = 200_000
mcp = FastMCP("team-docs")

def _safe(path: str) -> Path:
    p = (ROOT / path).resolve()
    if not p.is_relative_to(ROOT):
        raise ValueError("path must stay inside the docs workspace")
    return p

@mcp.tool()
def search_docs(query: str, limit: int = 5) -> list[dict]:
    """Search team documentation by keyword. Use before read_doc to find the right file.
    Returns up to 'limit' results as {path, line, snippet}."""
    limit = max(1, min(limit, 20))
    hits = []
    for f in ROOT.rglob("*.md"):
        for n, line in enumerate(f.read_text(errors="ignore").splitlines(), 1):
            if query.lower() in line.lower():
                hits.append({"path": str(f.relative_to(ROOT)), "line": n, "snippet": line[:200]})
                if len(hits) >= limit:
                    return hits
    return hits

@mcp.tool()
def read_doc(path: str) -> str:
    """Read one Markdown document by its workspace-relative path, e.g. 'billing/refunds.md'."""
    p = _safe(path)
    if p.suffix != ".md" or not p.is_file():
        raise ValueError(f"not a document: {path}")
    if p.stat().st_size > MAX_BYTES:
        raise ValueError("document too large; use search_docs to find the relevant section")
    return p.read_text()

@mcp.resource("docs://index")
def index() -> str:
    """List of all documents (read-only resource)."""
    return "\n".join(str(f.relative_to(ROOT)) for f in sorted(ROOT.rglob("*.md")))

if __name__ == "__main__":
    mcp.run()          # stdio transport; configure the host app to launch this command`,
        },
        bug: {
          explanation:
            'Joining a model-supplied path onto a base directory without resolving it lets "../" sequences or an absolute path escape the workspace, so a prompt-injected document can make the agent read SSH keys or environment files. Resolve the final path and require it to remain inside the allowed root.',
          buggy: {
            language: 'py',
            filename: 'tools.py',
            code: raw`# ❌ Path traversal: "../../home/app/.env" or "/etc/passwd" walks out of the workspace
@mcp.tool()
def read_doc(path: str) -> str:
    return open(os.path.join("/srv/team-docs", path)).read()`,
          },
          fixed: {
            language: 'py',
            filename: 'tools.py',
            code: raw`# ✅ Resolve, then require the result to stay inside the root
ROOT = Path("/srv/team-docs").resolve()

@mcp.tool()
def read_doc(path: str) -> str:
    p = (ROOT / path).resolve()
    if not p.is_relative_to(ROOT) or p.suffix != ".md":
        raise ValueError("path must be a .md file inside the docs workspace")
    return p.read_text()`,
          },
        },
      },
      takeaways: [
        'Tool calls are proposals; arguments are untrusted input to validate before anything runs.',
        'Design few, narrow, well-described tools; read-only by default; least privilege.',
        'Resolve paths and enforce an allowed root; allowlist hosts; never build shell or SQL strings.',
        'MCP standardises tools, resources and prompts between host apps and servers; trust servers deliberately.',
        'Practice drill: add a write_doc tool to the MCP server that only allows paths under drafts/ and refuses to overwrite existing files.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'ai-agent-memory-hitl',
      title: 'Agent Memory, Human-in-the-Loop Approvals & Idempotent Actions',
      summary: 'Give agents the right kind of memory, pause for human approval before consequential actions, and make every side effect safe to retry.',
      difficulty: 'Advanced',
      minutes: 22,
      xp: 130,
      analogy:
        "Memory for an agent works like a professional's notebook system: a scratchpad for the current task, a project log of what happened, and a reference binder of durable facts. Human-in-the-loop is the bank's rule that large transfers need a second signature. Idempotency is a cheque number: if the same cheque is presented twice, the bank pays it only once.",
      intuition: [
        { title: 'Kinds of memory', body: "Working memory is the current context window. Episodic memory records past runs and their outcomes. Semantic memory stores durable facts and preferences. Procedural memory is the instructions and skills the agent follows. Each needs its own store and retrieval rule." },
        { title: 'Write memory deliberately', body: "Save what will still matter later (decisions, user preferences, verified facts), with a source and timestamp. Retrieve by relevance into context when needed, and let users see, correct and delete what is stored." },
        { title: 'Classify actions by risk', body: "Reading is low risk. Sending messages, spending money, deleting data or changing permissions is high risk. High-risk tool calls should pause the run, show the exact action and arguments to a human, and continue only on approval." },
        { title: 'Durable pauses', body: "An approval may take hours. Persist the agent's state (messages, pending call, step count) as a checkpoint so the run can resume exactly where it stopped, even after a restart." },
        { title: 'Retries cause duplicates', body: "Networks time out after the server has already acted. Retrying a non-idempotent call (charge card, send email) can do it twice. Attach an idempotency key derived from the run and step so the side effect happens at most once." },
        { title: 'Memory is an attack surface', body: "Anything written to memory is read back as context later. Never store secrets, store provenance, and treat retrieved memories as untrusted data so a poisoned memory cannot issue instructions." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Approval-gated action', body: 'High-risk tools never execute directly from a model decision.', flow: ['model proposes send_refund(...)', 'risk policy: HIGH', 'checkpoint + pending approval', 'human approves / edits / rejects', 'execute once (idempotency key)', 'resume run'] },
        { kind: 'tip', title: 'Approve the specifics', body: 'Show reviewers the exact tool, arguments and a plain-language preview ("Refund $120.00 to card •••• 4417 for order 9921"), not just "the agent wants to issue a refund".' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'memory_and_approvals.py',
          explanation: 'Runnable, dependency-free: a semantic memory store with relevance retrieval and provenance, an approval gate that pauses high-risk actions and resumes from a checkpoint, and an idempotency layer that turns retried side effects into no-ops. All behaviour is asserted.',
          code: raw`#  HUMAN-IN-THE-LOOP + IDEMPOTENCY
#
#   propose(refund 120) --HIGH risk--> PENDING --approve--> execute(key=run7:step3) -> done
#                                            \--reject---> aborted, nothing executed
#   retry execute(key=run7:step3)  ->  returns the stored result, no second refund
import json
import re
import time

# ---- semantic memory with provenance and relevance retrieval
class Memory:
    def __init__(self):
        self.items = []
    def write(self, fact, source):
        self.items.append({"fact": fact, "source": source, "ts": time.time()})
    def recall(self, query, k=2):
        q = set(re.findall(r"\w+", query.lower()))
        score = lambda m: len(q & set(re.findall(r"\w+", m["fact"].lower())))
        return [m for m in sorted(self.items, key=score, reverse=True)[:k] if score(m) > 0]

mem = Memory()
mem.write("Customer prefers refunds to the original card", source="ticket#88")
mem.write("Customer timezone is Asia/Dhaka", source="profile")
mem.write("Order 9921 arrived damaged", source="ticket#91")
hits = mem.recall("how should we send the refund for order 9921")
assert {h["source"] for h in hits} == {"ticket#88", "ticket#91"}

# ---- idempotent side effects
LEDGER, RESULTS = [], {}
def issue_refund(order, amount, idem_key):
    if idem_key in RESULTS:                     # retry after a timeout: no second refund
        return RESULTS[idem_key]
    LEDGER.append((order, amount))
    RESULTS[idem_key] = {"status": "refunded", "order": order, "amount": amount}
    return RESULTS[idem_key]

# ---- approval gate with a persisted checkpoint
RISK = {"lookup_order": "low", "issue_refund": "high"}
CHECKPOINTS = {}

def propose(run_id, step, tool, args):
    if RISK[tool] == "high":
        CHECKPOINTS[run_id] = json.dumps({"step": step, "tool": tool, "args": args})
        return {"status": "pending_approval", "preview": tool + " " + json.dumps(args)}
    return {"status": "executed"}

def resolve(run_id, approved):
    cp = json.loads(CHECKPOINTS.pop(run_id))     # survives restarts if stored in a database
    if not approved:
        return {"status": "rejected"}
    key = run_id + ":step" + str(cp["step"])
    return issue_refund(**cp["args"], idem_key=key)

assert propose("run7", 1, "lookup_order", {"order": 9921})["status"] == "executed"
p = propose("run7", 3, "issue_refund", {"order": 9921, "amount": 120.0})
assert p["status"] == "pending_approval" and LEDGER == []       # nothing happens before approval
assert resolve("run7", approved=True)["status"] == "refunded"
assert issue_refund(9921, 120.0, idem_key="run7:step3")["status"] == "refunded"   # retried call
assert LEDGER == [(9921, 120.0)]                                  # executed exactly once

propose("run8", 3, "issue_refund", {"order": 5, "amount": 999.0})
assert resolve("run8", approved=False) == {"status": "rejected"} and len(LEDGER) == 1
print("memory:", [h["source"] for h in hits], "| ledger:", LEDGER)`,
        },
        production: {
          language: 'py',
          filename: 'approvals.py',
          explanation: 'Production pattern: a risk policy per tool, pending actions persisted in the database with the full checkpoint, a reviewer endpoint that approves or rejects the exact arguments, resumption of the run, and an idempotency key passed to the payment provider (most payment APIs accept one).',
          code: raw`import json
import uuid
from datetime import datetime, timezone

HIGH_RISK = {"issue_refund", "send_email", "delete_record", "change_role"}

async def handle_tool_call(run, call, db, tools):
    if call["name"] in HIGH_RISK:
        action_id = str(uuid.uuid4())
        await db.execute(
            "INSERT INTO pending_actions (id, run_id, tool, args, checkpoint, status, created_at) "
            "VALUES ($1, $2, $3, $4, $5, 'pending', $6)",
            action_id, run.id, call["name"], json.dumps(call["args"]),
            json.dumps(run.checkpoint()), datetime.now(timezone.utc))
        await notify_reviewers(action_id, preview=describe(call))    # human-readable preview
        return {"paused": True, "action_id": action_id}
    return {"paused": False, "result": await tools[call["name"]](**call["args"])}

async def review(action_id: str, reviewer, approved: bool, db, tools):
    row = await db.fetchrow("SELECT * FROM pending_actions WHERE id = $1 AND status = 'pending' "
                            "FOR UPDATE", action_id)                  # one decision per action
    if row is None:
        raise LookupError("already decided or unknown action")
    if not reviewer.can_approve(row["tool"]):
        raise PermissionError("reviewer lacks approval rights for " + row["tool"])
    status = "approved" if approved else "rejected"
    await db.execute("UPDATE pending_actions SET status = $1, reviewer = $2 WHERE id = $3",
                     status, reviewer.id, action_id)
    result = {"status": "rejected by reviewer"}
    if approved:
        args = json.loads(row["args"])
        result = await tools[row["tool"]](**args, idempotency_key=action_id)   # at-most-once
    run = AgentRun.restore(json.loads(row["checkpoint"]))
    await run.resume(tool_result=result)                              # continue where it paused`,
        },
        bug: {
          explanation:
            'If the payment call times out after the provider has already processed it, a blind retry issues a second refund. Generate one idempotency key per logical action (not per HTTP attempt) and send it with every retry, so the provider returns the original result instead of acting twice.',
          buggy: {
            language: 'py',
            filename: 'refund.py',
            code: raw`# ❌ Each retry is a brand-new refund request
for attempt in range(3):
    try:
        return payments.refund(order_id, amount)          # timeout after success -> refund #2
    except TimeoutError:
        continue`,
          },
          fixed: {
            language: 'py',
            filename: 'refund.py',
            code: raw`# ✅ One key per logical action, reused across retries
key = f"refund:{run_id}:{step}"                          # stable for this action
for attempt in range(3):
    try:
        return payments.refund(order_id, amount, idempotency_key=key)
    except TimeoutError:
        await asyncio.sleep(2 ** attempt)                # backoff, same key
raise RuntimeError("refund status unknown; reconcile with key " + key)`,
          },
        },
      },
      takeaways: [
        'Separate working, episodic, semantic and procedural memory; store provenance; let users correct it.',
        'High-risk tools pause for human approval of the exact arguments, with a durable checkpoint.',
        'Use one idempotency key per logical side effect so retries never act twice.',
        'Treat stored memories as untrusted data; never store secrets.',
        'Practice drill: in Tab 1, add a "send_email" tool marked high risk and show that rejecting it leaves the outbox empty while approving and then retrying sends exactly one email.',
      ],
    },
  ],
};
