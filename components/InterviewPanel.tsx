"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { field, toBody, type Form } from "@/components/ScenarioForm";
import { ScenarioInput } from "@/lib/scenario-input";
import { ConflictSentence } from "@/components/v6/ConflictSentence";

// The intake interview on /new (lib/interview.ts): Claude asks one question at a time and drafts the form below.
// Voice uses the browser's own speech recognition when it has one (the mic button is hidden otherwise). The form
// stays the source of truth: the person reviews every field and presses Create; nothing here is stored.

type Turn = { role: "user" | "assistant"; text: string };
type Draft = Record<string, string>;

const GREETING =
  "Hi! Tell me about the last time a priority changed while work was already underway. What changed, and what work (yours, your team’s, or your AI agents’) was still going in the old direction? Use made-up or anonymized names. You can type, or press Talk and say it.";

/** Where each draft key lands in the form. */
const PATHS: Record<string, (f: Form, v: string) => void> = {
  company: (f, v) => (f.company = v),
  company_goal: (f, v) => (f.company_goal.objective = v),
  requirement: (f, v) => (f.company_goal.measures[0] = v),
  asking_team: (f, v) => (f.asking.team = v),
  asking_lead: (f, v) => (f.asking.lead = v),
  asking_goal: (f, v) => (f.asking.objective = v),
  owning_team: (f, v) => (f.owning.team = v),
  owning_lead: (f, v) => (f.owning.lead = v),
  owning_goal: (f, v) => (f.owning.objective = v),
  owning_measure: (f, v) => (f.owning.measures[0] = v),
  dependency: (f, v) => (f.dependency = v),
  asking_work: (f, v) => (f.work_items[0].task = v),
  owning_work: (f, v) => (f.work_items[1].task = v),
  plan: (f, v) => (f.plan.text = v),
};
const READ: Record<string, (f: Form) => string> = {
  company: (f) => f.company,
  company_goal: (f) => f.company_goal.objective,
  requirement: (f) => f.company_goal.measures[0] ?? "",
  asking_team: (f) => f.asking.team,
  asking_lead: (f) => f.asking.lead,
  asking_goal: (f) => f.asking.objective,
  owning_team: (f) => f.owning.team,
  owning_lead: (f) => f.owning.lead,
  owning_goal: (f) => f.owning.objective,
  owning_measure: (f) => f.owning.measures[0] ?? "",
  dependency: (f) => f.dependency,
  asking_work: (f) => f.work_items[0]?.task ?? "",
  owning_work: (f) => f.work_items[1]?.task ?? "",
  plan: (f) => f.plan.text,
};

/** A form step to jump to: its number in ScenarioFields (the "n." in the step heading), and which control to focus there. */
export type FormTarget = { step: number; control?: "textarea" };

/** "Draft so far": one row per thing Create needs, each with the schema paths it covers (lib/scenario-input.ts, the
 *  same rules the server applies). A row is ticked when none of its paths has an issue. Each one jumps to its step. */
const ROWS: { label: string; paths: string[]; target: FormTarget }[] = [
  { label: "Company", paths: ["company"], target: { step: 1 } },
  { label: "What changed", paths: ["company_goal.measures", "company_measure"], target: { step: 2 } },
  { label: "Goal it affects", paths: ["company_goal.objective"], target: { step: 2 } },
  { label: "Who’s changing the priority", paths: ["asking.team", "asking.lead"], target: { step: 3 } },
  { label: "What they’re after", paths: ["asking.objective", "asking.measures"], target: { step: 3 } },
  { label: "Whose plan has to change", paths: ["owning.team", "owning.lead"], target: { step: 4 } },
  { label: "What they were working toward", paths: ["owning.objective"], target: { step: 4 } },
  { label: "How they track it", paths: ["owning.measures", "owner_measure"], target: { step: 4 } },
  { label: "Why one needs the other", paths: ["dependency"], target: { step: 4, control: "textarea" } },
  { label: "Work on the old plan", paths: ["work_items"], target: { step: 5 } },
  { label: "The plan", paths: ["plan"], target: { step: 6, control: "textarea" } },
];

/** The checklist rows, and whether the whole form would pass Create's validation as it stands. */
function checklist(f: Form): { items: { label: string; ok: boolean; target: FormTarget }[]; valid: boolean } {
  const parsed = ScenarioInput.safeParse({ ...toBody(f), confirm: "replace" });
  const bad = parsed.success ? [] : parsed.error.issues.map((i) => i.path.join("."));
  const hit = (p: string) => bad.some((b) => b === p || b.startsWith(`${p}.`));
  return { items: ROWS.map((r) => ({ label: r.label, ok: !r.paths.some(hit), target: r.target })), valid: parsed.success };
}

function MicIcon() {
  return (
    <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

// The browser's speech recognition, where it exists (Chrome, Edge, Safari). Typed loosely: not in every DOM lib.
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
function speechCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** The page owns whether the interview is open (`onStart`) and hears when it reports done (`onDone`), so it can fold the
 *  form away while the interview runs and open it at the end. `onJump` opens the form at one step. */
export function InterviewPanel({
  code,
  form,
  set,
  open,
  onStart,
  onDone,
  onJump,
}: {
  code: string;
  form: Form;
  set: (fn: (f: Form) => Form) => void;
  open: boolean;
  onStart: () => void;
  onDone: () => void;
  onJump: (target: FormTarget) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [listening, setListening] = useState(false);
  const filledByAi = useRef(new Map<string, string>()); // key -> the value the interviewer last wrote there
  const rec = useRef<Recognition | null>(null);
  const before = useRef("");
  const end = useRef<HTMLDivElement | null>(null);
  // Only rendered after /new's client-side config fetch, never on the server, so this needs no effect.
  const canSpeak = !!speechCtor();

  // Block bodies: an effect may return only a cleanup function, and scrollIntoView returns a Promise in current Chrome.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns, busy]);
  useEffect(
    () => () => {
      rec.current?.stop();
    },
    [],
  );

  /** Fill a field only when it's empty or still holds what the interviewer wrote: never over the person's own edits. */
  function apply(draft: Draft) {
    set((f) => {
      for (const [k, v] of Object.entries(draft)) {
        if (!v || !PATHS[k]) continue;
        const now = READ[k](f).trim();
        if (now === "" || now === filledByAi.current.get(k)) {
          PATHS[k](f, v);
          filledByAi.current.set(k, v);
        }
      }
      return f;
    });
  }

  function toggleMic() {
    if (listening) return rec.current?.stop();
    const Ctor = speechCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = true;
    before.current = input ? `${input.trim()} ` : "";
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setInput(before.current + text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    rec.current?.stop();
    const next: Turn[] = [...turns, { role: "user", text }];
    setTurns(next);
    setInput("");
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/workspaces/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, ...(code.trim() ? { signup_code: code.trim() } : {}) }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTurns(turns); // the message wasn't answered: give it back to edit or resend
        setInput(text);
        setProblem(res.status === 403 ? "Enter your signup code above first, then try again." : typeof data.error === "string" ? data.error : "The interviewer didn't answer. Try again, or fill in the form below.");
        return;
      }
      setTurns([...next, { role: "assistant", text: String(data.reply ?? "") }]);
      if (data.draft && typeof data.draft === "object") apply(data.draft as Draft);
      setDone(!!data.done);
      if (data.done) onDone();
    } catch {
      setTurns(turns);
      setInput(text);
      setProblem("The interviewer didn't answer. Try again, or fill in the form below.");
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <section className="mb-6 rounded-[14px] border border-violet-300 bg-violet-50 p-5">
        <h2 className="mb-1 text-[20px] font-semibold text-zinc-900">Rather talk it through?</h2>
        <p className="mb-3 text-[16px] text-zinc-700">Tell an AI interviewer about one recent priority change, by voice or text. It asks a few short questions and fills in the form below for you. You check every field before creating.</p>
        <Button onClick={onStart}>Start the interview</Button>
      </section>
    );

  const { items, valid } = checklist(form);
  const count = items.filter((i) => i.ok).length;
  const missing = items.length - count;

  return (
    <section aria-labelledby="interview-heading" className="mb-6 rounded-[14px] border border-violet-300 bg-white p-5">
      <h2 id="interview-heading" className="mb-3 text-[20px] font-semibold text-zinc-900">
        Talk it through
      </h2>

      {/* The read-back, pinned here so each answer visibly lands while the form is folded away. Same props as ScenarioFields passes. */}
      <div className="mb-4 rounded-[10px] border border-zinc-200 bg-zinc-50 px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-zinc-500">Say it as one sentence</span>
        <ConflictSentence
          asking={form.asking.team}
          owning={form.owning.team}
          measure={form.owning.measures[form.owner_measure] ?? ""}
          because={form.company_goal.measures[form.company_measure] ?? ""}
        />
      </div>

      <div className="mb-4 rounded-[10px] border border-zinc-200 px-4 py-3">
        <h3 className="mb-2 flex items-baseline justify-between gap-3 text-[16px] font-semibold text-zinc-900">
          <span>Draft so far</span>
          <span className="font-mono text-[14px] font-normal text-zinc-700">
            {count} of {items.length}
            <span className="sr-only"> filled in</span>
          </span>
        </h3>
        <ul className="grid gap-1 sm:grid-cols-2">
          {items.map((it) => (
            <li key={it.label}>
              <button
                type="button"
                onClick={() => onJump(it.target)}
                className="flex min-h-9 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[16px] text-zinc-900 hover:bg-zinc-100 focus:outline-2 focus:outline-offset-1 focus:outline-[var(--al-focus)]"
              >
                <span aria-hidden="true" className={it.ok ? "font-bold text-emerald-700" : "text-zinc-500"}>
                  {it.ok ? "✓" : "○"}
                </span>
                <span>{it.label}</span>
                <span className="sr-only">{it.ok ? ": filled in. Go to it in the form." : ": not filled in yet. Go to it in the form."}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div role="log" aria-live="polite" aria-label="Interview" className="mb-3 max-h-[360px] space-y-3 overflow-y-auto">
        {[{ role: "assistant" as const, text: GREETING }, ...turns].map((t, i) => (
          <p key={i} className={t.role === "assistant" ? "max-w-[85%] rounded-[12px] bg-zinc-100 px-3 py-2 text-[16px] text-zinc-900" : "ml-auto max-w-[85%] rounded-[12px] bg-violet-100 px-3 py-2 text-[16px] text-zinc-900"}>
            <span className="sr-only">{t.role === "assistant" ? "Interviewer: " : "You: "}</span>
            {t.text}
          </p>
        ))}
        {busy && <p className="text-[16px] text-zinc-600">Thinking…</p>}
        <div ref={end} />
      </div>
      {/* "Filled in" only when Create's own rules pass; otherwise say how many rows still need the person. */}
      {done &&
        (valid ? (
          <p role="status" className="mb-3 rounded-[10px] border border-emerald-300 bg-emerald-50 p-3 text-[16px] text-zinc-900">
            The form below is filled in. Check each field, change anything that’s off, then press Create.
          </p>
        ) : (
          <p role="status" className="mb-3 rounded-[10px] border border-amber-300 bg-amber-50 p-3 text-[16px] text-zinc-900">
            {missing === 0
              ? "The interviewer is done. Some fields still need fixing. Open the form below to check them."
              : `The interviewer is done. ${missing} ${missing === 1 ? "field still needs" : "fields still need"} you; ${missing === 1 ? "it’s" : "they’re"} marked ○ in Draft so far.`}
          </p>
        ))}
      {problem && (
        <p role="alert" className="mb-3 rounded-[10px] border border-red-300 bg-red-50 p-3 text-[16px] text-red-800">
          {problem}
        </p>
      )}
      <label className="mb-2 block">
        <span className="sr-only">Your answer</span>
        <textarea
          className={`${field} min-h-[84px]`}
          value={input}
          placeholder={listening ? "Listening… press Stop when you’re done" : "Type your answer"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {/* Button's disabled look (40% opacity) all but hides Send here, so a disabled Send gets a solid grey look instead. */}
        <span className="contents [&>button:disabled]:border-zinc-300 [&>button:disabled]:bg-zinc-100 [&>button:disabled]:text-zinc-700 [&>button:disabled]:opacity-100">
          <Button onClick={() => void send()} disabled={busy || !input.trim()}>
            Send
          </Button>
        </span>
        {canSpeak && (
          <Button kind="secondary" onClick={toggleMic} disabled={busy}>
            <MicIcon />
            {listening ? "Stop" : "Talk"}
          </Button>
        )}
      </div>
      <p className="mt-2 text-[16px] text-zinc-600">Don’t share confidential, personal or customer details.</p>
    </section>
  );
}
