// Local migrations of ~/.align/align.db that need more than a new column (`ADDED_COLUMNS` in db.ts): each runs once, in
// order, at the first command or sync pass of a newer agent (`PRAGMA user_version` counts those applied). Hooks never
// open the database, so they see the result in the hot files this rewrites.
import type { Ctx } from "./context.ts";
import { tx } from "./db.ts";
import { ACCESS_LOST, DEVICE_SIGNED_OUT, getShare, renderHot, stoppedByPerson } from "./hot.ts";
import { clean } from "./shared/envelope.ts";
import { storedText, type ShareFacts } from "./shared/ended.ts";
import { isShareStateNotice, noticeKind } from "./shared/notices.ts";
import type { GoalSnapshot } from "./shared/types.ts";

/** Each returns the sessions whose hot files it changed. Append only: index i is user_version i+1. */
const MIGRATIONS: ((ctx: Ctx) => string[])[] = [
  // 1 (E2E-AGENT cycle 12 C12-1): notices about a share's state stored as words by an agent from before they were worded
  // when shown.
  legacyShareNotices,
];

const version = (ctx: Ctx): number => Number((ctx.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version) || 0;

/** Apply the local migrations not applied yet, in one transaction, then rewrite the hot files they touched. */
export function migrateLocal(ctx: Ctx): void {
  if (version(ctx) >= MIGRATIONS.length) return;
  const touched = tx(ctx.db, () => {
    const lids = new Set<string>();
    // Read again under the write lock: another process may have applied them meanwhile.
    for (let i = version(ctx); i < MIGRATIONS.length; i++) {
      for (const lid of MIGRATIONS[i](ctx)) lids.add(lid);
      ctx.db.exec(`PRAGMA user_version=${i + 1}`);
    }
    return [...lids];
  });
  for (const lid of touched) renderHot(ctx, lid);
  if (touched.length) ctx.log(`local migration: notices about the share state of ${touched.length} session(s) are worded when shown from now on`);
}

/**
 * Notices about a share's state that an older agent stored with their words from the time of the event and no facts
 * (`notices.facts` NULL): shown word for word, they could say to run `align login` while signed in, or name a way out
 * the deny no longer gives, and were never corrected (E2E-AGENT cycle 12 C12-1). Each gets the facts its kind and the
 * session's share say (or goes, when they say nothing that still holds), the stored text an older hook can show at any
 * time (`storedText`), and a new id, unseen, so the session's next prompt tells it worded from the state then, or holds
 * it back while the ended shares are unread since a sign-in, whatever the older hook told before.
 */
function legacyShareNotices(ctx: Ctx): string[] {
  const rows = ctx.db.prepare("SELECT rowid AS rid, id, local_id, text FROM notices WHERE facts IS NULL ORDER BY created_at, rowid").all() as {
    rid: number;
    id: string;
    local_id: string;
    text: string;
  }[];
  const lids = new Set<string>();
  for (const r of rows) {
    const kind = noticeKind(r.id);
    if (!isShareStateNotice(kind)) continue;
    lids.add(r.local_id);
    const facts = legacyFacts(ctx, r.local_id, kind, r.text);
    if (!facts) {
      ctx.db.prepare("DELETE FROM notices WHERE rowid=?").run(r.rid);
      continue;
    }
    ctx.db.prepare("UPDATE notices SET id=?, text=?, facts=? WHERE rowid=?").run(`${r.id}_worded`, storedText(facts), JSON.stringify(facts), r.rid);
  }
  return [...lids];
}

/** What happened, as an older agent's notice of kind `kind` (its id without the session) and the share it is about say. */
function legacyFacts(ctx: Ctx, lid: string, kind: string, text: string): ShareFacts | null {
  const s = getShare(ctx, lid);
  if (!s) return null;
  const g = s.goal_json ? (JSON.parse(s.goal_json) as GoalSnapshot) : null;
  const base = { ws: clean(s.workspace_name, 80), goal: g ? clean(g.title, 100) : null };
  if (kind.startsWith("share_started_")) return { e: "started", ...base, text };
  if (kind.startsWith("share_err_")) return { e: "share_err", ...base, goal: null, text };
  if (kind.startsWith("upload_refused_signed_out_")) return { e: "server_signed_out", ...base };
  if (kind.startsWith("access_lost_rejoined_")) return { e: "removed", ...base };
  if (kind.startsWith("access_lost_")) return { e: "access_lost", ...base };
  if (kind.startsWith("signed_out_")) return { e: "signed_out", ...base };
  // An older agent's "can be shared again" notice: about the end the share had, which its words now follow.
  if (kind.startsWith("signed_in_") || kind.startsWith("workspace_back_")) {
    return s.error === DEVICE_SIGNED_OUT ? { e: "signed_out", ...base } : s.error === ACCESS_LOST ? { e: "access_lost", ...base } : null;
  }
  // Stopped by its person (Stop sharing on the web, heard from the directives answer or a refused upload), or an older
  // server's refusal, whose words say what happened.
  if (stoppedByPerson(ctx, lid)) return { e: "stopped_on_web", ...base };
  if (kind.startsWith("upload_refused_")) return { e: "upload_refused", ...base, goal: null, text };
  return null;
}
