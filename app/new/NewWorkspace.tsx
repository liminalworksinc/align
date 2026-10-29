"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { InterviewPanel } from "@/components/InterviewPanel";
import { EMPTY, Field, field, issuesFrom, ScenarioFields, toBody, type Form, type Issues } from "@/components/ScenarioForm";
import { isCodeRefusal } from "@/lib/codes";
import { NO_ANSWER_HOSTED, NO_ANSWER_LOCAL, ROLE_SWITCH } from "@/lib/labels";

// Create a new custom workspace from the same form as /setup. No sign-in is needed and creating does not sign anyone in.
// POSTs to /api/workspaces; the three passcodes come back once and are shown once on the success card.

type Role = "leadership" | "product" | "security";
interface Created {
  workspace: { id: string; name: string; path: string };
  passcodes: Record<Role, string>;
  people: { role: Role; team: string; lead: string }[];
}

/** "2026-11-13" as "November 13, 2026" (the date is a calendar day, so read it in UTC). */
function longDate(day: string | null | undefined): string | null {
  const t = day ? Date.parse(`${day}T00:00:00Z`) : NaN;
  return Number.isNaN(t) ? null : new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Founder's exact wording (go-C notice, ruled 10-22): early testing on a test server, no confidential, personal or
// customer data, and the deletion date from ALIGN_DELETE_BY. The research line is the founder's pick of 10-27 (LIM-2424 0ed9b310).
function TestServerNotice({ deleteBy }: { deleteBy: string | null }) {
  return (
    <div role="note" className="mb-6 rounded-[14px] border border-amber-300 bg-amber-50 p-5 text-[16px] text-zinc-900">
      <p className="font-semibold">Liminal Align is an early-testing product running on a test server.</p>
      <p className="mt-1">Do not enter confidential, personal, or customer data. Use a fictional or anonymized version of your situation.</p>
      <p className="mt-1">This is a research test: Liminal analyzes the workspaces people create here, including every proposal and decision.</p>
      <p className="mt-1">Everything in your workspace will be deleted by {deleteBy ?? "the end of the test"}. You can request earlier deletion.</p>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Button kind="secondary" onClick={copy}>
      {copied ? "Copied" : label}
    </Button>
  );
}

/** `testServer` comes from the server render (page.tsx), so the notice shows even if the config fetch fails (review M9). */
export default function NewWorkspace({ testServer }: { testServer: { delete_by: string | null } | null }) {
  const [cfg, setCfg] = useState<{ signup_code_required: boolean; max_reached: boolean; interview?: boolean; test_server?: { delete_by: string | null } } | null | undefined>(undefined);
  const [form, setForm] = useState<Form>(EMPTY);
  const [code, setCode] = useState("");
  const [issues, setIssues] = useState<Issues>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [saved, setSaved] = useState(false); // the tester confirmed the passcodes are saved before leaving the card

  useEffect(() => {
    fetch("/api/workspaces/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setCfg)
      .catch(() => setCfg(null));
  }, []);

  const set = (fn: (f: Form) => Form) => setForm((f) => fn(structuredClone(f)));

  async function submit() {
    setBusy(true);
    setProblem(null);
    setIssues({});
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...toBody(form), ...(code.trim() ? { signup_code: code.trim() } : {}) }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 201) {
        const t = (s: string) => s.trim();
        setCreated({
          workspace: data.workspace,
          passcodes: data.passcodes,
          people: [
            { role: "leadership", team: t(form.leadership.team) || "Leadership", lead: t(form.leadership.lead) || "Leadership" },
            { role: "product", team: t(form.asking.team), lead: t(form.asking.lead) },
            { role: "security", team: t(form.owning.team), lead: t(form.owning.lead) },
          ],
        });
        setForm(EMPTY);
        window.scrollTo(0, 0);
        return;
      }
      const error = typeof data.error === "string" ? data.error : null;
      if (res.status === 400 && Array.isArray(data.issues)) {
        setIssues(issuesFrom(data.issues));
        setProblem("Some fields need fixing. They are marked below.");
      } else if (res.status === 403 && cfg?.signup_code_required && isCodeRefusal(error)) {
        setIssues({ signup_code: [error] });
        setProblem("Check the signup code.");
      } else if (res.status === 413) setProblem("This setup is too long. Shorten the plan or the work items and try again.");
      else if (res.status === 415) setProblem("The setup could not be sent. Reload the page and try again.");
      else if (res.status === 421) setProblem("Open this page on the machine running Align, at its localhost address.");
      else setProblem(error ?? "The workspace could not be created. Try again.");
    } catch {
      setProblem(testServer ? NO_ANSWER_HOSTED : NO_ANSWER_LOCAL);
    } finally {
      setBusy(false);
    }
  }

  // The test-server notice is part of the page frame, so the server render carries it whatever state the form is in:
  // loading (the first HTML, before the config fetch), max reached, or the form (Sean's #6 review). The created screen
  // states the deletion date itself.
  const page = (children: ReactNode, notice = true) => (
    <main className="mx-auto min-h-screen max-w-3xl bg-zinc-50 px-5 py-8 text-[16px] text-zinc-900">
      {notice && testServer && <TestServerNotice deleteBy={longDate(testServer.delete_by)} />}
      {children}
    </main>
  );

  if (created) {
    const link = `${window.location.origin}${created.workspace.path}`; // only reached after a submit, so always in the browser
    return page(
      <section className="rounded-[14px] border border-zinc-200 bg-white p-6">
        <h1 className="mb-3 text-[24px] font-semibold">Workspace ready: {created.workspace.name}</h1>
        <div role="alert" className="mb-5 rounded-[10px] border border-amber-300 bg-amber-50 p-4 text-[16px] text-zinc-900">
          <p className="font-semibold">Save these passcodes now. They won’t be shown again.</p>
          <p className="mt-1">Align keeps only a scrambled copy, so nobody can look them up later.</p>
        </div>
        {testServer && (
          <p className="mb-5 text-[16px] text-zinc-700">
            Test workspace, analyzed by Liminal. No confidential, personal, or customer data. Deleted by {longDate(testServer.delete_by) ?? "the end of the test"}; sooner on request.
          </p>
        )}

        <h2 className="mb-2 text-[18px] font-semibold">Workspace link</h2>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <code className="break-all rounded-[8px] bg-zinc-100 px-3 py-2 text-[16px]">{link}</code>
          <CopyButton value={link} label="Copy link" />
        </div>

        <h2 className="mb-2 text-[18px] font-semibold">Passcodes</h2>
        <ul className="mb-5 space-y-3">
          {created.people.map((p) => (
            <li key={p.role} className="rounded-[10px] border border-zinc-200 p-3">
              <p className="text-[16px] font-semibold">{p.lead === p.team ? p.team : `${p.team} · ${p.lead}`}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="rounded-[8px] bg-zinc-100 px-3 py-2 font-mono text-[18px] tracking-wide">{created.passcodes[p.role]}</code>
                <CopyButton value={created.passcodes[p.role]} label="Copy" />
              </div>
            </li>
          ))}
        </ul>

        <p className="mb-3 text-[16px]">
          You now hold all three passcodes, so you could act for every team. Give each one to a different person: {created.people.map((p) => (p.lead === p.team ? `someone in ${p.team}` : p.lead)).join(", ")}.
        </p>
        <p className="mb-5 text-[16px] text-zinc-700">
          A browser holds one workspace session at a time. Signing in here signs that browser out of any other workspace, including the demo.
          {" "}{ROLE_SWITCH}
        </p>
        <label className="mb-4 flex items-start gap-2 rounded-[10px] bg-amber-50 p-3 text-[16px] ring-1 ring-amber-300">
          <input type="checkbox" className="mt-1 size-4 accent-violet-700" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span>I’ve saved all three passcodes somewhere I can find them.</span>
        </label>
        {/* A new tab, so this card (the only place the passcodes are shown) stays open behind it. */}
        {saved ? (
          <Link
            href={created.workspace.path}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 items-center rounded-[10px] bg-violet-700 px-[18px] text-[16px] font-semibold text-black hover:brightness-110"
          >
            Open the workspace in a new tab
          </Link>
        ) : (
          <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-[10px] bg-zinc-200 px-[18px] text-[16px] font-semibold text-zinc-500">
            Open the workspace in a new tab
          </span>
        )}
      </section>,
      false,
    );
  }

  if (cfg === undefined) return page(<p>Loading…</p>);
  if (cfg?.max_reached)
    return page(
      <p className="text-[18px]">This server already has as many workspaces as it allows. Ask whoever runs Align to remove one, then try again.</p>,
    );

  const unplaced = Object.entries(issues).filter(([p]) => p === "form" || p === "");

  return page(
    <>
      <h1 className="mb-2 text-[28px] font-semibold">Create a workspace</h1>
      <p className="mb-6 text-[16px] text-zinc-700">
        Describe one recent priority change that hit work already in flight: yours, your team’s, or your AI agents’. This makes a new, separate workspace with
        its own passcodes. Nothing in any other workspace changes.
      </p>
      {cfg === null && (
        <p role="alert" className="mb-4 rounded-[10px] border border-amber-300 bg-amber-50 p-4 text-[16px]">
          Couldn’t check this server’s settings. If you were given a signup code, enter it below.
        </p>
      )}
      {/* Unknown config (the fetch failed) keeps the code field: hiding it would make creation fail with no way to fix it. */}
      {(cfg === null || cfg?.signup_code_required) && (
        <section className="mb-6 rounded-[14px] border border-zinc-200 bg-white p-5">
          <Field label="Signup code" hint="The code you were given to create a workspace." error={issues.signup_code}>
            <input className={field} autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        </section>
      )}

      {cfg?.interview && <InterviewPanel code={code} set={set} />}

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

      <Button onClick={submit} disabled={busy}>
        {busy ? "Creating…" : "Create the workspace"}
      </Button>
    </>,
  );
}
