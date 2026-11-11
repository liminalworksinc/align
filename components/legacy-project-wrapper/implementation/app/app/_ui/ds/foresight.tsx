"use client";
import { useEffect, useState } from "react";
import { ApiError, api, sentence } from "../kit";
import type { ChangeFields } from "../types";
import { Compare } from "./compare";

// Approve with foresight (Lane B): what a decision will do, shown in its confirmation above the Confirm button.
// POST …/change-requests/<id>/preview (lib/v2/foresight.ts) runs the decision's own code and rolls it back: nothing is
// recorded and nothing is sent. Each line can open: a goal's before and after (Compare), or the goals and figures behind
// a count. A decision that reaches no agent and moves no spend says so in one line. The preview is a forecast of the
// request as it stands when it was read; the send still reads the request again and the server checks every rule again.

export type ForesightChoice = "approve_and_launch" | "approve" | "launch" | "reject" | "withdraw";
export const FORESIGHT_CHOICES: readonly string[] = ["approve_and_launch", "approve", "launch", "reject", "withdraw"];

interface Line {
  kind: "agents" | "pause" | "goal" | "dependents" | "spend" | "requests" | "record";
  text: string;
  compare?: { before: ChangeFields; after: ChangeFields; before_label: string; after_label: string; hidden: { before: number; after: number } };
  detail?: string[];
}
interface Foresight {
  quiet: boolean;
  lines: Line[];
  titles: Record<string, string>;
  held_back: { events: number; mail: number };
}

const LEAD: Record<ForesightChoice, string> = {
  approve_and_launch: "If you approve and launch:",
  approve: "If you approve:",
  launch: "If you launch:",
  reject: "If you decline:",
  withdraw: "If you withdraw:",
};

/** The forecast for `choice` with `body` (what Confirm would send) on the request at `path`. */
export function ForesightPanel({ path, choice, body }: { path: string; choice: ForesightChoice; body: Record<string, unknown> }) {
  const key = JSON.stringify([path, choice, body]);
  const [state, setState] = useState<{ key: string; f?: Foresight; err?: string } | null>(null);
  useEffect(() => {
    let live = true;
    api<Foresight>(`${path}/preview`, { body: { action: choice, ...body } })
      .then((f) => live && setState({ key, f }))
      .catch((e) => live && setState({ key, err: e instanceof ApiError && e.status !== 0 && e.status < 500 ? sentence(e.message) : "Align couldn't work out what this would do right now. Nothing was recorded." }));
    return () => {
      live = false;
    };
    // `key` covers path, choice and body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const now = state?.key === key ? state : null;
  const titleOf = (id: string) => now?.f?.titles[id] ?? "A goal you can't see";
  const effects = now?.f?.lines.filter((l) => l.kind !== "record") ?? [];
  const record = now?.f?.lines.find((l) => l.kind === "record");

  return (
    <section data-foresight={choice} aria-live="polite" aria-busy={!now} className="flex min-w-0 flex-col gap-1.5 rounded-(--radius-s) border border-(--line) bg-(--bg-inset) px-3 py-2.5">
      <h5 className="text-[13px] font-medium text-(--text-2)">{LEAD[choice]}</h5>
      {!now && <p className="text-[14px] text-(--text-3)">Working out what this would do…</p>}
      {now?.err && (
        <p data-foresight-error className="text-[14px] text-(--text-2) [overflow-wrap:anywhere]">
          {now.err}
        </p>
      )}
      {now?.f && (
        <ul className="flex min-w-0 flex-col gap-1">
          {now.f.quiet && (
            <li data-foresight-line="quiet" className="pl-[18px] text-[14px] text-(--text-1)">
              Nothing changes for agents or spend.
            </li>
          )}
          {effects.map((l, i) => (
            <li key={i} data-foresight-line={l.kind} className="min-w-0 text-[14px] text-(--text-1)">
              {l.compare || l.detail?.length ? (
                <details className="group/fl min-w-0">
                  <summary className="flex min-h-[32px] cursor-pointer list-none items-start gap-1.5 rounded-(--radius-s) [overflow-wrap:anywhere] max-sm:min-h-[44px] max-sm:items-center [&::-webkit-details-marker]:hidden">
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mt-[5px] shrink-0 text-(--text-3) group-open/fl:rotate-90 max-sm:mt-0 motion-safe:transition-transform">
                      <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
                    </svg>
                    <span className="min-w-0 underline decoration-(--line-strong) underline-offset-4">{l.text}</span>
                  </summary>
                  <div className="mt-1.5 mb-1 flex min-w-0 flex-col gap-1.5 pl-[18px]">
                    {l.compare && <Compare before={l.compare.before} after={l.compare.after} beforeLabel={l.compare.before_label} afterLabel={l.compare.after_label} hidden={l.compare.hidden} titleOf={titleOf} />}
                    {l.detail?.map((d) => (
                      <p key={d} className="text-[13px] text-(--text-2) [overflow-wrap:anywhere]">
                        {d}
                      </p>
                    ))}
                  </div>
                </details>
              ) : (
                <span className="block pl-[18px] [overflow-wrap:anywhere]">{l.text}</span>
              )}
            </li>
          ))}
          {record && (
            <li data-foresight-line="record" className="pt-0.5 pl-[18px] text-[13px] text-(--text-2)">
              {record.text}.
            </li>
          )}
        </ul>
      )}
      {now?.f && <p className="text-[12.5px] text-(--text-3)">A forecast: nothing has been recorded or sent yet.</p>}
    </section>
  );
}
