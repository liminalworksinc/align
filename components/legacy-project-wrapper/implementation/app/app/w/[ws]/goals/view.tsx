"use client";
import Link from "next/link";
import { useState } from "react";
import { api, Btn, Card, Err, Field, Input, Loading, Note, Pill, Select, Shell, useAction, useApi } from "../../../_ui/kit";
import { AnchorsEditor, LimitEditor, MeasuresEditor, VISIBILITY_LABEL, anchorsDraft, anchorsOut, limitsOut, measuresDraft, measuresOut, type LimitDraft } from "../../../_ui/goalform";
import { LimitChips, NotesSuggest } from "../../../_ui/limits";
import type { Me } from "../../../_ui/server";
import type { Goal, WsDetail } from "../../../_ui/types";

const STATUS_TONE = { active: "violet", achieved: "green", dropped: "neutral" } as const;

export default function Goals({ me, ws }: { me: Me; ws: string }) {
  const detail = useApi<WsDetail>(`/api/v2/workspaces/${ws}`);
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const holds = useApi<{ holds: { goal: { id: string } }[] }>(`/api/v2/workspaces/${ws}/holds`);
  const held = new Set(holds.data?.holds.map((h) => h.goal.id) ?? []);
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<Goal["level"]>("team");
  const [visibility, setVisibility] = useState<Goal["visibility"]>("workspace");
  const [team, setTeam] = useState("");
  const [measures, setMeasures] = useState(measuresDraft());
  const [anchors, setAnchors] = useState(anchorsDraft());
  const [limits, setLimits] = useState<LimitDraft[]>([]);
  const act = useAction();
  const myTeams = detail.data?.teams.filter((p) => p.my_role) ?? [];
  const canCreate = detail.data && detail.data.role !== "viewer";
  const owner = detail.data?.role === "owner";
  const company = owner && level === "company";

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
                {g.level === "company" && <Pill tone="violet">company</Pill>}
                <Pill>{VISIBILITY_LABEL[g.visibility]}</Pill>
                {g.team && <Pill tone="violet">{g.team.name}</Pill>}
                {g.bindable ? <Pill tone="green">you can bind sessions</Pill> : <Pill tone="amber">needs alignment to bind</Pill>}
                {held.has(g.id) && (
                  <span data-held-goal={g.id}>
                    <Pill tone="red">agents on hold</Pill>
                  </span>
                )}
              </div>
              <p className="text-[14px] text-zinc-500">
                {g.owner.id === me.id ? "Yours" : g.owner.name}, version {g.version}
                {g.measures.length ? `. Measures: ${g.measures.map((m) => m.text + (m.target ? ` (target ${m.target})` : "")).join("; ")}` : ""}
              </p>
              <LimitChips goal={g} />
            </li>
          ))}
        </ul>
      </Card>
      {canCreate && <NotesSuggest ws={ws} onDone={feed.reload} />}
      {canCreate && (
        <Card title="New goal">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act.run(
                () =>
                  api(`/api/v2/workspaces/${ws}/goals`, {
                    body: company
                      ? { title, level: "company", visibility: "workspace", measures: measuresOut(measures), anchors: anchorsOut(anchors), limits: limitsOut(limits) }
                      : { title, level: "team", visibility, team_id: team || null, measures: measuresOut(measures), anchors: anchorsOut(anchors), limits: limitsOut(limits) },
                  }),
                () => {
                  setTitle("");
                  setMeasures(measuresDraft());
                  setAnchors(anchorsDraft());
                  setLimits([]);
                  feed.reload();
                },
              );
            }}
          >
            <Field label="Goal">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required />
            </Field>
            <MeasuresEditor value={measures} onChange={setMeasures} />
            <LimitEditor value={limits} onChange={setLimits} />
            {owner && (
              <Field label="Level" hint="Only workspace owners create company goals. A company goal has no team and everyone in the workspace sees it.">
                <Select value={level} onChange={(e) => setLevel(e.target.value as Goal["level"])}>
                  <option value="team">Team goal</option>
                  <option value="company">Company goal</option>
                </Select>
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Who can see it">
                <Select
                  value={company ? "workspace" : visibility}
                  disabled={company}
                  onChange={(e) => {
                    const v = e.target.value as Goal["visibility"];
                    setVisibility(v);
                    if (v === "team" && !team && myTeams[0]) setTeam(myTeams[0].id);
                  }}
                >
                  <option value="workspace">{VISIBILITY_LABEL.workspace}</option>
                  <option value="team" disabled={!myTeams.length}>
                    {VISIBILITY_LABEL.team}
                  </option>
                  <option value="private">{VISIBILITY_LABEL.private}</option>
                </Select>
              </Field>
              {!company && (
                <Field label="Team" hint="Members of the team can bind their sessions to it">
                  <Select value={team} onChange={(e) => setTeam(e.target.value)}>
                    <option value="">No team</option>
                    {myTeams.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
            <AnchorsEditor value={anchors} onChange={setAnchors} />
            <Btn type="submit" disabled={act.busy || !title.trim() || (!company && visibility === "team" && !team)}>
              Create goal
            </Btn>
            <Err>{act.error}</Err>
          </form>
        </Card>
      )}
    </Shell>
  );
}
