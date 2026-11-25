import type { DatabaseSync } from "node:sqlite";
import { keyedChanges, limitChanged, measureChanged } from "./change-words.mts";
import type { GoalContent } from "./goals";

export interface ChangeElement {
  kind: "limit" | "dependency" | "measure" | "field";
  element_key: string;
  change: "added" | "removed" | "changed";
}

type Content = Pick<GoalContent, "title" | "status" | "anchors" | "limits" | "measures" | "depends_on">;
const fieldKeys = ["title", "status", "anchors"] as const;

/** Only keys touched by the revision, using the same identities as the decision diff. */
export function changedElements(base: Content, changes: Partial<Content>): ChangeElement[] {
  const out: ChangeElement[] = [];
  for (const field of fieldKeys) {
    if (changes[field] !== undefined && JSON.stringify(changes[field]) !== JSON.stringify(base[field])) {
      out.push({ kind: "field", element_key: field, change: "changed" });
    }
  }
  const id = (item: { id: string }) => item.id;
  for (const { before, after, change } of keyedChanges(base.measures, changes.measures ?? base.measures, id, measureChanged)) {
    out.push({ kind: "measure", element_key: (after ?? before)!.id, change });
  }
  for (const { before, after, change } of keyedChanges(base.limits, changes.limits ?? base.limits, id,
    limitChanged)) {
    out.push({ kind: "limit", element_key: (after ?? before)!.id, change });
  }
  for (const { before, after, change } of keyedChanges(base.depends_on, changes.depends_on ?? base.depends_on, (key) => key, () => false)) {
    out.push({ kind: "dependency", element_key: (after ?? before)!, change });
  }
  return out;
}

export const INSERT_CHANGE_ELEMENT = `INSERT INTO v2_change_request_elements
  (ws_id, goal_id, change_request_id, revision, kind, element_key, change) VALUES (?, ?, ?, ?, ?, ?, ?)`;

/** Called by the migration before it commits. Count a missing base without inventing its contents. */
export function backfillChangeElements(db: DatabaseSync): number {
  const rows = db.prepare(`
    SELECT r.ws_id, r.goal_id, v.change_request_id, v.revision, v.changes_json,
      CASE WHEN b.version IS NOT NULL THEN json_object(
        'title', b.title, 'status', b.status, 'anchors', json(b.anchors_json), 'measures', json(b.measures_json),
        'limits', json(b.limits_json), 'depends_on', json(b.depends_on_json)
      ) END AS base_json
    FROM v2_change_request_revisions v
    JOIN v2_change_requests r ON r.ws_id = v.ws_id AND r.id = v.change_request_id
    LEFT JOIN v2_goal_versions b ON b.ws_id = r.ws_id AND b.goal_id = r.goal_id AND b.version = v.base_version`);
  const insert = db.prepare(INSERT_CHANGE_ELEMENT);
  let skipped = 0;
  for (const row of rows.all()) {
    const { ws_id, goal_id, change_request_id, revision, changes_json, base_json } = row;
    if (typeof base_json !== "string") {
      skipped++;
      continue;
    }
    for (const item of changedElements(JSON.parse(base_json), JSON.parse(String(changes_json)))) {
      insert.run(ws_id, goal_id, change_request_id, revision, item.kind, item.element_key, item.change);
    }
  }
  return skipped;
}
