"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { EMPTY, Field, field, issuesFrom, ScenarioFields, toBody, type Form, type Issues } from "@/components/ScenarioForm";

// Create a new custom workspace from the same form as /setup. No sign-in is needed and creating does not sign anyone in.
// POSTs to /api/workspaces; the three passcodes come back once and are shown once on the success card.

type Role = "leadership" | "product" | "security";
interface Created {
  workspace: { id: string; name: string; path: string };
  passcodes: Record<Role, string>;
  people: { role: Role; team: string; lead: string }[];
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

export default function NewWorkspacePage() {
  const [cfg, setCfg] = useState<{ signup_code_required: boolean; max_reached: boolean } | null | undefined>(undefined);
  const [form, setForm] = useState<Form>(EMPTY);
  const [code, setCode] = useState("");
  const [issues, setIssues] = useState<Issues>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

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
      } else if (res.status === 403 && cfg?.signup_code_required && error && /signup code/i.test(error)) {
        setIssues({ signup_code: [error] });
        setProblem("Check the signup code.");
      } else if (res.status === 413) setProblem("This setup is too long. Shorten the plan or the work items and try again.");
      else if (res.status === 415) setProblem("The setup could not be sent. Reload the page and try again.");
      else if (res.status === 421) setProblem("Open this page on the machine running Align, at its localhost address.");
      else setProblem(error ?? "The workspace could not be created. Try again.");
    } catch {
      setProblem("The server did not answer. Check that Align is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  const page = (children: ReactNode) => <main className="mx-auto min-h-screen max-w-3xl bg-zinc-50 px-5 py-8 text-[16px] text-zinc-900">{children}</main>;

  if (created) {
    const link = `${window.location.origin}${created.workspace.path}`; // only reached after a submit, so always in the browser
    return page(
      <section className="rounded-[14px] border border-zinc-200 bg-white p-6">
        <h1 className="mb-3 text-[24px] font-semibold">Workspace ready: {created.workspace.name}</h1>
        <div role="alert" className="mb-5 rounded-[10px] border border-amber-300 bg-amber-50 p-4 text-[16px] text-zinc-900">
          <p className="font-semibold">Save these passcodes now. They won’t be shown again.</p>
          <p className="mt-1">Align keeps only a scrambled copy, so nobody can look them up later.</p>
        </div>

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
          A browser profile holds one workspace session at a time. Signing in here signs that browser out of any other workspace, including the demo. To try
          several roles on one computer, use a separate browser profile or private window for each.
        </p>
        <Link href={created.workspace.path} className="inline-flex min-h-11 items-center rounded-[10px] bg-violet-700 px-[18px] text-[16px] font-semibold text-black hover:brightness-110">
          Open the workspace
        </Link>
      </section>,
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
        Describe one real disagreement between two teams. This makes a new, separate workspace with its own passcodes. Nothing in any other workspace changes.
      </p>
      {cfg?.signup_code_required && (
        <section className="mb-6 rounded-[14px] border border-zinc-200 bg-white p-5">
          <Field label="Signup code" hint="The code you were given to create a workspace." error={issues.signup_code}>
            <input className={field} autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        </section>
      )}

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
