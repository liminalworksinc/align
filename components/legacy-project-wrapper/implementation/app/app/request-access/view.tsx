"use client";
import Link from "next/link";
import { useState } from "react";
import { api, Btn, Err, Field, Input, Note, Select, TextArea, TrustLinks, useAction } from "../_ui/kit";
import { useTurnstile } from "../_ui/turnstile";
import { isBlankText } from "@/lib/v2/text-core.mts";

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

// LIM-2472 (stream R): token-only styling in both themes; each interest is a whole-row choice at least 44px tall.
const CHOICE = "flex min-h-[44px] cursor-pointer gap-2.5 rounded-(--radius-s) border border-(--line-strong) bg-(--bg-inset) p-3 text-[15px]";
const CHOICE_ON = "border-(--accent) bg-(--accent-soft)";

export default function RequestAccess({
  captchaSiteKey,
  local,
  interest: initialInterest = "try",
  via = "form",
}: {
  captchaSiteKey: string | null;
  local: boolean;
  interest?: "try" | "evaluate";
  via?: "form" | "value_card";
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [useCase, setUseCase] = useState("");
  const [interest, setInterest] = useState<"try" | "evaluate">(initialInterest);
  const [sent, setSent] = useState<string | null>(null);
  const act = useAction();
  const bot = useTurnstile(captchaSiteKey);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void act.run(async () => {
      try {
        await api("/api/v2/access-requests", {
          body: { email: email.trim(), name, company: isBlankText(company) ? null : company, team_size: teamSize || null, use_case: useCase, interest, via },
          headers: bot.headers,
        });
        setSent(email.trim());
      } finally {
        bot.reset();
      }
    });
  };

  return (
    <main className="grid min-h-screen place-items-center bg-(--bg-page) p-6 text-(--text-1) max-sm:p-3">
      <div className="al-in w-full max-w-[560px] rounded-(--radius-l) border border-(--line) bg-(--bg-panel) p-8 max-sm:p-5">
        <h1 className="mb-1 font-display text-[34px] leading-[1.05] max-sm:text-[28px]">Request access to Align</h1>
        {sent ? (
          <>
            <p className="mt-4 text-[16px] text-(--text-2)">Thanks. We got your request and will answer it by email at {sent}, usually within a day.</p>
            <p className="mt-4 text-[15px]">
              <Link href="/app/sign-in" className="font-medium text-(--accent-text) underline underline-offset-2">
                Back to sign-in
              </Link>
            </p>
          </>
        ) : (
          <form id="request-access" onSubmit={submit}>
            <p className="mb-5 text-[16px] text-(--text-2)">
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
              <legend className="mb-2 text-[14px] text-(--text-2)">What are you interested in?</legend>
              <label className={`mb-2 ${CHOICE} ${interest === "try" ? CHOICE_ON : ""}`}>
                <input type="radio" className="mt-1 size-4 shrink-0 accent-(--accent)" name="interest" value="try" checked={interest === "try"} onChange={() => setInterest("try")} />
                <span>
                  <strong className="font-medium">Try Align.</strong> Get a creation code so I can try it with my team.
                </span>
              </label>
              <label className={`${CHOICE} ${interest === "evaluate" ? CHOICE_ON : ""}`}>
                <input type="radio" className="mt-1 size-4 shrink-0 accent-(--accent)" name="interest" value="evaluate" checked={interest === "evaluate"} onChange={() => setInterest("evaluate")} />
                <span>
                  <strong className="font-medium">Evaluate Align on a real workflow.</strong> Also follow up with me about an evaluation and, if it fits, a non-binding letter of intent.
                </span>
              </label>
            </fieldset>
            <p className="mb-4 text-[13px] text-(--text-2)">
              Sending this form only asks for access. It is not an agreement, and asking for a follow-up or a letter of intent doesn&apos;t commit you or your employer to anything. Nothing here asks
              you to sign for your organization.
            </p>
            <p className="mb-4 text-[13px] text-(--text-2)">
              How we use and keep what you send:{" "}
              <Link href="/privacy" className="font-medium text-(--accent-text) underline underline-offset-2">
                privacy policy
              </Link>
              .
            </p>
            {bot.widget}
            <Btn type="submit" disabled={act.busy || !bot.ready || !email.trim() || isBlankText(name) || isBlankText(useCase)}>
              Send request
            </Btn>
            <Err>{act.error}</Err>
            <p className="mt-5 text-[15px] text-(--text-2)">
              Already have an account or a code?{" "}
              <Link href="/app/sign-in" className="font-medium text-(--accent-text) underline underline-offset-2">
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
