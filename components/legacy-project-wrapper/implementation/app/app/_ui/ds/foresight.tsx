"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError, api, sentence } from "../kit";
import { useLiveReload } from "../live";
import type { ChangeFields } from "../types";
import { Compare } from "./compare";

// Approve with foresight (Lane B): what a decision will do, shown in its confirmation above the Confirm button.
// POST …/change-requests/<id>/preview (lib/v2/foresight.ts) runs the decision's own code and rolls it back: nothing is
// recorded and nothing is sent. Each line can open: a goal's before and after (Compare), or the goals and figures behind
// a count. A decision that reaches no agent and moves no spend says so in one line. The send still reads the request
// again and the server checks every rule again.
// LIM-2514: the forecast follows the workspace while it is open. When the workspace's requests, goals or sessions move
// (the live stream, LIM-2503), it is read again, at most once every 5 seconds (the server allows 30 a minute). A re-read
// keeps the last forecast on screen; if the answer differs, the panel says it was updated and marks the lines that
// changed. A failed read offers Try again, and a failed re-read keeps the last forecast and says what time it shows.

export type ForesightChoice = "approve_and_launch" | "approve" | "launch" | "reject" | "withdraw";
export const FORESIGHT_CHOICES: readonly string[] = ["approve_and_launch", "approve", "launch", "reject", "withdraw"];

/** Re-reads triggered by the workspace moving are at least this far apart. */
const REREAD_MS = 5000;

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

const lineKey = (l: Line) => `${l.kind}|${l.text}`;
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** What the panel shows for one decision: the last forecast it got, when, and what changed in the last re-read. */
interface Shown {
  scope: string;
  f: Foresight;
  at: number;
  /** Set once a re-read gave a different forecast: when, and the lines that are new in it. */
  updated: { at: number; lines: Set<string> } | null;
}

/** The forecast for `choice` with `body` (what Confirm would send) on the request at `path` in workspace `ws`. */
export function ForesightPanel({ ws, path, choice, body }: { ws: string; path: string; choice: ForesightChoice; body: Record<string, unknown> }) {
  // The decision being forecast. A new body (a new revision of the request) is a re-read of the same decision.
  const scope = JSON.stringify([path, choice]);
  const want = JSON.stringify(body);
  const [tick, setTick] = useState(0);
  const [shown, setShown] = useState<Shown | null>(null);
  const [fail, setFail] = useState<{ scope: string; msg: string } | null>(null);
  // The read in flight is the one asked for and not yet answered.
  const ask = JSON.stringify([scope, want, tick]);
  const [answered, setAnswered] = useState<string | null>(null);
  const reading = answered !== ask;
  const lastRead = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    lastRead.current = Date.now();
    api<Foresight>(`${path}/preview`, { body: { action: choice, ...(JSON.parse(want) as Record<string, unknown>) } })
      .then((f) => {
        if (!live) return;
        const at = Date.now();
        setShown((prev) => {
          if (!prev || prev.scope !== scope) return { scope, f, at, updated: null };
          const before = new Set(prev.f.lines.map(lineKey));
          const fresh = f.lines.filter((l) => !before.has(lineKey(l))).map(lineKey);
          const differs = fresh.length > 0 || f.lines.length !== prev.f.lines.length || f.quiet !== prev.f.quiet;
          return { scope, f, at, updated: differs ? { at, lines: new Set(fresh) } : prev.updated };
        });
        setFail(null);
      })
      .catch((e) => {
        if (!live) return;
        const msg = e instanceof ApiError && e.status !== 0 && e.status < 500 ? sentence(e.message) : "Align couldn't work out what this would do right now. Nothing was recorded.";
        setFail({ scope, msg });
      })
      .finally(() => live && setAnswered(ask));
    return () => {
      live = false;
    };
  }, [path, choice, scope, want, ask]);

  // Read again when the workspace moves, no sooner than REREAD_MS after the last read; moves meanwhile share one read.
  // useLiveReload keeps the latest function, so this needs no memo.
  const reread = () => {
    if (timer.current) return;
    timer.current = setTimeout(
      () => {
        timer.current = null;
        setTick((t) => t + 1);
      },
      Math.max(0, lastRead.current + REREAD_MS - Date.now()),
    );
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useLiveReload(ws, ["changes", "goals", "sessions"], reread);
  const retry = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setTick((t) => t + 1);
  };

  const now = shown?.scope === scope ? shown : null;
  const failed = fail?.scope === scope ? fail.msg : null;
  const titleOf = (id: string) => now?.f.titles[id] ?? "A goal you can't see";
  const effects = now?.f.lines.filter((l) => l.kind !== "record") ?? [];
  const record = now?.f.lines.find((l) => l.kind === "record");
  const changed = (l: Line) => !!now?.updated?.lines.has(lineKey(l));
  // Keys by kind and place among its kind, so a line whose count changes keeps an opened compare open.
  const seen: Record<string, number> = {};
  const keyOf = (l: Line) => `${l.kind}-${(seen[l.kind] = (seen[l.kind] ?? -1) + 1)}`;
  const mark = (l: Line) => (changed(l) ? "-ml-2 border-l-2 border-(--accent) bg-(--accent-soft) pl-1.5 rounded-r-(--radius-s)" : "");

  return (
    <section data-foresight={choice} aria-live="polite" aria-busy={reading} className="flex min-w-0 flex-col gap-1.5 rounded-(--radius-s) border border-(--line) bg-(--bg-inset) px-3 py-2.5">
      <h5 className="text-[13px] font-medium text-(--text-2)">{LEAD[choice]}</h5>
      {!now && !failed && <p className="text-[14px] text-(--text-3)">Working out what this would do…</p>}
      {!now && failed && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p data-foresight-error className="min-w-0 text-[14px] text-(--text-2) [overflow-wrap:anywhere]">
            {failed}
          </p>
          <RetryButton onClick={retry} disabled={reading} />
        </div>
      )}
      {now && (
        // On a phone the confirmation is a sheet that doesn't scroll: the lines scroll here, so an opened compare never
        // pushes the other lines or the Confirm button off the screen.
        <ul data-foresight-lines className="flex min-w-0 flex-col gap-1 max-sm:max-h-[36dvh] max-sm:overflow-y-auto max-sm:overscroll-contain">
          {now.f.quiet && (
            <li data-foresight-line="quiet" className="pl-[18px] text-[14px] text-(--text-1)">
              Nothing changes for agents or spend.
            </li>
          )}
          {effects.map((l) => (
            <li key={keyOf(l)} data-foresight-line={l.kind} data-foresight-changed={changed(l) || undefined} className={`min-w-0 text-[14px] text-(--text-1) motion-safe:transition-colors motion-safe:duration-500 ${mark(l)}`}>
              {l.compare || l.detail?.length ? (
                <details className="group/fl min-w-0">
                  <summary className="flex min-h-[32px] cursor-pointer list-none items-start gap-1.5 rounded-(--radius-s) [overflow-wrap:anywhere] max-sm:min-h-[44px] max-sm:items-center [&::-webkit-details-marker]:hidden">
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mt-[5px] shrink-0 text-(--text-3) group-open/fl:rotate-90 max-sm:mt-0 motion-safe:transition-transform">
                      <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
                    </svg>
                    <span className="min-w-0 underline decoration-(--line-strong) underline-offset-4">{l.text}</span>
                    {changed(l) && <ChangedTag />}
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
                <span className="flex min-w-0 items-start gap-1.5 pl-[18px] [overflow-wrap:anywhere]">
                  <span className="min-w-0">{l.text}</span>
                  {changed(l) && <ChangedTag />}
                </span>
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
      {now && failed && (
        <div data-foresight-stale className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-(--radius-s) border border-(--st-retry) bg-(--st-retry-soft) px-2.5 py-1.5">
          <p role="status" className="min-w-0 text-[13px] text-(--text-1) [overflow-wrap:anywhere]">
            Couldn&apos;t update this forecast. It shows the workspace at {clock(now.at)}.
          </p>
          <RetryButton onClick={retry} disabled={reading} />
        </div>
      )}
      {now?.updated && !failed && (
        <p data-foresight-updated role="status" className="text-[13px] text-(--accent-text)">
          Updated at {clock(now.updated.at)}: the workspace changed since this opened.
        </p>
      )}
      {now && <p className="text-[12.5px] text-(--text-3)">A forecast: nothing has been recorded or sent yet.</p>}
    </section>
  );
}

function ChangedTag() {
  return <span className="mt-[3px] shrink-0 rounded-full border border-(--accent) px-1.5 font-mono text-[10.5px] leading-[16px] tracking-[0.06em] text-(--accent-text) uppercase">changed</span>;
}

function RetryButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      data-foresight-retry
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-[32px] shrink-0 items-center rounded-(--radius-s) border border-(--edge) bg-(--bg-raised) px-2.5 text-[13px] text-(--text-1) hover:bg-(--bg-overlay) disabled:opacity-60 max-sm:min-h-[44px]"
    >
      {disabled ? "Trying…" : "Try again"}
    </button>
  );
}
