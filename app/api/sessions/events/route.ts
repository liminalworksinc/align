import path from "node:path";
import { handle } from "@/lib/http";
import { scheduleMapping } from "@/lib/mapper";
import { markActed } from "@/lib/directives";
import { HttpError, mutate, now } from "@/lib/store";
import type { AgentSession, SessionOriginKind } from "@/lib/types";

// Ingest for local agent hooks (scripts/align-capture.mjs). No session cookie: hooks run on this machine.
// Browsers always send Origin on cross-site POSTs, so any non-localhost Origin is refused.

const MAX_BODY = 16 * 1024;
const MAX_TEXT = 1000;
const MAX_FILES = 50;
const MAX_PROMPTS = 200;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

interface CaptureEvent {
  harness?: unknown;
  session_id?: unknown;
  hook_event?: unknown;
  cwd?: unknown;
  prompt?: unknown;
  tool_name?: unknown;
  file_path?: unknown;
  command?: unknown;
  last_message?: unknown;
  branch?: unknown;
  repo?: unknown;
}

function assertLocalOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  let host = "";
  try {
    host = new URL(origin).hostname;
  } catch {
    // "null" or malformed origins are not local.
  }
  if (!LOCAL_HOSTS.has(host)) throw new HttpError(403, "Capture events are accepted from this machine only");
}

async function readCapped(req: Request): Promise<string> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY) throw new HttpError(413, "Event too large");
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(413, "Event too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Defense in depth: the hook already redacts, but anything can POST here.
const SECRETS: [RegExp, string][] = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]"],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, "[redacted]"],
  [/\bvck_[A-Za-z0-9]{8,}/g, "[redacted]"],
  [/\bgh[pousr]_[A-Za-z0-9]{16,}/g, "[redacted]"],
  [/\bgithub_pat_[A-Za-z0-9_]{16,}/g, "[redacted]"],
  [/\bAKIA[0-9A-Z]{12,}/g, "[redacted]"],
  [/\bxox[abprs]-[A-Za-z0-9-]{8,}/g, "[redacted]"],
  [/\b[0-9a-fA-F]{32,}\b/g, "[redacted]"],
];

function clean(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  let out = v.trim();
  if (!out) return undefined;
  for (const [re, rep] of SECRETS) out = out.replace(re, rep);
  out = out.replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, (run) => {
    if (!/[0-9]/.test(run) || !/[A-Z]/.test(run) || !/[a-z]/.test(run)) return run;
    return Math.max(...run.split("/").map((s) => s.length)) >= 20 ? "[redacted]" : run;
  });
  return out.length > MAX_TEXT ? `${out.slice(0, MAX_TEXT)}…` : out;
}

const shortName = (v: unknown, max = 120) => (typeof v === "string" ? path.basename(v.trim()).slice(0, max) : "");

/** Repo-relative path; never a full home-directory path. */
function repoPath(file: string, repo: string): string {
  let p = file.replace(/\\/g, "/").replace(/^\.\//, "");
  if (p.startsWith("/") || /^[A-Za-z]:\//.test(p) || p.startsWith("~")) {
    const marker = repo ? `/${repo}/` : "";
    const at = marker ? p.lastIndexOf(marker) : -1;
    p = at >= 0 ? p.slice(at + marker.length) : path.posix.basename(p);
  }
  return p.slice(0, 300);
}

// Common uppercase-hyphen-number tokens that are not tracker ids.
const NOT_LINEAR = new Set(["UTF", "SHA", "ISO", "RFC", "HTTP", "TLS", "SSL", "AES", "RSA", "CVE", "GPT", "ECMA", "IPV", "MD", "ES", "WCAG", "PEP", "CWE"]);

function detectOrigin(text: string, isBranch: boolean): AgentSession["origin"] | null {
  if (/\balign push\b/i.test(text) || /\bcompany goal v\d/i.test(text)) return { kind: "align-push", ref: "align push" };
  const goal = text.match(/\bg-(?:ceo|product|security)-v\d+(?:_\d+)?\b/);
  if (goal) return { kind: "align-push", ref: goal[0] };
  const linearRe = isBranch ? /\b([A-Za-z]{2,6})-(\d{1,5})\b/g : /\b([A-Z]{2,6})-(\d{1,5})\b/g;
  for (const m of text.matchAll(linearRe)) {
    const team = m[1].toUpperCase();
    if (!NOT_LINEAR.has(team)) return { kind: "linear", ref: `${team}-${m[2]}` };
  }
  const gh = text.match(/github\.com\/([\w.-]+)\/([\w.-]+)\/(?:issues|pull)\/(\d+)/i);
  if (gh) return { kind: "github", ref: `${gh[1]}/${gh[2]}#${gh[3]}` };
  const slack = text.match(/https?:\/\/[\w.-]*slack\.com\/archives\/[\w/.-]+/i);
  if (slack) return { kind: "slack", ref: slack[0] };
  return null;
}

function originFor(texts: string[], branch: string): AgentSession["origin"] {
  for (const t of texts) {
    const o = detectOrigin(t, false);
    if (o) return o;
  }
  return (branch && detectOrigin(branch, true)) || { kind: "ad-hoc" as SessionOriginKind };
}

export async function POST(req: Request) {
  return handle(async () => {
    assertLocalOrigin(req);
    let ev: CaptureEvent;
    try {
      ev = JSON.parse(await readCapped(req)) as CaptureEvent;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(400, "Body must be JSON");
    }
    if (!ev || typeof ev !== "object") throw new HttpError(400, "Body must be a JSON object");

    const harness = ev.harness === "codex" ? "codex" : ev.harness === "claude-code" ? "claude-code" : null;
    if (!harness) throw new HttpError(400, "harness must be claude-code or codex");
    const sessionId = typeof ev.session_id === "string" ? ev.session_id.trim() : "";
    if (!/^[\w.:-]{1,128}$/.test(sessionId)) throw new HttpError(400, "Invalid session_id");

    const hookEvent = typeof ev.hook_event === "string" ? ev.hook_event.slice(0, 40) : "";
    const prompt = clean(ev.prompt);
    const command = clean(ev.command);
    const lastMessage = clean(ev.last_message);
    const toolName = typeof ev.tool_name === "string" ? ev.tool_name.trim().slice(0, 60) : "";
    const repo = shortName(ev.repo);
    const branch = typeof ev.branch === "string" ? ev.branch.trim().slice(0, 200) : "";
    const cwdName = shortName(ev.cwd);
    const filePath = clean(ev.file_path);
    const id = `${harness}:${sessionId}`;

    const scenario = await mutate((s) => {
      const at = now();
      let sess = s.sessions.find((x) => x.id === id);
      if (!sess) {
        sess = {
          id,
          harness,
          session_id: sessionId,
          repo: repo || cwdName,
          branch,
          cwd_name: cwdName,
          prompts: [],
          files: [],
          tools: [],
          origin: { kind: "ad-hoc" },
          started_at: at,
          last_at: at,
        };
        s.sessions.push(sess);
      }
      if (repo) sess.repo = repo;
      if (branch) sess.branch = branch;
      if (cwdName) sess.cwd_name = cwdName;
      sess.last_at = at;

      if (prompt && sess.prompts[sess.prompts.length - 1]?.text !== prompt) {
        sess.prompts.push({ at, text: prompt });
        if (sess.prompts.length > MAX_PROMPTS) sess.prompts.splice(0, sess.prompts.length - MAX_PROMPTS);
      }
      if (filePath) {
        const rel = repoPath(filePath, sess.repo);
        if (rel && !sess.files.includes(rel) && sess.files.length < MAX_FILES) sess.files.push(rel);
      }
      if (toolName && !sess.tools.includes(toolName)) sess.tools.push(toolName);
      if (lastMessage) sess.last_message = lastMessage;
      // A replan was acted on when the agent reads the accepted plan or runs it after a delivered directive.
      if (/align_get_accepted_plan/.test(String(toolName ?? "")) || /run-plan\.sh accepted/.test(String(command ?? ""))) markActed(sess);

      if (hookEvent === "Stop" || hookEvent === "SessionEnd") sess.ended_at = at;
      else if (hookEvent === "UserPromptSubmit" || hookEvent === "SessionStart") delete sess.ended_at; // resumed

      if (sess.origin.kind === "ad-hoc") {
        const texts = sess.prompts.map((p) => p.text);
        if (command) texts.push(command);
        sess.origin = originFor(texts, sess.branch);
      }
      return { scenario: s.scenario };
    });

    scheduleMapping(id, scenario);
    return { ok: true, id };
  });
}
