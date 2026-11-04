// The sync pass's part of allocation: report steering lines the hooks showed, and compute (locally, never uploaded)
// how much of this machine's agent time was outside shared sessions, for the hooks' once-a-week note.
import fs from "node:fs";
import type { Ctx } from "./context.ts";
import { api } from "./api.ts";
import { kvGet, kvSet } from "./db.ts";
import { readJson, writeJsonAtomic } from "./shared/fsx.ts";
import { layout } from "./shared/layout.ts";
import { listSteering, type QueuedSteering, type UnsharedDigest } from "./shared/steering.ts";

const DAY = 86_400_000;
const BATCH = 100;

/** Report queued steering lines. A line whose session never got shared is dropped after a day; a rejected batch is
 *  dropped (it would be rejected again); a network failure keeps the files for the next pass. */
export async function uploadSteering(ctx: Ctx): Promise<number> {
  const files = listSteering(ctx.home);
  if (!files.length) return 0;
  const byWs = new Map<string, { file: string; e: QueuedSteering & { session_key: string } }[]>();
  for (const file of files) {
    const e = readJson<QueuedSteering>(file);
    if (!e) {
      fs.rmSync(file, { force: true });
      continue;
    }
    const share = ctx.db.prepare("SELECT session_key, state FROM shares WHERE local_id=? AND workspace_id=?").get(e.local_id, e.workspace_id) as { session_key: string; state: string } | undefined;
    if (!share || share.state !== "shared") {
      if (Date.now() - Date.parse(e.at) > DAY) fs.rmSync(file, { force: true });
      continue;
    }
    const list = byWs.get(e.workspace_id) ?? [];
    list.push({ file, e: { ...e, session_key: share.session_key } });
    byWs.set(e.workspace_id, list);
  }
  let sent = 0;
  for (const [ws, list] of byWs) {
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);
      const events = chunk.map(({ e }) => ({ session_key: e.session_key, goal_id: e.goal_id, suggested_goal_id: e.suggested_goal_id, share: e.share, target: e.target, at: e.at }));
      const r = await api(ctx, "POST", `/api/v2/workspaces/${encodeURIComponent(ws)}/steering`, { body: { events } }).catch(() => null);
      if (!r || r.status >= 500 || r.status === 401) return sent; // try again next pass
      for (const c of chunk) fs.rmSync(c.file, { force: true });
      if (r.status >= 200 && r.status < 300) sent += chunk.length;
    }
  }
  return sent;
}

const fresh = "(input + output + cache_write_5m + cache_write_1h + cache_write_unsplit)";

/** Agent time (fresh tokens) on this machine in the last 7 days, and the part in sessions not shared toward a goal,
 *  grouped by folder. Recomputed at most every 6 hours. Stays in ALIGN_HOME. */
export function computeUnsharedDigest(ctx: Ctx, now = Date.now(), force = false): UnsharedDigest | null {
  const last = Number(kvGet(ctx.db, "unshared_digest_at") || 0);
  if (!force && now - last < 6 * 3600_000) return readJson<UnsharedDigest>(layout.unsharedDigest(ctx.home));
  const since = new Date(now - 7 * DAY).toISOString();
  const rows = ctx.db
    .prepare(
      `SELECT s.local_id, s.cwd, COALESCE(SUM(${fresh}), 0) AS tokens,
              (SELECT state FROM shares sh WHERE sh.local_id = s.local_id) AS share_state
       FROM requests r JOIN sessions s ON s.local_id = r.local_id
       WHERE COALESCE(r.ts, r.created_at) >= ?
       GROUP BY s.local_id`,
    )
    .all(since) as { local_id: string; cwd: string | null; tokens: number; share_state: string | null }[];
  const total = rows.reduce((a, r) => a + r.tokens, 0);
  const byDir = new Map<string, number>();
  let unshared = 0;
  for (const r of rows) {
    if (r.share_state === "shared" || r.share_state === "pending") continue;
    unshared += r.tokens;
    const dir = r.cwd || "(unknown folder)";
    byDir.set(dir, (byDir.get(dir) ?? 0) + r.tokens);
  }
  const top = [...byDir.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([dir, tokens]) => ({ dir, tokens }));
  const d: UnsharedDigest = { computed_at: new Date(now).toISOString(), total_tokens: total, unshared_tokens: unshared, share: total ? Math.round((unshared / total) * 1000) / 10 : 0, top };
  writeJsonAtomic(layout.unsharedDigest(ctx.home), d);
  kvSet(ctx.db, "unshared_digest_at", String(now));
  return d;
}
