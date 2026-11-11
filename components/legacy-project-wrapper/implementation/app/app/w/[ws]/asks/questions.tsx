"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError, Btn, Err, Field, Pill, Select, sentence, TextArea, useAction } from "../../../_ui/kit";
import { Panel, Timeline, type TimelineEvent } from "../../../_ui/ds";
import { NoticeBox, useNotice } from "../../../_ui/crparts";
import type { Goal } from "../../../_ui/types";
import { isBlankText } from "@/lib/v2/text-core.mts";

// Agents asking (LIM-2505): when a shared session's work drifts from its goal, its agent asks the goal's owner one
// question with evidence (GET .../questions). The owner answers here: continue, steer with a note, or switch goal; the
// answer reaches that session's next turn. Everyone who reads the goal sees the question; only its owner answers.

type AnswerKind = "continue" | "steer" | "switch";
interface Question {
  id: string;
  state: "open" | "answered";
  goal: { id: string; title: string; version: number; owner: { id: string; name: string } };
  asked_by: { id: string; name: string };
  asked_at: string;
  evidence: {
    limit: { id: string; type: "must" | "must_not" | "out_of_scope"; text: string };
    why: string;
    files: { path: string; at: string }[];
    stretch: { from: string; to: string };
  };
  answer: { kind: AnswerKind; text: string | null; target_goal: { id: string; title: string } | null; by: { id: string; name: string }; at: string } | null;
  can: { answer: boolean };
}

const LIMIT_WORDS = { must: "Must", must_not: "Must not", out_of_scope: "Out of scope" } as const;
const ANSWER_WORDS: Record<AnswerKind, string> = { continue: "Yes, continue", steer: "Steer", switch: "Switch goal" };

/** The stretch as a timeline: each file the session edited, then the question. Agent reported, never verified. */
function events(q: Question, me: string): TimelineEvent[] {
  const who = q.asked_by.id === me ? "Your agent" : `${q.asked_by.name}'s agent`;
  const edits: TimelineEvent[] = q.evidence.files.map((f, i) => ({
    id: `${q.id}:f${i}`,
    who,
    what: (
      <>
        edited <span className="font-mono text-[13px] [overflow-wrap:anywhere]">{f.path}</span>
      </>
    ),
    when: f.at,
    source: { kind: "reported" },
  }));
  const asked: TimelineEvent = {
    id: `${q.id}:asked`,
    who,
    what: "asked whether to go on",
    when: q.asked_at,
    source: { kind: "reported" },
    detail: (
      <>
        <span className="font-medium text-(--text-1)">
          {LIMIT_WORDS[q.evidence.limit.type]} “{q.evidence.limit.text}”
        </span>
        <br />
        {q.evidence.why}
      </>
    ),
  };
  return [...edits.sort((a, b) => a.when.localeCompare(b.when)), asked];
}

function AnswerForm({ ws, q, goals, onDone }: { ws: string; q: Question; goals: Goal[]; onDone: () => void }) {
  const [kind, setKind] = useState<AnswerKind | null>(null);
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const act = useAction();
  const [notice, setNotice] = useNotice(`question:${q.id}`);
  const others = goals.filter((g) => g.id !== q.goal.id && g.status === "active");
  const send = (answer: AnswerKind) =>
    act.run(async () => {
      setNotice(null);
      try {
        await api(`/api/v2/workspaces/${ws}/questions/${q.id}/answer`, { body: answer === "steer" ? { answer, text } : answer === "switch" && target ? { answer, goal_id: target } : { answer } });
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 409) throw e;
        setNotice({ kind: "refused", text: `Not recorded. ${sentence(e.message)}` });
      }
      onDone();
    });
  return (
    <div className="mt-3">
      {notice && <NoticeBox notice={notice} />}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Answer the agent">
        <Btn disabled={act.busy} onClick={() => void send("continue")}>
          Yes, continue
        </Btn>
        <Btn kind="secondary" disabled={act.busy} onClick={() => setKind((k) => (k === "steer" ? null : "steer"))}>
          Steer…
        </Btn>
        <Btn kind="secondary" disabled={act.busy} onClick={() => setKind((k) => (k === "switch" ? null : "switch"))}>
          Switch goal…
        </Btn>
      </div>
      {kind === "steer" && (
        <div className="mt-3 rounded-(--radius-m) border border-(--edge) p-3" data-answer-form="steer">
          <Field label="What the agent should do instead" hint="It reaches the agent at its next turn, quoted as yours.">
            <TextArea rows={3} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Btn disabled={act.busy || isBlankText(text)} onClick={() => void send("steer")}>
            Send steer
          </Btn>
        </div>
      )}
      {kind === "switch" && (
        <div className="mt-3 rounded-(--radius-m) border border-(--edge) p-3" data-answer-form="switch">
          <Field label="Goal this work belongs to (optional)" hint="The agent stops this work and its person picks the goal; nothing switches on its own.">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Not sure: ask them to pick</option>
              {others.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </Select>
          </Field>
          <Btn disabled={act.busy} onClick={() => void send("switch")}>
            Send switch goal
          </Btn>
        </div>
      )}
      <Err>{act.error}</Err>
    </div>
  );
}

function QuestionCard({ ws, q, me, goals, onDone }: { ws: string; q: Question; me: string; goals: Goal[]; onDone: () => void }) {
  const ownerSays = q.goal.owner.id === me ? "you" : q.goal.owner.name;
  return (
    <article className="mb-3 rounded-(--radius-m) border border-(--line) bg-(--bg-raised) p-4 last:mb-0" data-question={q.id} data-question-state={q.state}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 text-[15px] font-semibold text-(--text-1)">
          {q.asked_by.id === me ? "Your agent" : `${q.asked_by.name}'s agent`} may be drifting from{" "}
          <Link href={`/app/w/${ws}/goals/${q.goal.id}`} className="text-(--accent-text) underline-offset-2 hover:underline">
            {q.goal.title}
          </Link>
        </h3>
        <Pill tone={q.state === "open" ? "amber" : "green"}>{q.state === "open" ? "waiting" : "answered"}</Pill>
      </div>
      <p className="mb-3 text-[14px] text-(--text-2)">
        {q.evidence.files.length ? `${q.evidence.files.length} file${q.evidence.files.length > 1 ? "s" : ""} edited in this stretch.` : "No file edits recorded in this stretch."} Agent reported from its machine: the
        files and times, never the agent&apos;s own words.
      </p>
      <Timeline events={events(q, me)} />
      {q.answer && (
        <p className="mt-3 text-[14px] text-(--text-1)" data-answer={q.answer.kind}>
          <span className="font-semibold">{q.answer.by.id === me ? "You" : q.answer.by.name}</span> answered {ANSWER_WORDS[q.answer.kind]}
          {q.answer.kind === "steer" && q.answer.text ? `: “${q.answer.text}”` : ""}
          {q.answer.kind === "switch" && q.answer.target_goal ? ` to ${q.answer.target_goal.title}` : ""}.
        </p>
      )}
      {q.can.answer ? (
        <AnswerForm ws={ws} q={q} goals={goals} onDone={onDone} />
      ) : (
        q.state === "open" && <p className="mt-3 text-[13px] text-(--text-3)">Waiting on {ownerSays === "you" ? "you" : `${ownerSays}, the goal's owner`}.</p>
      )}
    </article>
  );
}

export function AgentQuestions({ ws, me, questions, goals, onDone }: { ws: string; me: string; questions: Question[]; goals: Goal[]; onDone: () => void }) {
  if (!questions.length) return null;
  const open = questions.filter((q) => q.state === "open");
  const done = questions.filter((q) => q.state !== "open").slice(0, 5);
  return (
    <Panel className="mb-4" title="Agents asking">
      {open.length === 0 && <p className="mb-3 text-[15px] text-(--text-2)">No agent is waiting on an answer.</p>}
      {open.map((q) => (
        <QuestionCard key={`${q.id}:${q.state}`} ws={ws} q={q} me={me} goals={goals} onDone={onDone} />
      ))}
      {done.length > 0 && (
        <details className="mt-2 text-[14px] text-(--text-2)">
          <summary className="cursor-pointer py-1 font-medium text-(--text-1) max-sm:flex max-sm:min-h-[44px] max-sm:items-center">Answered recently</summary>
          {done.map((q) => (
            <QuestionCard key={`${q.id}:${q.state}`} ws={ws} q={q} me={me} goals={goals} onDone={onDone} />
          ))}
        </details>
      )}
    </Panel>
  );
}

export type { Question };
