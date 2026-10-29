"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { field, type Form } from "@/components/ScenarioForm";

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

// The browser's speech recognition, where it exists (Chrome, Edge, Safari). Typed loosely: not in every DOM lib.
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
function speechCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function InterviewPanel({ code, set }: { code: string; set: (fn: (f: Form) => Form) => void }) {
  const [open, setOpen] = useState(false);
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
        <Button onClick={() => setOpen(true)}>Start the interview</Button>
      </section>
    );

  return (
    <section aria-label="Interview" className="mb-6 rounded-[14px] border border-violet-300 bg-white p-5">
      <h2 className="mb-3 text-[20px] font-semibold text-zinc-900">Talk it through</h2>
      <div className="mb-3 max-h-[360px] space-y-3 overflow-y-auto">
        {[{ role: "assistant" as const, text: GREETING }, ...turns].map((t, i) => (
          <p key={i} className={t.role === "assistant" ? "max-w-[85%] rounded-[12px] bg-zinc-100 px-3 py-2 text-[16px] text-zinc-900" : "ml-auto max-w-[85%] rounded-[12px] bg-violet-100 px-3 py-2 text-[16px] text-zinc-900"}>
            {t.text}
          </p>
        ))}
        {busy && <p className="text-[16px] text-zinc-500">Thinking…</p>}
        <div ref={end} />
      </div>
      {done && (
        <p role="status" className="mb-3 rounded-[10px] border border-emerald-300 bg-emerald-50 p-3 text-[16px] text-zinc-900">
          The form below is filled in. Check each field, change anything that’s off, then press Create.
        </p>
      )}
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
        <Button onClick={() => void send()} disabled={busy || !input.trim()}>
          Send
        </Button>
        {canSpeak && (
          <Button kind="secondary" onClick={toggleMic} disabled={busy}>
            {listening ? "Stop" : "🎤 Talk"}
          </Button>
        )}
        <span className="text-[14px] text-zinc-500">Don’t share confidential, personal or customer details.</span>
      </div>
    </section>
  );
}
