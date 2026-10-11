"use client";
import type { Goal, StateView, WorkItem } from "@/lib/types";
import type { ViewProps } from "./props";
import { currentGoal, priorVersion } from "./select";
import { Badge, Button, OWNER_LABEL } from "./ui";
import type { Selection } from "./useAlign";

/* Shared helpers (also used by GoalsView). */
export const RING = "outline-2 outline-offset-2 outline-violet-500";
export const isSel = (sel: Selection | null, kind: Selection["kind"], id?: string) => !!id && sel?.kind === kind && sel.id === id;
export const workFor = (s: StateView, g?: Goal): WorkItem[] =>
  g ? s.work_items.filter((w) => w.goal_id === g.id).sort((a, b) => a.priority_rank - b.priority_rank) : [];
export const depRelation = (s: StateView) => s.relations.find((r) => r.id === "r-product-security");
/** Short team name for prose ("Security's goal"), falling back to the owner label. */
export const teamName = (g: Goal) =>
  g.owner_id === "security" ? "Security" : g.owner_id === "product" ? "Product" : (OWNER_LABEL[g.owner_id] ?? g.owner_name);

export function VersionTag({ s, g }: { s: StateView; g: Goal }) {
  const prior = priorVersion(s, g);
  return prior ? (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone="neutral" icon={false}>
        {prior.version} → {g.version}
      </Badge>
      <Badge tone="violet">Updated</Badge>
    </span>
  ) : (
    <Badge tone="neutral" icon={false}>
      {g.version}
    </Badge>
  );
}

export function EditTag({ g, me }: { g: Goal; me: ViewProps["me"] }) {
  return g.owner_id === me.actor ? <Badge tone="blue">Your goal · you can edit</Badge> : <Badge tone="neutral">{teamName(g)}&apos;s goal · view only</Badge>;
}

export function MissingGoal({ owner }: { owner: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-zinc-300 p-5 text-[16px] text-zinc-500">
      No current goal has been shared for {OWNER_LABEL[owner] ?? owner}.
    </div>
  );
}

function Column({ props, owner }: { props: ViewProps; owner: "product" | "security" }) {
  const { s, me, select, selection } = props;
  const g = currentGoal(s, owner);
  if (!g) return <MissingGoal owner={owner} />;
  const work = workFor(s, g);
  const priv = s.private_constraints.filter((c) => c.owner === owner);
  const unresolved = depRelation(s)?.status === "UNKNOWN";
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-white p-5 ring-1 ring-zinc-200">
      <button
        onClick={() => select({ kind: "goal", id: g.id })}
        className={`rounded-lg p-1 text-left ${isSel(selection, "goal", g.id) ? RING : ""}`}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-[17px] font-bold">{g.owner_name}</span>
          <VersionTag s={s} g={g} />
          <EditTag g={g} me={me} />
        </div>
        <p className="text-[16px] text-zinc-800">{g.objective}</p>
      </button>

      <div>
        <h4 className="mb-1.5 al-lbl">Already committed to</h4>
        <ul className="space-y-1.5">
          {g.measures.map((m) => (
            <li key={m.id} className="text-[15px] text-zinc-800">
              {m.text}
              {m.inherited_from && <span className="ml-1.5 text-[13px] text-zinc-500">(from the CEO&apos;s goal)</span>}
              {m.id === "S-M1" && unresolved && (
                <div className="mt-1">
                  <Badge tone="amber">Clashes with the CEO&apos;s new requirement</Badge>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-1.5 al-lbl">Priority list</h4>
        {work.length ? (
          <ol className="space-y-1">
            {work.map((w, i) => (
              <li key={w.id}>
                <button
                  onClick={() => select({ kind: "work", id: w.id })}
                  className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[15px] hover:bg-zinc-50 ${isSel(selection, "work", w.id) ? RING : ""}`}
                >
                  <span className="font-mono text-[13px] text-zinc-500">#{i + 1}</span>
                  <span className="flex-1 text-zinc-900">{w.task}</span>
                  <span className="text-[13px] text-zinc-500">{w.observed_status}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[15px] text-zinc-500">No work linked to this goal yet.</p>
        )}
      </div>

      {priv.length > 0 && (
        <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
          <div className="mb-1 flex items-center gap-2">
            <Badge tone="neutral">Private to you</Badge>
          </div>
          {priv.map((c, i) => (
            <p key={i} className="text-[15px] text-zinc-700">
              {c.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function TeamLens(props: ViewProps & { embedded?: boolean }) {
  const { s, me, select, selection, openDrawer, go, embedded } = props;
  const ceo = currentGoal(s, "ceo");
  const accepted = s.acceptances.at(-1);
  const sec = currentGoal(s, "security");
  const secBefore = accepted && sec ? (priorVersion(s, sec) ?? sec) : sec;
  const oldTarget = secBefore?.measures.find((m) => m.id === "S-M1")?.text ?? "Close as many tickets as possible each day, oldest first";
  const newRequirement =
    ceo?.measures.find((m) => m.id === "KR2")?.text ?? "Beta customers' issues handled first, in time for the beta launch";
  return (
    <div className="flex flex-col gap-4">
      {!embedded && <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em]">Team view</h1>}

      {ceo ? (
        <button
          onClick={() => {
            select({ kind: "goal", id: ceo.id });
            props.mark("ceo_change_viewed");
          }}
          className={`rounded-xl bg-zinc-50 p-4 text-left ring-1 ring-zinc-300 ${isSel(selection, "goal", ceo.id) ? RING : ""}`}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[14px]">
            <span className="font-semibold text-zinc-600">The CEO&apos;s company goal</span>
            <Badge tone="neutral">Set by CEO · view only</Badge>
            <Badge tone="neutral" icon={false}>{ceo.version}</Badge>
          </div>
          <p className="text-[17px] font-semibold text-zinc-900">{ceo.objective}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ceo.measures.map((m, i) =>
              m.id === "KR2" && ceo.changed ? (
                <Badge key={m.id} tone="amber">New requirement, added today</Badge>
              ) : (
                <Badge key={m.id} tone="neutral" icon={false}>CEO requirement {i + 1}</Badge>
              ),
            )}
          </div>
        </button>
      ) : (
        <MissingGoal owner="ceo" />
      )}

      <div className="grid grid-cols-2 gap-4">
        <Column props={props} owner="product" />
        <Column props={props} owner="security" />
      </div>

      <div className="rounded-xl bg-white p-5 ring-1 ring-zinc-200">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h4 className="al-lbl">What changed</h4>
          {accepted ? <Badge tone="neutral">Resolved</Badge> : <Badge tone="amber">Needs a decision</Badge>}
        </div>

        <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-zinc-500">Security&apos;s agents are measured on</div>
            <p className={`mt-1 text-[17px] ${accepted ? "text-zinc-500 line-through decoration-zinc-400" : "text-zinc-900"}`}>{oldTarget}</p>
          </div>
          <div aria-hidden className="hidden items-center text-[24px] text-amber-700 md:flex">
            ≠
          </div>
          <div className="rounded-lg bg-amber-50 p-4 ring-1 ring-amber-300">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold uppercase tracking-wide text-amber-800">The CEO now requires</span>
              {ceo?.changed && <Badge tone="amber">New today</Badge>}
            </div>
            <p className="mt-1 text-[17px] text-zinc-900">{newRequirement}</p>
          </div>
        </div>

        {accepted ? (
          <ul className="mt-4 space-y-1.5 text-[16px] text-zinc-900">
            <li className="flex gap-2">
              <span aria-hidden className="text-zinc-500">●</span>
              <span>
                Security approved its updated goal ({accepted.accepted_version}). Its agents now put beta issues first.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-zinc-500">●</span>
              <span>Product took on its part: tag beta issues on arrival and publish what&apos;s in the beta.</span>
            </li>
          </ul>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h5 className="mb-1.5 text-[14px] font-semibold text-zinc-700">Why it matters</h5>
              <ul className="space-y-1.5 text-[16px] text-zinc-900">
                <li className="flex gap-2">
                  <span aria-hidden className="text-amber-700">▲</span> Beta customers&apos; issues wait behind older tickets
                </li>
                <li className="flex gap-2">
                  <span aria-hidden className="text-amber-700">▲</span> The agents can finish every ticket and still miss the CEO&apos;s goal
                </li>
                <li className="flex gap-2">
                  <span aria-hidden className="text-zinc-500">●</span> Product can&apos;t change Security&apos;s goal. Only Security can.
                </li>
              </ul>
            </div>
            <div>
              <h5 className="mb-1.5 text-[14px] font-semibold text-zinc-700">How Align resolves it</h5>
              <ol className="space-y-1.5 text-[16px] text-zinc-900">
                <li className="flex gap-2">
                  <span className="font-mono text-[14px] text-violet-700">1</span> Test both plans in Sparta on the same practice tickets
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-[14px] text-violet-700">2</span> Product proposes the change, with the test attached
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-[14px] text-violet-700">3</span> Security edits or approves its own goal
                </li>
              </ol>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={() => openDrawer("brief")}>See what to do next</Button>
          {me.actor === "product" ? (
            <Button kind="secondary" onClick={() => go("proposals")}>
              Propose a change to Security&apos;s goal
            </Button>
          ) : (
            <>
              <Button kind="secondary" disabled>
                Propose a change to Security&apos;s goal
              </Button>
              <span className="text-[14px] text-zinc-500">Changes Product proposes to your goal show up under Proposals.</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
