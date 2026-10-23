"use client";
import Link from "next/link";
import { useState } from "react";
import { api, Btn, Card, Err, Field, Input, Loading, Note, Pill, Select, Shell, TextArea, useAction, useApi, when } from "../../../../_ui/kit";
import { AnchorsEditor, MeasuresEditor, VISIBILITY_LABEL, anchorsDraft, anchorsOut, measuresDraft, measuresOut } from "../../../../_ui/goalform";
import type { Me } from "../../../../_ui/server";
import type { Goal, MySession } from "../../../../_ui/types";

interface Detail {
  goal: Goal;
  versions: { version: number; title: string; status: string; content_hash: string; created_at: string }[];
  contributions: { goal: { id: string; title: string } | null }[];
  can_edit: boolean;
}

function NewVersion({ ws, goal, onDone }: { ws: string; goal: Goal; onDone: () => void }) {
  const [title, setTitle] = useState(goal.title);
  const [status, setStatus] = useState(goal.status);
  const [measures, setMeasures] = useState(measuresDraft(goal));
  const [anchors, setAnchors] = useState(anchorsDraft(goal));
  const [deps, setDeps] = useState<string[]>(goal.depends_on ?? []);
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const others = feed.data?.goals.filter((g) => g.id !== goal.id && g.status === "active") ?? [];
  const act = useAction();
  return (
    <Card title="New version">
      <Note>Each change is a new version. Agents of sessions bound to this goal get the new version at their next turn.</Note>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(
            () => api(`/api/v2/workspaces/${ws}/goals/${goal.id}/versions`, { body: { version: goal.version, title, status, measures: measuresOut(measures), anchors: anchorsOut(anchors), depends_on: deps } }),
            onDone,
          );
        }}
      >
        <Field label="Goal">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required />
        </Field>
        <MeasuresEditor value={measures} onChange={setMeasures} />
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as Goal["status"])}>
            <option value="active">Active</option>
            <option value="achieved">Achieved</option>
            <option value="dropped">Dropped</option>
          </Select>
        </Field>
        <AnchorsEditor value={anchors} onChange={setAnchors} />
        {others.length > 0 && (
          <div className="mb-3">
            <p className="mb-1 text-[14px] text-zinc-600">Depends on (agents on this goal hear when these change)</p>
            {others.map((g) => (
              <label key={g.id} className="mb-1 flex items-center gap-2 text-[15px]">
                <input type="checkbox" checked={deps.includes(g.id)} onChange={(e) => setDeps((d) => (e.target.checked ? [...d, g.id] : d.filter((x) => x !== g.id)))} />
                {g.title}
              </label>
            ))}
          </div>
        )}
        <Btn type="submit" disabled={act.busy}>
          Save version {goal.version + 1}
        </Btn>
        <Err>{act.error}</Err>
      </form>
    </Card>
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
  const shared = sessions.data?.mine.filter((s) => s.state !== "stopped") ?? [];
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
      {shared.length === 0 && !sessions.loading && <Note>You have no shared sessions in this workspace. Share one with align share.</Note>}
      {shared.map((s) => (
        <label key={s.session_key} className="mb-1 flex items-center gap-2 text-[15px]">
          <input type="checkbox" checked={keys.includes(s.session_key)} onChange={(e) => setKeys((k) => (e.target.checked ? [...k, s.session_key] : k.filter((x) => x !== s.session_key)))} />
          {s.title || s.repo_alias || `${s.harness} session`}
          <span className="text-zinc-500">{s.current_epoch?.goal?.title ? `now on ${s.current_epoch.goal.title}` : "no goal yet"}</span>
        </label>
      ))}
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

function Tree({ ws, goal, canEdit, onDone }: { ws: string; goal: Goal; canEdit: boolean; onDone: () => void }) {
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const act = useAction();
  const deps = (goal.depends_on ?? []).map((id) => feed.data?.goals.find((g) => g.id === id)).filter((g): g is Goal => !!g);
  if (!goal.contributes_to?.length && !deps.length) return null;
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
      {deps.length > 0 && (
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
        </p>
      )}
      {goal.contributes_to.some((p) => p.stale) && <Note>A goal this one contributes to has changed. Agents on this goal already have the new version; check that this goal still fits it.</Note>}
      <Err>{act.error}</Err>
    </Card>
  );
}

export default function GoalPage({ me, ws, goal }: { me: Me; ws: string; goal: string }) {
  const d = useApi<Detail>(`/api/v2/workspaces/${ws}/goals/${goal}`);
  const ws0 = useApi<{ role: string }>(`/api/v2/workspaces/${ws}`);
  const g = d.data?.goal;
  return (
    <Shell me={me} ws={ws} tab="Goals">
      {d.loading && <Loading />}
      {d.error && <Err>{d.error === "Not found" ? "This goal does not exist or you can't see it." : d.error}</Err>}
      {g && (
        <>
          <h1 className="mb-2 text-[26px] font-semibold text-zinc-900">{g.title}</h1>
          <div className="mb-5 flex flex-wrap gap-2">
            <Pill tone="violet">{g.status}</Pill>
            <Pill>{VISIBILITY_LABEL[g.visibility]}</Pill>
            {g.pod && <Pill>{g.pod.name}</Pill>}
            <Pill>version {g.version}</Pill>
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
          <Tree ws={ws} goal={g} canEdit={d.data!.can_edit} onDone={d.reload} />
          {d.data!.can_edit && <NewVersion key={g.version} ws={ws} goal={g} onDone={d.reload} />}
          {ws0.data && ws0.data.role !== "viewer" && g.owner.id !== me.id && <RequestAlignment ws={ws} goal={g} me={me} />}
          <Card title="Versions">
            <ul className="text-[14px] text-zinc-600">
              {d.data!.versions.map((v) => (
                <li key={v.version} className="py-1">
                  Version {v.version}: {v.title} ({v.status}), {when(v.created_at)} <span className="font-mono text-zinc-500">{v.content_hash.slice(0, 12)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </Shell>
  );
}
