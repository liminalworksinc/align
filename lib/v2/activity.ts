import { all, run, tx } from "./db";
import { badRequest } from "./errors";
import { nowIso } from "./ids";
import { goalObj, goalRow } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { openEpoch, sessionRow } from "./sessions";
import type { DevicePrincipal } from "./devices";
import { need } from "./workspaces";
import { SESSION_KEY_RE, type Body } from "./validate";

// In-flight work signals: what a shared session is editing, committing, working on or claiming, so agents toward
// related goals can avoid overlapping work. Deterministic metadata from the user's own hooks, kept 24 hours (claims
// 1 hour). Repo-relative paths and text arrive only when the user turned on "share work signals"; otherwise only keyed
// hashes, which still tell two sessions they touched the same file. docs/v2/WIRE.md "Activity".

const KINDS = ["edit", "commit", "task", "claim"] as const;
type Kind = (typeof KINDS)[number];
const HEX = /^[a-f0-9]{16,64}$/;
const HOUR = 3_600_000;
const MAX_ITEMS = 200;

interface ActivityRow {
  seq: number;
  session_key: string;
  user_id: string;
  goal_id: string | null;
  repo_id: string;
  kind: Kind;
  path_hash: string | null;
  path: string | null;
  text: string | null;
  at: string;
  expires_at: string;
  harness: string;
  name: string;
}

function relPath(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" || !v || v.length > 300 || v.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(v) || /[\u0000-\u001f]/.test(v)) {
    throw badRequest("path must be a repo-relative path");
  }
  return v;
}

function shortText(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw badRequest("text must be a string");
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return t ? t.slice(0, 120) : null;
}

/** A batch of this device's activity for its own shared sessions. Unknown or foreign sessions are skipped. */
export async function ingestActivity(pp: PolicyPrincipal, dev: DevicePrincipal, b: Body) {
  need(pp, "session.share");
  const items = b.items;
  if (!Array.isArray(items)) throw badRequest("items must be a list");
  if (items.length > MAX_ITEMS) throw badRequest(`items: at most ${MAX_ITEMS}`);
  const now = Date.now();
  let accepted = 0;
  await tx(() => {
    for (const raw of items) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw badRequest("each item must be an object");
      const it = raw as Body;
      const key = typeof it.session_key === "string" && SESSION_KEY_RE.test(it.session_key) ? it.session_key : null;
      if (!key) throw badRequest("session_key is invalid");
      const kind = it.kind as Kind;
      if (!KINDS.includes(kind)) throw badRequest("kind must be edit, commit, task or claim");
      const at = typeof it.at === "string" ? Date.parse(it.at) : NaN;
      if (!Number.isFinite(at)) throw badRequest("at must be an ISO time");
      if (typeof it.repo_id !== "string" || !HEX.test(it.repo_id)) throw badRequest("repo_id must be a hex hash");
      const pathHash = it.path_hash === undefined || it.path_hash === null ? null : typeof it.path_hash === "string" && HEX.test(it.path_hash) ? it.path_hash : null;
      if (it.path_hash != null && !pathHash) throw badRequest("path_hash must be a hex hash");
      const path = relPath(it.path);
      const text = shortText(it.text);
      if (at > now + 5 * 60_000 || at < now - 24 * HOUR) continue;
      const s = sessionRow(pp.wsId, key);
      if (!s || s.device_id !== dev.deviceId || s.state !== "shared") continue;
      const life = kind === "claim" ? HOUR : 24 * HOUR;
      run(
        `INSERT INTO v2_activity (ws_id, session_key, user_id, goal_id, repo_id, kind, path_hash, path, text, at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        pp.wsId,
        key,
        s.user_id,
        openEpoch(pp.wsId, key)?.goal_id ?? null,
        it.repo_id,
        kind,
        pathHash,
        path,
        text,
        new Date(at).toISOString(),
        new Date(at + life).toISOString(),
      );
      accepted++;
    }
    run("DELETE FROM v2_activity WHERE ws_id = ? AND expires_at < ?", pp.wsId, nowIso());
  });
  return { accepted };
}

/** Unexpired activity after `after` (a seq cursor) on goals this caller may read; unbound sessions only their own. */
export function activityFor(pp: PolicyPrincipal, after: number) {
  need(pp, "workspace.read");
  const rows = all<ActivityRow>(
    `SELECT a.seq, a.session_key, a.user_id, a.goal_id, a.repo_id, a.kind, a.path_hash, a.path, a.text, a.at, a.expires_at, s.harness, u.name
     FROM v2_activity a JOIN v2_sessions s ON s.ws_id = a.ws_id AND s.session_key = a.session_key JOIN ba_user u ON u.id = a.user_id
     WHERE a.ws_id = ? AND a.seq > ? AND a.expires_at > ? ORDER BY a.seq LIMIT 500`,
    pp.wsId,
    after,
    nowIso(),
  );
  const readable = new Map<string, boolean>();
  const canSee = (goalId: string | null, userId: string) => {
    if (!goalId) return userId === pp.userId;
    if (!readable.has(goalId)) {
      const g = goalRow(pp.wsId, goalId);
      readable.set(goalId, !!g && canReadGoal(pp, goalObj(g)));
    }
    return readable.get(goalId)!;
  };
  const items = rows
    .filter((r) => canSee(r.goal_id, r.user_id))
    .map((r) => ({
      seq: r.seq,
      session_key: r.session_key,
      harness: r.harness,
      user: { id: r.user_id, name: r.name },
      mine: r.user_id === pp.userId,
      goal_id: r.goal_id,
      repo_id: r.repo_id,
      kind: r.kind,
      path_hash: r.path_hash,
      path: r.path,
      text: r.text,
      at: r.at,
      expires_at: r.expires_at,
    }));
  return { cursor: rows.length ? rows[rows.length - 1].seq : after, items };
}
