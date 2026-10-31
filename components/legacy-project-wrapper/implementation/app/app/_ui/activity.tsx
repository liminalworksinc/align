"use client";
import { Card, Note, Pill, useApi, when } from "./kit";
import type { Me } from "./server";
import type { Goal } from "./types";

// The goal page's "Agent activity" card (PORT-003): sessions shared toward the goal in the last 14 days, how many are
// active now, by harness, the last activity, and (for its owner, its team and workspace owners) the files and the
// reader's own sessions. From bindings, usage times and work signals, never from what agents wrote
// (GET .../goals/<goal>/activity).

interface Activity {
  window_days: number;
  sessions: number;
  active_now: number;
  by_harness: { "claude-code": number; codex: number };
  last_activity_at: string | null;
  detail: {
    files: string[];
    files_hidden: number;
    mine: { session_key: string; harness: "claude-code" | "codex"; state: string; last_activity_at: string | null }[];
  } | null;
}

const HARNESS = { "claude-code": "Claude Code", codex: "Codex" } as const;

export function GoalActivityCard({ ws, goal, me }: { ws: string; goal: Goal; me: Me }) {
  void me;
  const d = useApi<Activity>(`/api/v2/workspaces/${ws}/goals/${goal.id}/activity`);
  const a = d.data;
  if (!a) return null;
  const harnesses = (Object.keys(HARNESS) as (keyof typeof HARNESS)[]).filter((h) => a.by_harness[h] > 0).map((h) => `${a.by_harness[h]} ${HARNESS[h]}`);
  return (
    <Card title="Agent activity">
      <div id="goal-activity">
        <p className="mb-2 text-[14px] text-zinc-500">Sessions people shared toward this goal, last {a.window_days} days. Counts come from bindings, not from what agents wrote.</p>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[15px]">
          <dt className="text-zinc-500">Sessions</dt>
          <dd className="text-zinc-900">
            {a.sessions}
            {harnesses.length > 0 && <span className="text-zinc-500"> ({harnesses.join(", ")})</span>}
          </dd>
          <dt className="text-zinc-500">Active now</dt>
          <dd className="text-zinc-900">{a.active_now}</dd>
          <dt className="text-zinc-500">Last activity</dt>
          <dd className="text-zinc-900">{a.last_activity_at ? when(a.last_activity_at) : "None yet"}</dd>
        </dl>
        {a.detail && (
          <>
            {(a.detail.files.length > 0 || a.detail.files_hidden > 0) && (
              <div className="mt-3">
                <p className="text-[14px] text-zinc-500">Files agents are working on</p>
                <ul className="list-disc pl-5 font-mono text-[13px] text-zinc-700 [overflow-wrap:anywhere]">
                  {a.detail.files.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                {a.detail.files_hidden > 0 && <p className="text-[13px] text-zinc-500">and {a.detail.files_hidden} more whose paths aren&apos;t shared</p>}
              </div>
            )}
            {a.detail.mine.length > 0 && (
              <div className="mt-3">
                <p className="text-[14px] text-zinc-500">Your sessions</p>
                {a.detail.mine.map((s) => (
                  <p key={s.session_key} className="text-[14px] text-zinc-700">
                    {HARNESS[s.harness]} <Pill tone={s.state === "shared" ? "green" : s.state === "suspended" ? "amber" : "neutral"}>{s.state}</Pill> {s.last_activity_at ? `last ${when(s.last_activity_at)}` : ""}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
        {a.sessions === 0 && <Note>No shared sessions worked toward this goal in the last {a.window_days} days.</Note>}
      </div>
    </Card>
  );
}
