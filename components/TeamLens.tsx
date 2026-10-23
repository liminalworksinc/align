"use client";
import { companyMeasureId, conflictMeasureId, dependencyId, labelsFor, poss, type Labels } from "@/lib/labels";
import type { Goal, StateView, WorkItem } from "@/lib/types";
import type { ViewProps } from "./props";
import { currentGoal, priorVersion } from "./select";
import { Badge, Button, OWNER_LABEL } from "./ui";
import type { Selection } from "./useAlign";
import { CARD, Chip, H1, Lbl, Pill } from "./v6/kit";

/* Shared helpers (also used by GoalsView, Inspector and DecisionView). */
export const RING = "outline-2 outline-offset-2 outline-violet-500";
export const isSel = (sel: Selection | null, kind: Selection["kind"], id?: string) => !!id && sel?.kind === kind && sel.id === id;
export const workFor = (s: StateView, g?: Goal): WorkItem[] =>
  g ? s.work_items.filter((w) => w.goal_id === g.id).sort((a, b) => a.priority_rank - b.priority_rank) : [];
/** The dependency between the two teams. Northstar: r-product-security; custom: scenario_config.dependency_id. */
export const depRelation = (s: StateView) => s.relations.find((r) => r.id === dependencyId(s));
/** Short team name for prose ("Security's goal"), falling back to the owner label. */
export const teamName = (g: Goal) =>
  g.owner_id === "security" ? "Security" : g.owner_id === "product" ? "Product" : (OWNER_LABEL[g.owner_id] ?? g.owner_name);

/** Label for the button that opens the brief; Security is the other side of the conflict for everyone but Security. */
export const reviewConflictLabel = (me: ViewProps["me"]) =>
  me.actor === "security" ? "Review the CEO's new requirement" : "Review the conflict with Security";

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
    <div className="rounded-[14px] border-2 border-dashed border-zinc-300 p-5 text-[16px] text-zinc-500">
      No current goal has been shared for {OWNER_LABEL[owner] ?? owner}.
    </div>
  );
}

function Column({ props, L, owner }: { props: ViewProps; L: Labels; owner: "product" | "security" }) {
  const { s, me, select, selection } = props;
  const g = currentGoal(s, owner);
  if (!g) return <MissingGoal owner={L.northstar ? owner : L.team[owner]} />;
  const work = workFor(s, g);
  const priv = s.private_constraints.filter((c) => c.owner === owner);
  const unresolved = depRelation(s)?.status === "UNKNOWN";
  const prior = priorVersion(s, g);
  return (
    <div className={`${CARD} flex flex-col gap-4 p-5`}>
      <button type="button" onClick={() => select({ kind: "goal", id: g.id })} className={`rounded-lg p-1 text-left ${isSel(selection, "goal", g.id) ? RING : ""}`}>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Lbl>
            {L.team[owner]} · {me.actor === owner ? "you" : "peer"}
          </Lbl>
          <Chip>{prior ? `${prior.version} → ${g.version}` : g.version}</Chip>
          <Chip>{g.owner_id === me.actor ? "your goal · you can edit" : "view only"}</Chip>
        </div>
        <p className="text-[17px] font-semibold leading-[1.3] text-zinc-900">{g.objective}</p>
      </button>

      <div>
        <Lbl>Already committed to</Lbl>
        <ul className="mt-1.5 space-y-1.5">
          {g.measures.map((m) => (
            <li key={m.id} className="text-[15px] text-zinc-800">
              {m.text}
              {m.inherited_from && <span className="ml-1.5 text-[13px] text-zinc-500">(from {poss(L.team.ceo)} goal)</span>}
              {m.id === conflictMeasureId(s) && owner === "security" && unresolved && (
                <div className="mt-1">
                  <Pill tone="amber" small>
                    Clashes with {poss(L.person.ceo)} new requirement
                  </Pill>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <Lbl>Priority list</Lbl>
        {work.length ? (
          <ol className="mt-1.5 space-y-1">
            {work.map((w, i) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => select({ kind: "work", id: w.id })}
                  className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[15px] hover:bg-zinc-100 ${isSel(selection, "work", w.id) ? RING : ""}`}
                >
                  <span className="font-mono text-[13px] text-zinc-500">#{i + 1}</span>
                  <span className="flex-1 text-zinc-900">{w.task}</span>
                  <Chip tone={w.observed_status === "not prioritized" ? "amber" : undefined}>{w.observed_status}</Chip>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1.5 text-[15px] text-zinc-500">No work linked to this goal yet.</p>
        )}
      </div>

      {priv.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-1">
            <Pill tone="grey" small>
              Private to you
            </Pill>
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
  const L = labelsFor(s);
  const ceo = currentGoal(s, "ceo");
  const accepted = s.acceptances.at(-1);
  const sec = currentGoal(s, "security");
  const secBefore = accepted && sec ? (priorVersion(s, sec) ?? sec) : sec;
  const fallbackOld = L.northstar ? "Close as many tickets as possible each day, oldest first" : "Not shared";
  const fallbackNew = L.northstar ? "Beta customers' issues handled first, in time for the beta launch" : "Not shared";
  const oldTarget = secBefore?.measures.find((m) => m.id === conflictMeasureId(s))?.text ?? fallbackOld;
  const newRequirement = ceo?.measures.find((m) => m.id === companyMeasureId(s))?.text ?? fallbackNew;
  const krId = companyMeasureId(s);
  return (
    <div className="flex flex-col gap-4">
      {!embedded && <H1>Team view</H1>}

      {ceo ? (
        <button
          type="button"
          onClick={() => {
            select({ kind: "goal", id: ceo.id });
            props.mark("ceo_change_viewed");
          }}
          className={`${CARD} flex flex-col gap-2 px-[18px] py-4 text-left hover:bg-zinc-100 ${isSel(selection, "goal", ceo.id) ? RING : ""}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Lbl>
              {L.team.ceo} · {L.person.ceo}
            </Lbl>
            <Chip>read-only</Chip>
            <Chip>{ceo.version}</Chip>
          </div>
          <p className="text-[18px] font-semibold leading-[1.3] text-zinc-900">{ceo.objective}</p>
          <div className="flex flex-wrap gap-1.5">
            {ceo.measures.map((m, i) =>
              m.id === krId && ceo.changed ? (
                <Pill key={m.id} tone="amber" small>
                  New requirement, added today
                </Pill>
              ) : (
                <Chip key={m.id}>Requirement {i + 1}</Chip>
              ),
            )}
          </div>
        </button>
      ) : (
        <MissingGoal owner={L.northstar ? "ceo" : L.team.ceo} />
      )}

      <div className="grid grid-cols-2 gap-4">
        <Column props={props} L={L} owner="product" />
        <Column props={props} L={L} owner="security" />
      </div>

      <div className={`${CARD} p-5`}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Lbl>What changed</Lbl>
          {accepted ? <Pill tone="white" small>Resolved</Pill> : <Pill tone="amber" small>Needs a decision</Pill>}
        </div>
        <p className="mb-3 text-[15px] text-zinc-900">
          {L.person.ceo} changed the requirements. {poss(L.team.security)} plan hasn&apos;t caught up.
        </p>

        <div className="grid items-center gap-4 rounded-[14px] border border-zinc-200 bg-zinc-50 px-[18px] py-3.5 md:grid-cols-[1fr_auto_1fr]">
          <div>
            <Lbl className="!text-red-700">{L.northstar ? "Security's agents are measured on" : `${L.team.security} is measured on`}</Lbl>
            <p className={`mt-1 text-[15px] ${accepted ? "text-zinc-500 line-through decoration-zinc-400" : "text-zinc-900"}`}>{oldTarget}</p>
          </div>
          <span aria-label="does not match" className="font-mono text-[12.5px] text-zinc-600">
            ≠
          </span>
          <div>
            <Lbl className="!text-amber-700">{L.person.ceo} now requires</Lbl>
            <p className="mt-1 text-[15px] text-zinc-900">{newRequirement}</p>
          </div>
        </div>

        {accepted ? (
          <ul className="mt-4 space-y-1.5 text-[16px] text-zinc-900">
            <li>
              {L.team.security} approved its updated goal ({accepted.accepted_version}).{L.northstar ? " Its agents now put beta issues first." : ""}
            </li>
            {L.northstar && <li>Product took on its part: tag beta issues on arrival and publish what&apos;s in the beta.</li>}
          </ul>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <Lbl>Why it matters</Lbl>
              <ul className="mt-1.5 space-y-1.5 text-[15px] text-zinc-900">
                {L.northstar && (
                  <>
                    <li>Beta customers&apos; issues wait behind older tickets</li>
                    <li>The agents can finish every ticket and still miss the CEO&apos;s goal</li>
                  </>
                )}
                <li>
                  {L.team.product} can&apos;t change {poss(L.team.security)} goal. Only {L.team.security} can.
                </li>
              </ul>
            </div>
            <div>
              <Lbl>How Align resolves it</Lbl>
              <ol className="mt-1.5 space-y-1.5 text-[15px] text-zinc-900">
                <li>
                  <span className="mr-2 font-mono text-[13px] text-violet-700">1</span>
                  {L.northstar ? "Test which plan follows the new priority, in Sparta on the same practice tickets" : "Write the change as one plan. This scenario has no sandbox, so it stays not sandbox-tested."}
                </li>
                <li>
                  <span className="mr-2 font-mono text-[13px] text-violet-700">2</span>
                  {L.team.product} proposes the change{L.northstar ? ", with the test attached" : ""}
                </li>
                <li>
                  <span className="mr-2 font-mono text-[13px] text-violet-700">3</span>
                  {L.team.security} edits or approves its own goal
                </li>
              </ol>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {L.northstar && <Button onClick={() => openDrawer("brief")}>{reviewConflictLabel(me)}</Button>}
          {me.actor === "product" ? (
            <Button kind="secondary" onClick={() => go("proposals")}>
              Propose a change to {poss(L.team.security)} goal
            </Button>
          ) : (
            <span className="text-[14px] text-zinc-500">
              Changes {L.team.product} proposes to {me.actor === "security" ? "your" : poss(L.team.security)} goal show up under Proposals.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
