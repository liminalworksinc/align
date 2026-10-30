"use client";
import Link from "next/link";
import { useState } from "react";
import { api, Btn, Err, Field, Input, Note, Select, TextArea, TrustLinks, useAction } from "../_ui/kit";
import { useTurnstile } from "../_ui/turnstile";

// The request-access form (POST /api/v2/access-requests). Requests are answered by hand. Nothing here is an agreement:
// asking for a follow-up or a letter of intent commits nobody, and the form never asks anyone to sign for an employer.

const SIZES: [string, string][] = [
  ["", "Choose (optional)"],
  ["1", "Just me"],
  ["2-10", "2–10 people"],
  ["11-50", "11–50 people"],
  ["51-200", "51–200 people"],
  ["201+", "More than 200 people"],
];

export default function RequestAccess({ captchaSiteKey, local }: { captchaSiteKey: string | null; local: boolean }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [useCase, setUseCase] = useState("");
  const [interest, setInterest] = useState<"try" | "evaluate">("try");
  const [sent, setSent] = useState<string | null>(null);
  const act = useAction();
  const bot = useTurnstile(captchaSiteKey);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void act.run(async () => {
      try {
        await api("/api/v2/access-requests", {
          body: { email: email.trim(), name, company: company || null, team_size: teamSize || null, use_case: useCase, interest },
          headers: bot.headers,
        });
        setSent(email.trim());
      } finally {
        bot.reset();
      }
    });
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--al-bg)] p-6 text-zinc-800">
      <div className="al-in w-full max-w-[560px] rounded-[14px] border border-zinc-200 bg-white p-8">
        <h1 className="mb-1 font-display text-[34px] leading-none">Request access to Align</h1>
        {sent ? (
          <>
            <p className="mt-4 text-[16px] text-zinc-700">Thanks. We got your request and will answer it by email at {sent}, usually within a day.</p>
            <p className="mt-4 text-[15px]">
              <Link href="/app/sign-in" className="underline">
                Back to sign-in
              </Link>
            </p>
          </>
        ) : (
          <form id="request-access" onSubmit={submit}>
            <p className="mb-5 text-[16px] text-zinc-600">
              Align is opening to a few teams at a time, and we set up each one with them. Tell us a little about yours and we&apos;ll reply by email, usually within a day.
            </p>
            {local && <Note>This server runs on your machine, where anyone signed in can create a workspace without a code.</Note>}
            <Field label="Email">
              <Input type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={320} autoComplete="email" />
            </Field>
            <Field label="Your name">
              <Input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />
            </Field>
            <Field label="Company (optional)">
              <Input name="company" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={100} autoComplete="organization" />
            </Field>
            <Field label="Team size (optional)">
              <Select name="team_size" value={teamSize} onChange={(e) => setTeamSize(e.target.value)}>
                {SIZES.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="What would you like to use Align for?" hint="A sentence or two is plenty (up to 500 characters).">
              <TextArea name="use_case" value={useCase} onChange={(e) => setUseCase(e.target.value)} required maxLength={500} rows={3} />
            </Field>
            <fieldset className="mb-4">
              <legend className="mb-2 text-[14px] text-zinc-600">What are you interested in?</legend>
              <label className="mb-2 flex gap-2 text-[15px]">
                <input type="radio" name="interest" value="try" checked={interest === "try"} onChange={() => setInterest("try")} />
                <span>
                  <strong className="font-medium">Try Align.</strong> Get a creation code so I can try it with my team.
                </span>
              </label>
              <label className="flex gap-2 text-[15px]">
                <input type="radio" name="interest" value="evaluate" checked={interest === "evaluate"} onChange={() => setInterest("evaluate")} />
                <span>
                  <strong className="font-medium">Evaluate Align on a real workflow.</strong> Also follow up with me about an evaluation and, if it fits, a non-binding letter of intent.
                </span>
              </label>
            </fieldset>
            <p className="mb-4 text-[13px] text-zinc-500">
              Sending this form only asks for access. It is not an agreement, and asking for a follow-up or a letter of intent doesn&apos;t commit you or your employer to anything. Nothing here asks
              you to sign for your organization.
            </p>
            <p className="mb-4 text-[13px] text-zinc-500">
              How we use and keep what you send:{" "}
              <Link href="/privacy" className="underline">
                privacy policy
              </Link>
              .
            </p>
            {bot.widget}
            <Btn type="submit" disabled={act.busy || !bot.ready || !email.trim() || !name.trim() || !useCase.trim()}>
              Send request
            </Btn>
            <Err>{act.error}</Err>
            <p className="mt-5 text-[15px] text-zinc-600">
              Already have an account or a code?{" "}
              <Link href="/app/sign-in" className="underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
        <TrustLinks />
      </div>
    </main>
  );
}
