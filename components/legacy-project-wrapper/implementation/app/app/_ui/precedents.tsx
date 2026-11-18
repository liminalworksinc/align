"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Precedent } from "@/lib/v2/changes";
import { api, ApiError } from "./kit";
import type { ChangeFields, ChangeRequest } from "./types";

const STATE_WORDS = { approved: "Approved", rejected: "Declined", superseded: "Superseded" } as const;
const FIELD_WORDS: Record<string, string> = { title: "title", status: "status", anchors: "work references" };

function timeAgo(iso: string | null, now: number) {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return "at an unknown time";
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "less than a minute ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function launchLabel(earlier: Precedent) {
  if (earlier.launch === "launched") return earlier.resulting_version === null ? "Launched" : `Launched as v${earlier.resulting_version}`;
  if (earlier.launch === "not_yet") return "Launch deferred";
  if (earlier.launch === "pending") return "Waiting to launch";
  return "Launch state unknown";
}

function EarlierDecisions({ ws, items, now, onFollow }: { ws: string; items: Precedent[]; now: number; onFollow?: () => void }) {
  if (!items.length) return null;
  return (
    <details data-precedents className="my-2 min-w-0 rounded-(--radius-s) border border-(--line) px-3 text-[14px] text-(--text-2) [overflow-wrap:anywhere]">
      <summary className="min-h-[44px] cursor-pointer py-3 font-medium text-(--text-1)">
        Earlier decisions on the same items ({items.length})
      </summary>
      <ul>
        {items.map((earlier) => (
          <li key={earlier.id} className="flex min-w-0 flex-col gap-1 border-t border-(--line) py-2">
            <Link href={`/app/w/${ws}/record?cr=${earlier.id}#record`} onClick={onFollow} className="min-h-[44px] py-2 font-medium text-(--text-1) underline underline-offset-2">
              v{earlier.base_version}: {STATE_WORDS[earlier.state]} {timeAgo(earlier.decided_at, now)} by {earlier.decided_by?.name ?? "unknown"}
            </Link>
            <ul>
              {earlier.shared_elements.map((item) => (
                <li key={`${item.kind}:${item.element_key}`}>
                  {item.kind === "field" ? FIELD_WORDS[item.element_key] : `${item.kind} ${item.label ? `“${item.label}”` : "(name unknown)"}`} {item.change}
                </li>
              ))}
            </ul>
            {earlier.state === "approved" && <p>{launchLabel(earlier)}</p>}
            {(earlier.rejection_reason ?? earlier.decision_note) && <p>{earlier.rejection_reason ?? earlier.decision_note}</p>}
            {earlier.state === "rejected" && <p>Circumstances may have changed since.</p>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function PrecedentRead({ ws, path, draft, onFollow }: { ws: string; path: string; draft?: string; onFollow?: () => void }) {
  const [result, setResult] = useState<{ body?: string; items: Precedent[] | null; now: number } | null>(null);
  useEffect(() => {
    let active = true;
    const read = () => {
      void api<{ precedents: Precedent[] }>(path, draft === undefined ? undefined : { body: JSON.parse(draft) })
        .then(({ precedents }) => {
          if (active) setResult({ body: draft, items: precedents, now: Date.now() });
        })
        .catch((error) => {
          const invalidDraft = draft !== undefined && error instanceof ApiError && (error.status === 400 || error.code === "no_change");
          if (active) setResult({ body: draft, items: invalidDraft ? [] : null, now: Date.now() });
        });
    };
    const timer = draft === undefined ? undefined : window.setTimeout(read, 650);
    if (draft === undefined) read();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [path, draft]);
  if (!result || result.body !== draft) return null;
  if (!result.items) return <p className="text-[14px] text-(--text-2)">Earlier decisions are unknown.</p>;
  return <EarlierDecisions ws={ws} items={result.items} now={result.now} onFollow={onFollow} />;
}

export function RequestPrecedents({ ws, cr }: { ws: string; cr: ChangeRequest }) {
  const path = `/api/v2/workspaces/${ws}/goals/${cr.goal.id}/change-requests/${cr.id}/precedents`;
  return <PrecedentRead key={`${path}:${cr.revision}:${cr.state}:${cr.goal.version}`} ws={ws} path={path} />;
}

export function DraftPrecedents({ ws, goal, version, changes, onFollow }: { ws: string; goal: string; version: number; changes: ChangeFields; onFollow?: () => void }) {
  const path = `/api/v2/workspaces/${ws}/goals/${goal}/change-requests/precedents`;
  return <PrecedentRead key={`${path}:${version}`} ws={ws} path={path} draft={JSON.stringify({ base_version: version, changes })} onFollow={onFollow} />;
}
