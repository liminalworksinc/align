"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Goal } from "../types";
import { VersionsCompare, type VersionRow } from "./compare";
import { EmptyState } from "./empty-state";
import { Panel } from "./panel";
import { useRead } from "./read";

// Goal dependencies (LIM-2472 workstream S, P1): the goals the reader can read as an indented list, not a graph: each
// goal under the goal it contributes to (contributes_to), with what it depends on (depends_on) said beside it. Select a
// goal for its details, and compare two of its versions (VersionsCompare, from GET …/goals/<goal> → versions).
// `stale` on a contribution is a real signal: the goal it contributes to has a newer version than the one this goal was
// last reviewed against. Reads: GET …/goals (feed), GET …/goals/<goal> (versions). Body only: /app/w/<ws>/dependencies.

const LINK = "max-sm:inline-flex max-sm:min-h-[44px] max-sm:items-center text-(--accent-text) underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)";
const SELECT =
  "min-h-[36px] max-sm:min-h-[44px] rounded-(--radius-s) border border-(--edge) bg-(--bg-raised) px-2.5 text-[14px] text-(--text-1) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)";

interface Node {
  goal: Goal;
  depth: number;
}

/** Depth-first: roots are goals that contribute to nothing the reader can see; each goal once (the first parent wins),
 *  so a goal that contributes to two goals is listed under the first and named under the other. */
function flatten(goals: Goal[]): Node[] {
  const byId = new Map(goals.map((g) => [g.id, g]));
  const kids = new Map<string, Goal[]>();
  const roots: Goal[] = [];
  for (const g of goals) {
    const parent = g.contributes_to.find((p) => byId.has(p.id));
    if (parent) kids.set(parent.id, [...(kids.get(parent.id) ?? []), g]);
    else roots.push(g);
  }
  const order = (a: Goal, b: Goal) => (a.level === b.level ? a.title.localeCompare(b.title) : a.level === "company" ? -1 : 1);
  const out: Node[] = [];
  const seen = new Set<string>();
  const walk = (g: Goal, depth: number) => {
    if (seen.has(g.id)) return;
    seen.add(g.id);
    out.push({ goal: g, depth });
    for (const k of (kids.get(g.id) ?? []).sort(order)) walk(k, depth + 1);
  };
  for (const r of roots.sort(order)) walk(r, 0);
  // Anything left (a loop of contributions) is listed at the top level rather than dropped.
  for (const g of goals) walk(g, 0);
  return out;
}

const STATUS = { active: "Active", achieved: "Achieved", dropped: "Dropped" } as const;

function Details({ ws, goal, byId }: { ws: string; goal: Goal; byId: Map<string, Goal> }) {
  const d = useRead<{ versions: VersionRow[] }>(`/api/v2/workspaces/${ws}/goals/${goal.id}`);
  const versions = d.data?.versions ?? [];
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const newer = versions.find((v) => v.version === (b ?? versions[0]?.version));
  const older = versions.find((v) => v.version === (a ?? versions[1]?.version));
  const contributedBy = [...byId.values()].filter((g) => g.contributes_to.some((p) => p.id === goal.id));
  const hidden = goal.depends_on.filter((id) => !byId.has(id)).length;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Panel
        eyebrow={goal.level === "company" ? "Company goal" : (goal.team?.name ?? "Team goal")}
        title={goal.title}
        actions={
          <span className="flex flex-wrap gap-3 text-[14px]">
            <Link href={`/app/w/${ws}/goals/${goal.id}`} className={LINK}>
              Open goal
            </Link>
            <Link href={`/app/w/${ws}/work?goal=${goal.id}`} className={LINK}>
              Work
            </Link>
            <Link href={`/app/w/${ws}/record?goal=${goal.id}`} className={LINK}>
              Record
            </Link>
          </span>
        }
      >
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-x-4 gap-y-2 text-[14px]">
          <dt className="text-(--text-2)">Version</dt>
          <dd className="text-(--text-1)">
            v{goal.version} · {STATUS[goal.status]}
          </dd>
          <dt className="text-(--text-2)">Owner</dt>
          <dd className="text-(--text-1)">{goal.owner.name}</dd>
          <dt className="text-(--text-2)">Contributes to</dt>
          <dd className="flex min-w-0 flex-col gap-1 text-(--text-1)">
            {goal.contributes_to.length === 0 && <span className="text-(--text-2)">No goal you can see</span>}
            {goal.contributes_to.map((p) => (
              <span key={p.id} className="[overflow-wrap:anywhere]">
                {p.title} (v{p.version})
                {p.stale && (
                  <span className="mt-0.5 block text-[13px] text-(--st-pending)">
                    Changed since this goal was last reviewed against it{p.reviewed_version ? ` (v${p.reviewed_version})` : ""}
                  </span>
                )}
              </span>
            ))}
          </dd>
          <dt className="text-(--text-2)">Depends on</dt>
          <dd className="flex min-w-0 flex-col gap-1 text-(--text-1)">
            {goal.depends_on.length === 0 && <span className="text-(--text-2)">Nothing</span>}
            {goal.depends_on
              .filter((id) => byId.has(id))
              .map((id) => (
                <span key={id} className="[overflow-wrap:anywhere]">
                  {byId.get(id)!.title}
                </span>
              ))}
            {hidden > 0 && <span className="text-(--text-2)">{hidden === 1 ? "A goal you can't see" : `${hidden} goals you can't see`}</span>}
          </dd>
          <dt className="text-(--text-2)">Contributed to by</dt>
          <dd className="flex min-w-0 flex-col gap-1 text-(--text-1)">
            {contributedBy.length === 0 ? <span className="text-(--text-2)">No goal you can see</span> : contributedBy.map((g) => <span key={g.id}>{g.title}</span>)}
          </dd>
        </dl>
        {goal.measures.length > 0 && (
          <div className="mt-3 border-t border-(--line) pt-3">
            <p className="mb-1 text-[13px] text-(--text-3)">Measures (v{goal.version})</p>
            <ul className="flex flex-col gap-0.5 text-[14px] text-(--text-1)">
              {goal.measures.map((m) => (
                <li key={m.id} className="[overflow-wrap:anywhere]">
                  {m.text}
                  {m.target && <span className="text-(--text-3)"> · target {m.target}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel eyebrow="Versions" title={`${versions.length || goal.version} ${(versions.length || goal.version) === 1 ? "version" : "versions"}`}>
        {d.loading && <p className="text-[14px] text-(--text-2)">Loading…</p>}
        {d.status !== 0 && <p className="text-[14px] text-(--text-2)">{d.message}</p>}
        {versions.length === 1 && <p className="text-[14px] text-(--text-2)">Only one version so far: nothing to compare.</p>}
        {versions.length > 1 && older && newer && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-(--text-2)">
                Compare
                <select className={SELECT} value={older.version} onChange={(e) => setA(Number(e.target.value))}>
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      v{v.version} · {new Date(v.created_at).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-(--text-2)">
                with
                <select className={SELECT} value={newer.version} onChange={(e) => setB(Number(e.target.value))}>
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      v{v.version} · {new Date(v.created_at).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {older.version === newer.version ? <p className="text-[14px] text-(--text-2)">Choose two different versions.</p> : <VersionsCompare a={older} b={newer} />}
          </div>
        )}
      </Panel>
    </div>
  );
}

export function GoalDependencies({ ws, goalId }: { ws: string; goalId?: string }) {
  const feed = useRead<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const goals = useMemo(() => feed.data?.goals ?? [], [feed.data]);
  const nodes = useMemo(() => flatten(goals), [goals]);
  const byId = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);
  const [picked, setPicked] = useState<string | undefined>(goalId);
  const goal = (picked && byId.get(picked)) || nodes[0]?.goal;
  const staleCount = goals.filter((g) => g.contributes_to.some((p) => p.stale)).length;

  const choose = (id: string) => {
    setPicked(id);
    const u = new URL(window.location.href);
    u.searchParams.set("goal", id);
    window.history.replaceState(null, "", u);
  };

  return (
    <div data-surface="dependencies" className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Panel eyebrow="Goals" title="How the goals connect" padded={false}>
        {feed.loading && <p className="p-4 text-[14px] text-(--text-2)">Loading…</p>}
        {feed.status !== 0 && <p className="p-4 text-[14px] text-(--text-2)">{feed.message}</p>}
        {feed.data && goals.length === 0 && (
          <div className="p-4">
            <EmptyState title="No goals you can read" body="Goals you own, your team's and the workspace's appear here, each under the goal it contributes to." />
          </div>
        )}
        {staleCount > 0 && (
          <p className="border-b border-(--line) px-4 py-2 text-[13px] text-(--st-pending)">
            {staleCount === 1 ? "1 goal contributes to a goal" : `${staleCount} goals contribute to goals`} that changed since it was last reviewed.
          </p>
        )}
        <ul aria-label="Goals, each under the goal it contributes to" className="flex flex-col p-1.5">
          {nodes.map(({ goal: g, depth }) => {
            const on = g.id === goal?.id;
            const stale = g.contributes_to.some((p) => p.stale);
            return (
              <li key={g.id} style={{ paddingLeft: `${Math.min(depth, 4) * 16}px` }}>
                <button
                  type="button"
                  aria-current={on ? "true" : undefined}
                  onClick={() => choose(g.id)}
                  className={`flex min-h-[44px] w-full flex-col items-start gap-0.5 rounded-(--radius-s) border-l-2 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--focus) ${
                    on ? "border-(--accent-text) bg-(--accent-soft)" : depth ? "border-(--line-strong) hover:bg-(--bg-raised)" : "border-transparent hover:bg-(--bg-raised)"
                  }`}
                >
                  <span className="text-[14px] font-medium text-(--text-1) [overflow-wrap:anywhere]">{g.title}</span>
                  <span className="text-[12.5px] text-(--text-3)">
                    {g.level === "company" ? "Company" : (g.team?.name ?? "Team")} · v{g.version}
                    {g.status !== "active" ? ` · ${STATUS[g.status].toLowerCase()}` : ""}
                    {g.depends_on.length > 0 ? ` · depends on ${g.depends_on.length}` : ""}
                  </span>
                  {stale && <span className="text-[12.5px] text-(--st-pending)">Changed above since last review</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>
      {goal && <Details key={goal.id} ws={ws} goal={goal} byId={byId} />}
    </div>
  );
}
