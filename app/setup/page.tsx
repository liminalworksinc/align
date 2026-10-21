"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { labelsFor } from "@/lib/labels";
import type { Actor, StateView } from "@/lib/types";
import { EMPTY, issuesFrom, ScenarioFields, toBody, type Form, type Issues } from "@/components/ScenarioForm";

// Leadership sets up its own two-team conflict. Reached by URL only (/setup); nothing links here.
// The form itself is components/ScenarioForm.tsx, shared with /new; this page POSTs it to /api/scenario.

export default function SetupPage() {
  const [actor, setActor] = useState<Actor | null | undefined>(undefined);
  const [form, setForm] = useState<Form>(EMPTY);
  const [issues, setIssues] = useState<Issues>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ company: string; team: string } | null>(null);
  const [team, setTeam] = useState("Leadership"); // leadership's team name in the current workspace, for the role line
  const [more, setMore] = useState(false); // optional fields shown; an optional field that has a value always stays visible

  useEffect(() => {
    fetch("/api/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((m: { actor: Actor | null }) => setActor(m.actor))
      .catch(() => setActor(null));
    fetch("/api/state", { cache: "no-store" })
      .then((r) => r.json())
      .then((st: StateView) => setTeam(labelsFor(st).role.leadership))
      .catch(() => undefined);
  }, []);

  const set = (fn: (f: Form) => Form) => setForm((f) => fn(structuredClone(f)));

  async function submit() {
    setBusy(true);
    setProblem(null);
    setIssues({});
    try {
      const res = await fetch("/api/scenario", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "replace", ...toBody(form) }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone({ company: data.company, team: form.leadership.team.trim() || "Leadership" });
        return;
      }
      if (res.status === 400 && Array.isArray(data.issues)) {
        setIssues(issuesFrom(data.issues));
        setProblem("Some fields need fixing. They are marked below.");
      } else if (res.status === 413) setProblem("This setup is too long. Shorten the plan or the work items and try again.");
      else if (res.status === 415) setProblem("The setup could not be sent. Reload the page and try again.");
      else setProblem(typeof data.error === "string" ? data.error : "The setup could not be saved. Try again.");
      setConfirming(false);
    } catch {
      setProblem("The server did not answer. Check that Align is running and try again.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const page = (children: ReactNode) => <main className="mx-auto min-h-screen max-w-3xl bg-zinc-50 px-5 py-8 text-[16px] text-zinc-900">{children}</main>;

  if (actor === undefined) return page(<p>Loading…</p>);
  if (actor !== "leadership")
    return page(
      <p className="text-[18px]">
        Only leadership can set up a new scenario. Sign in as leadership on the main page, then come back to this address.
      </p>,
    );

  if (done)
    return page(
      <section className="rounded-[14px] border border-zinc-200 bg-white p-6">
        <p className="mb-1 text-[16px] text-zinc-600">You are: {done.team}</p>
        <h1 className="mb-3 text-[24px] font-semibold">Scenario ready: {done.company}</h1>
        <p className="mb-5 text-[16px]">Each team lead can now sign in and see the conflict. Nothing has been sandbox-tested.</p>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-[10px] bg-violet-700 px-[18px] text-[16px] font-semibold text-black hover:brightness-110">
          Open the scenario
        </Link>
      </section>,
    );

  const unplaced = Object.entries(issues).filter(([p]) => p === "form" || p === "");

  return page(
    <>
      <p className="mb-1 text-[16px] text-zinc-600">You are: {team}</p>
      <h1 className="mb-2 text-[28px] font-semibold">Set up your own conflict</h1>
      <p className="mb-6 text-[16px] text-zinc-700">
        Describe one real disagreement between two teams. Saving replaces everything currently in Align with this scenario.
      </p>
      <ScenarioFields form={form} set={set} issues={issues} more={more} setMore={setMore} />

      {problem && (
        <div role="alert" className="mb-4 rounded-[10px] border border-red-300 bg-red-50 p-4 text-[16px] text-red-800">
          {problem}
          {unplaced.flatMap(([, ms]) => ms).map((m) => (
            <span key={m} className="mt-1 block">
              {m}
            </span>
          ))}
        </div>
      )}

      {!confirming ? (
        <Button onClick={() => setConfirming(true)}>Save this scenario</Button>
      ) : (
        <div className="rounded-[14px] border border-amber-300 bg-amber-50 p-5">
          <p className="mb-4 text-[16px] text-zinc-900">This replaces everything currently in Align, including any open work in the demo. Continue?</p>
          <div className="flex gap-3">
            <Button onClick={submit} disabled={busy}>
              {busy ? "Saving…" : "Yes, replace and save"}
            </Button>
            <Button kind="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Go back
            </Button>
          </div>
        </div>
      )}
    </>,
  );
}
