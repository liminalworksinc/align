"use client";
import Link from "next/link";
import { useState } from "react";
import { api, Btn, Card, Err, Field, Input, Loading, Note, Pill, Select, Shell, useAction, useApi } from "../../_ui/kit";
import { AnchorsEditor, MeasuresEditor, TargetShareField, VISIBILITY_LABEL, anchorsDraft, anchorsOut, measuresDraft, measuresOut, takenBy, targetOut } from "../../_ui/goalform";
import type { Me } from "../../_ui/server";
import type { Goal, WsDetail } from "../../_ui/types";

const STATUS_TONE = { active: "violet", achieved: "green", dropped: "neutral" } as const;

export default function Goals({ me, ws }: { me: Me; ws: string }) {
  const detail = useApi<WsDetail>(`/api/v2/workspaces/${ws}`);
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<Goal["visibility"]>("workspace");
  const [pod, setPod] = useState("");
  const [measures, setMeasures] = useState(measuresDraft());
  const [anchors, setAnchors] = useState(anchorsDraft());
  const [target, setTarget] = useState("");
  const act = useAction();
  const myPods = detail.data?.pods.filter((p) => p.my_role) ?? [];
  const canCreate = detail.data && detail.data.role !== "viewer";

  return (
    <Shell me={me} ws={ws} tab="Goals">
      <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">Goals</h1>
      <Err>{detail.error ?? feed.error}</Err>
      <Card>
        {feed.loading && <Loading />}
        {feed.data?.goals.length === 0 && <Note>No goals you can see yet.</Note>}
        <ul className="divide-y divide-zinc-200">
          {feed.data?.goals.map((g) => (
            <li key={g.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/app/w/${ws}/goals/${g.id}`} className="text-[17px] text-zinc-900 hover:underline">
                  {g.title}
                </Link>
                <Pill tone={STATUS_TONE[g.status]}>{g.status}</Pill>
                <Pill>{VISIBILITY_LABEL[g.visibility]}</Pill>
                {g.pod && <Pill tone="violet">{g.pod.name}</Pill>}
                {g.bindable ? <Pill tone="green">you can bind sessions</Pill> : <Pill tone="amber">needs alignment to bind</Pill>}
                {g.target_share !== null && g.target_share !== undefined && <Pill tone="violet">target {g.target_share}%</Pill>}
                {g.allocation && (g.allocation.share_7d > 0 || g.target_share !== null) && (
                  <Pill tone={g.allocation.gap_7d !== null && Math.abs(g.allocation.gap_7d) >= 10 ? "amber" : "neutral"}>last 7 days {g.allocation.share_7d}%</Pill>
                )}
              </div>
              <p className="text-[14px] text-zinc-500">
                {g.owner.id === me.id ? "Yours" : g.owner.name}, version {g.version}
                {g.measures.length ? `. Measures: ${g.measures.map((m) => m.text + (m.target ? ` (target ${m.target})` : "")).join("; ")}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </Card>
      {canCreate && (
        <Card title="New goal">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act.run(
                () =>
                  api(`/api/v2/workspaces/${ws}/goals`, {
                    body: { title, visibility, pod_id: pod || null, measures: measuresOut(measures), anchors: anchorsOut(anchors), target_share: targetOut(target) },
                  }),
                () => {
                  setTitle("");
                  setMeasures(measuresDraft());
                  setAnchors(anchorsDraft());
                  setTarget("");
                  feed.reload();
                },
              );
            }}
          >
            <Field label="Goal">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required />
            </Field>
            <MeasuresEditor value={measures} onChange={setMeasures} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Who can see it">
                <Select
                  value={visibility}
                  onChange={(e) => {
                    const v = e.target.value as Goal["visibility"];
                    setVisibility(v);
                    if (v === "pod" && !pod && myPods[0]) setPod(myPods[0].id);
                  }}
                >
                  <option value="workspace">{VISIBILITY_LABEL.workspace}</option>
                  <option value="pod" disabled={!myPods.length}>
                    {VISIBILITY_LABEL.pod}
                  </option>
                  <option value="private">{VISIBILITY_LABEL.private}</option>
                </Select>
              </Field>
              <Field label="Pod" hint="Members of the pod can bind their sessions to it">
                <Select value={pod} onChange={(e) => setPod(e.target.value)}>
                  <option value="">No pod</option>
                  {myPods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <TargetShareField value={target} onChange={setTarget} taken={takenBy(feed.data?.goals)} />
            <AnchorsEditor value={anchors} onChange={setAnchors} />
            <Btn type="submit" disabled={act.busy || !title.trim() || (visibility === "pod" && !pod)}>
              Create goal
            </Btn>
            <Err>{act.error}</Err>
          </form>
        </Card>
      )}
    </Shell>
  );
}
