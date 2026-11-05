"use client";
import { PAGE_H1 } from "@/app/app/_ui/page-title";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, Btn, Card, Err, Field, Input, Loading, Note, Pill, Select, Shell, TextArea, useAction, useApi, when } from "../../../../_ui/kit";
import { AnchorsEditor, LimitEditor, MeasuresEditor, TargetShareField, VISIBILITY_LABEL, anchorsDraft, anchorsOut, limitsDraft, limitsOut, measuresDraft, measuresOut, takenBy, targetOut, type LimitDraft } from "../../../../_ui/goalform";
import type { Me } from "../../../../_ui/server";
import { ChangeRequestCard, ProposeChange, useGoalTitles } from "../../../../_ui/changes";
import { hiddenGoals } from "../../../../_ui/crparts";
import { dependsOnFull } from "@/lib/v2/change-words.mts";
import { GoalLimits, useStashedLimits } from "../../../../_ui/limits";
import { GoalActivityCard } from "../../../../_ui/activity";
import { AgentsOnGoalCard, HoldBanner, type HoldState } from "../../../../_ui/requests";
import type { ChangeRequest, Goal, MySession } from "../../../../_ui/types";

interface Detail {
  goal: Goal;
  versions: { version: number; title: string; status: string; target_share: number | null; content_hash: string; created_at: string }[];
  contributions: { goal: { id: string; title: string } | null }[];
  can_edit: boolean;
  /** The server's answer to "may this reader propose a change?" (not the owner, not a viewer, an active goal). */
  can_propose: boolean;
  /** How many dependencies the reader can't see (never which); a new version keeps them. */
  hidden_depends_on?: number;
  /** The goals a change request from the reader may add as a dependency (null when they can't propose). */
  dependency_choices?: string[] | null;
  /** Goals left out of dependency_choices because they already depend on this goal (adding one would make a loop). */
  dependency_loops?: string[] | null;
  /** The same goals for the New version form (null for anyone who can't save a version). */
  version_loops?: string[] | null;
}

/** The owner's New version form. Depends on leaves out the goals that already depend on this one (`loops`, the goal
 *  read's version_loops: saving one would be refused as a loop) and says so, as the propose form does (X5). */
function NewVersion({ ws, goal, hiddenDeps, loops, onDone }: { ws: string; goal: Goal; hiddenDeps: number; loops: string[] | null; onDone: () => void }) {
  const [title, setTitle] = useState(goal.title);
  const [status, setStatus] = useState(goal.status);
  const [measures, setMeasures] = useState(measuresDraft(goal));
  const [anchors, setAnchors] = useState(anchorsDraft(goal));
  const [deps, setDeps] = useState<string[]>(goal.depends_on ?? []);
  const [limits, setLimits] = useState<LimitDraft[]>(limitsDraft(goal.limits));
  const [target, setTarget] = useState(goal.target_share === null || goal.target_share === undefined ? "" : String(goal.target_share));
  // "Add to a new version" from suggested limits fills this form in.
  useStashedLimits(goal.id, useCallback((d: LimitDraft[]) => setLimits(d), []));
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const listed = feed.data?.goals.filter((g) => g.id !== goal.id && g.status === "active") ?? [];
  const others = listed.filter((g) => !loops?.includes(g.id) || (goal.depends_on ?? []).includes(g.id));
  const looping = listed.length - others.length;
  const them = (n: number) => (n === 1 ? "it" : "them");
  // At most 5 dependencies, the ones the owner can't see included: the rest can't be ticked (W4).
  const full = dependsOnFull(deps.length, hiddenDeps);
  const act = useAction();
  return (
    <section id="new-version">
      <Card title="New version">
        <Note>Each change is a new version. Saving sends it to every session bound to this goal, for its agent to pick up at its next turn.</Note>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act.run(
              () => api(`/api/v2/workspaces/${ws}/goals/${goal.id}/versions`, { body: { version: goal.version, title, status, measures: measuresOut(measures), anchors: anchorsOut(anchors), depends_on: deps, limits: limitsOut(limits), target_share: targetOut(target) } }),
              onDone,
            );
          }}
        >
          <Field label="Goal">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required />
          </Field>
          <MeasuresEditor value={measures} onChange={setMeasures} />
          <LimitEditor value={limits} onChange={setLimits} />
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as Goal["status"])}>
              <option value="active">Active</option>
              <option value="achieved">Achieved</option>
              <option value="dropped">Dropped</option>
            </Select>
          </Field>
          <TargetShareField value={target} onChange={setTarget} taken={takenBy(feed.data?.goals, goal.id)} />
          <AnchorsEditor value={anchors} onChange={setAnchors} />
          {(others.length > 0 || hiddenDeps > 0 || looping > 0) && (
            <div className="mb-3">
              <p className="mb-1 text-[14px] text-zinc-600">Depends on (agents on this goal hear when these change)</p>
              {others.map((g) => (
                <label key={g.id} className="mb-1 flex items-center gap-2 text-[15px]">
                  <input
                    type="checkbox"
                    checked={deps.includes(g.id)}
                    disabled={!deps.includes(g.id) && !!full}
                    onChange={(e) => setDeps((d) => (e.target.checked ? [...d, g.id] : d.filter((x) => x !== g.id)))}
                  />
                  {g.title}
                </label>
              ))}
              {full && (
                <p className="text-[14px] text-zinc-500" data-deps-full>
                  {full}
                </p>
              )}
              {hiddenDeps > 0 && (
                <p className="text-[14px] text-zinc-500" data-hidden-deps>
                  Also depends on {hiddenGoals(hiddenDeps)}. Saving keeps {hiddenDeps === 1 ? "it" : "them"}; only someone who can see {hiddenDeps === 1 ? "it" : "them"} can remove {hiddenDeps === 1 ? "it" : "them"}.
                </p>
              )}
              {looping > 0 && (
                <p className="text-[14px] text-zinc-500" data-deps-looping>
                  {looping === 1 ? "1 goal isn't offered: it already depends on this goal" : `${looping} goals aren't offered: they already depend on this goal`}, so adding {them(looping)} would make a loop.
                </p>
              )}
            </div>
          )}
          <Btn type="submit" disabled={act.busy}>
            Save version {goal.version + 1}
          </Btn>
          <Err>{act.error}</Err>
        </form>
      </Card>
    </section>
  );
}

function RequestAlignment({ ws, goal, me }: { ws: string; goal: Goal; me: Me }) {
  const sessions = useApi<{ mine: MySession[] }>(`/api/v2/workspaces/${ws}/sessions`);
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const [choice, setChoice] = useState<"contribution" | "work_toward">("contribution");
  const [keys, setKeys] = useState<string[]>([]);
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const act = useAction();
  // A session already on this goal (following it through an alignment, or bound to it) is not offered again (A1-cross-4).
  const live = sessions.data?.mine.filter((s) => s.state !== "stopped") ?? [];
  const onGoal = (s: MySession) => s.governing_goal?.id === goal.id || s.current_epoch?.goal?.id === goal.id;
  const shared = live.filter((s) => !onGoal(s));
  const already = live.length - shared.length;
  const mineGoals = feed.data?.goals.filter((g) => g.id !== goal.id && g.bindable && g.owner.id === me.id) ?? [];
  if (goal.status !== "active") return null;
  return (
    <Card title="Align with this goal">
      <p className="mb-3 text-[15px] text-zinc-600">Ask {goal.owner.id === me.id ? "yourself" : goal.owner.name} to approve. Choose what it should do:</p>
      <label className="mb-2 flex items-start gap-2 text-[15px]">
        <input type="radio" name="choice" checked={choice === "contribution"} onChange={() => setChoice("contribution")} className="mt-1" />
        <span>
          <strong className="text-zinc-900">Recognize contribution only.</strong> Records that your work contributes to this goal. Your usage stays where it is.
        </span>
      </label>
      <label className="mb-4 flex items-start gap-2 text-[15px]">
        <input type="radio" name="choice" checked={choice === "work_toward"} onChange={() => setChoice("work_toward")} className="mt-1" />
        <span>
          <strong className="text-zinc-900">Work toward this goal and count future usage here.</strong> The sessions you pick follow this goal, and their future usage counts under it. Past usage does not move.
        </span>
      </label>
      {choice === "contribution" && (
        <Field label="Your goal that contributes (optional)">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">None, just the sessions below</option>
            {mineGoals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <p className="mb-1 text-[14px] text-zinc-600">Your shared sessions{choice === "work_toward" ? " (pick at least one)" : ""}</p>
      {sessions.loading && <Loading />}
      {live.length === 0 && !sessions.loading && <Note>You have no shared sessions in this workspace. Share one with align share.</Note>}
      {/* Each session as the Alignments tab names it, "started <time> · …<key end>", so two of one person in one
          repository can be told apart before one is ticked (A1-cross-4). */}
      {shared.map((s) => (
        <label key={s.session_key} className="mb-1 flex items-start gap-2 text-[15px]" data-align-session={s.session_key.slice(-6)}>
          <input type="checkbox" className="mt-1" checked={keys.includes(s.session_key)} onChange={(e) => setKeys((k) => (e.target.checked ? [...k, s.session_key] : k.filter((x) => x !== s.session_key)))} />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {s.title || s.repo_alias || `${s.harness} session`}
            <span className="text-zinc-500">
              {" "}
              · started {when(s.started_at)} · …{s.session_key.slice(-6)} · {s.current_epoch?.goal ? `now on ${s.current_epoch.goal.private ? "a goal you can't see" : s.current_epoch.goal.title}` : "no goal yet"}
            </span>
          </span>
        </label>
      ))}
      {already > 0 && (
        <p className="mb-2 text-[14px] text-zinc-500" data-align-already>
          {already === 1 ? "1 of your sessions is already on this goal, so it isn't offered." : `${already} of your sessions are already on this goal, so they aren't offered.`}
        </p>
      )}
      <Field label="Note for the approvers (never sent to agents)">
        <TextArea rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Btn
        disabled={act.busy || (choice === "work_toward" && !keys.length) || (choice === "contribution" && !keys.length && !source)}
        onClick={() =>
          void act.run(
            () => api(`/api/v2/workspaces/${ws}/alignments`, { body: { target_goal_id: goal.id, source_goal_id: source || null, choice, session_keys: keys, note: note || null } }),
            () => setSent(true),
          )
        }
      >
        Send request
      </Btn>
      {sent && (
        <Note>
          Sent. Follow it on <Link href={`/app/w/${ws}/alignments`} className="underline">Alignments</Link>.
        </Note>
      )}
      <Err>{act.error}</Err>
    </Card>
  );
}

function Tree({ ws, goal, canEdit, hiddenDeps, onDone }: { ws: string; goal: Goal; canEdit: boolean; hiddenDeps: number; onDone: () => void }) {
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const act = useAction();
  const deps = (goal.depends_on ?? []).map((id) => feed.data?.goals.find((g) => g.id === id)).filter((g): g is Goal => !!g);
  if (!goal.contributes_to?.length && !deps.length && !hiddenDeps) return null;
  return (
    <Card title="Goal tree">
      {goal.contributes_to.map((p) => (
        <div key={p.id} className="mb-2 flex flex-wrap items-center gap-2 text-[15px]">
          <span>
            Contributes to{" "}
            <Link href={`/app/w/${ws}/goals/${p.id}`} className="underline">
              {p.title}
            </Link>{" "}
            (version {p.version})
          </span>
          {p.stale ? <Pill tone="amber">{p.reviewed_version ? `reviewed against version ${p.reviewed_version}` : "not reviewed yet"}</Pill> : <Pill tone="green">reviewed</Pill>}
          {p.stale && canEdit && (
            <Btn kind="secondary" disabled={act.busy} onClick={() => void act.run(() => api(`/api/v2/workspaces/${ws}/goals/${goal.id}/review`, { body: { parent_id: p.id } }), onDone)}>
              Still fits version {p.version}
            </Btn>
          )}
        </div>
      ))}
      {(deps.length > 0 || hiddenDeps > 0) && (
        <p className="text-[15px]">
          Depends on:{" "}
          {deps.map((g, i) => (
            <span key={g.id}>
              {i > 0 && ", "}
              <Link href={`/app/w/${ws}/goals/${g.id}`} className="underline">
                {g.title}
              </Link>{" "}
              (version {g.version})
            </span>
          ))}
          {/* After named ones, "and 1 other goal you can't see" (X1): never read as if a named goal were hidden. */}
          {hiddenDeps > 0 && (deps.length ? ` and ${hiddenDeps === 1 ? "1 other goal" : `${hiddenDeps} other goals`} you can't see` : hiddenGoals(hiddenDeps))}
        </p>
      )}
      {/* The review prompt is the owner's alone (whoever can edit it); everyone else sees the amber pill. Sessions on this
          goal are only told about the parent's new version by the align CLI, so nothing here says they have it. */}
      {canEdit && goal.contributes_to.some((p) => p.stale) && (
        <Note>A goal this one contributes to has a new version, and this goal hasn&apos;t changed. Check that it still fits: press Still fits, or save a new version.</Note>
      )}
      <Err>{act.error}</Err>
    </Card>
  );
}

/** "Propose a change" (when the server says `can_propose`: active goals, not the owner, not a viewer) and the goal's
 *  change requests (everyone who reads it). A decision on a card reloads the list once, then the goal: the list's own
 *  reload already shows the version its launch made, so that version doesn't reload it again (C2 N3). Only a version
 *  the list hasn't seen (a new version saved above) reloads it, keeping what is on screen meanwhile (never a remount
 *  and its "Loading…"). */
function ChangeRequests({
  ws,
  goal,
  me,
  canPropose,
  choices,
  loops,
  hiddenDeps,
  onGoalChanged,
}: {
  ws: string;
  goal: Goal;
  me: Me;
  canPropose: boolean;
  choices: string[] | null;
  loops: string[] | null;
  hiddenDeps: number;
  onGoalChanged: () => void;
}) {
  const list = useApi<{ change_requests: ChangeRequest[] }>(`/api/v2/workspaces/${ws}/goals/${goal.id}/change-requests`);
  const titles = useGoalTitles(ws);
  const { reload } = list;
  // After a decision: the list first, then the goal, once the list has answered.
  const goalAfterList = useRef(false);
  const decided = useCallback(() => {
    goalAfterList.current = true;
    reload();
  }, [reload]);
  useEffect(() => {
    if (!goalAfterList.current || (!list.data && !list.error)) return;
    goalAfterList.current = false;
    onGoalChanged();
  }, [list.data, list.error, onGoalChanged]);
  // A goal version the list doesn't reflect yet (its requests carry the goal's version as they read it).
  const seenVersion = useRef(goal.version);
  const listVersion = list.data?.change_requests[0]?.goal.version;
  useEffect(() => {
    if (seenVersion.current === goal.version) return;
    seenVersion.current = goal.version;
    if (listVersion !== undefined && listVersion !== goal.version) reload();
  }, [goal.version, listVersion, reload]);
  if (!canPropose && !list.data?.change_requests.length) return null;
  return (
    <section id="change-requests">
      <Card title="Change requests">
        {canPropose && (
          <div className="mb-4">
            <ProposeChange ws={ws} goal={goal} choices={choices} loops={loops} hiddenDeps={hiddenDeps} onDone={reload} />
          </div>
        )}
        {list.loading && <Loading />}
        <Err>{list.error}</Err>
        {list.data?.change_requests.length === 0 && <Note>No change requests yet.</Note>}
        {list.data?.change_requests.map((cr) => (
          <ChangeRequestCard key={`${cr.id}:${cr.revision}:${cr.state}:${cr.goal.version}`} ws={ws} cr={cr} me={me.id} titles={titles} onDone={decided} />
        ))}
      </Card>
    </section>
  );
}

export default function GoalPage({ me, ws, goal }: { me: Me; ws: string; goal: string }) {
  const d = useApi<Detail>(`/api/v2/workspaces/${ws}/goals/${goal}`);
  // A limit proposed from the Limits card is a new change request: the list below reloads with it.
  const [proposed, setProposed] = useState(0);
  const reloadDetail = d.reload;
  const limitsDone = useCallback(() => {
    reloadDetail();
    setProposed((n) => n + 1);
  }, [reloadDetail]);
  const ws0 = useApi<{ role: string }>(`/api/v2/workspaces/${ws}`);
  const hold = useApi<HoldState>(`/api/v2/workspaces/${ws}/goals/${goal}/hold`);
  const g = d.data?.goal;
  return (
    <Shell me={me} ws={ws} tab="Goals">
      {d.loading && <Loading />}
      {d.error && <Err>{d.error === "Not found" ? "This goal does not exist or you can't see it." : d.error}</Err>}
      {g && (
        <>
          <HoldBanner hold={hold.data?.held ?? null} me={me.id} />
          <h1 className={`${PAGE_H1} mb-2`}>{g.title}</h1>
          <div className="mb-5 flex flex-wrap gap-2">
            <Pill tone="violet">{g.status}</Pill>
            <Pill>{g.level === "company" ? "company goal" : "team goal"}</Pill>
            <Pill>{VISIBILITY_LABEL[g.visibility]}</Pill>
            {g.team && <Pill>team {g.team.name}</Pill>}
            <Pill>version {g.version}</Pill>
            {g.target_share !== null && g.target_share !== undefined && <Pill tone="violet">target {g.target_share}% of agent time</Pill>}
            <span className="text-[14px] text-zinc-500">Owner: {g.owner.id === me.id ? "you" : g.owner.name}</span>
          </div>
          <Card title="Measures">
            {g.measures.length === 0 && <Note>No measures.</Note>}
            <ul className="list-disc pl-5 text-[15px]">
              {g.measures.map((m) => (
                <li key={m.id}>
                  {m.text}
                  {m.target && <span className="text-zinc-500"> (target: {m.target})</span>}
                </li>
              ))}
            </ul>
            {(g.anchors.repos.length > 0 || g.anchors.branch_patterns.length > 0 || g.anchors.issues.length > 0) && (
              <p className="mt-3 text-[14px] text-zinc-500">
                Anchors: {[...g.anchors.repos, ...g.anchors.branch_patterns, ...g.anchors.issues].join(", ")}
              </p>
            )}
            {d.data!.contributions.length > 0 && <p className="mt-3 text-[14px] text-zinc-500">Contributing goals: {d.data!.contributions.map((c) => c.goal!.title).join(", ")}</p>}
          </Card>
          <GoalLimits ws={ws} goal={g} canEdit={d.data!.can_edit} onDone={limitsDone} />
          <Tree ws={ws} goal={g} canEdit={d.data!.can_edit} hiddenDeps={d.data!.hidden_depends_on ?? 0} onDone={d.reload} />
          <GoalActivityCard ws={ws} goal={g} me={me} />
          {/* Not keyed by the goal's version: a new version reloads the card in place (C3-4). Keyed, it shared its key with
              the New version form below, and a launch left a second card beside the first. */}
          <AgentsOnGoalCard ws={ws} goal={g} me={me} onHoldChanged={hold.reload} />
          {d.data!.can_edit && <NewVersion key={g.version} ws={ws} goal={g} hiddenDeps={d.data!.hidden_depends_on ?? 0} loops={d.data!.version_loops ?? null} onDone={d.reload} />}
          {/* Keyed by limit proposals only (a new request to list): a goal version, a launch's included, reloads the list
              in place (C2 N3). */}
          <ChangeRequests
            key={proposed}
            ws={ws}
            goal={g}
            me={me}
            canPropose={d.data!.can_propose}
            choices={d.data!.dependency_choices ?? null}
            loops={d.data!.dependency_loops ?? null}
            hiddenDeps={d.data!.hidden_depends_on ?? 0}
            onGoalChanged={d.reload}
          />
          {ws0.data && ws0.data.role !== "viewer" && g.owner.id !== me.id && <RequestAlignment ws={ws} goal={g} me={me} />}
          <Card title="Versions">
            <ul className="text-[14px] text-zinc-600">
              {d.data!.versions.map((v) => (
                <li key={v.version} className="py-1">
                  Version {v.version}: {v.title} ({v.status}
                  {v.target_share !== null && v.target_share !== undefined ? `, target ${v.target_share}%` : ""}), {when(v.created_at)} <span className="font-mono text-zinc-500">{v.content_hash.slice(0, 12)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </Shell>
  );
}
