"use client";
import { PAGE_H1 } from "@/app/app/_ui/page-title";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Btn, Err, Field, Input, Note, TrustLinks, go } from "../_ui/kit";
import { autofillAvailable, passkeySignInMessage, signInWithPasskey, usePasskeyPlace } from "../_ui/passkey";
import type { SignInOptions } from "../_ui/server";
import { useTurnstile } from "../_ui/turnstile";
import { count } from "@/lib/v2/plural.mts";

class AuthError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** Seconds until a refused (429) request may be tried again, when the server said. */
    public retryAfter: number | null = null,
  ) {
    super(message);
  }
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`/api/v2/auth${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), credentials: "same-origin" });
  const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string; code?: string };
  if (!res.ok) {
    const retry = Number(res.headers.get("retry-after") ?? res.headers.get("x-retry-after") ?? NaN);
    throw new AuthError(res.status, data.code ?? "", data.message || "Sign-in failed", Number.isFinite(retry) ? retry : null);
  }
  return data;
}

/** A refused send (429): Align's own limits say how long to wait (code rate_limited, from the real retry time); Better
 *  Auth's per-minute limit gives only its retry header. */
const tooManySends = (e: AuthError) => {
  if (e.code === "rate_limited") return e.message;
  const min = Math.max(1, Math.ceil((e.retryAfter ?? 60) / 60));
  return `Too many codes were sent. Try again in ${count(min, "minute")}.`;
};

/** What the person reads when a code is refused (Better Auth's emailOtp codes, and ours from lib/v2/auth.ts). */
function codeMessage(e: unknown): string {
  if (!(e instanceof AuthError)) return (e as Error).message;
  if (e.code === "INVALID_OTP") return "That code didn't work. Check it and try again.";
  if (e.code === "OTP_EXPIRED") return "That code has expired. Send a new one.";
  if (e.code === "TOO_MANY_ATTEMPTS") return "Too many wrong tries. Send a new code.";
  if (e.status === 429) return "Too many tries. Wait a minute, then try again.";
  return captchaMessage(e) ?? e.message;
}

/** The captcha plugin's refusals (lib/v2/captcha.ts), in the page's words. */
function captchaMessage(e: AuthError): string | null {
  if (e.code === "MISSING_RESPONSE") return "Complete the check that you are a person, then try again.";
  if (e.code === "VERIFICATION_FAILED") return "The check that you are a person didn't pass. Try it again.";
  return null;
}

// LIM-2472 (stream R): token-only styling in both themes; the test sign-in's two modes read as one segmented choice.
const TAB = "rounded-[7px] px-3 py-1.5 font-medium";
const TAB_ON = "bg-(--bg-overlay) text-(--text-1) shadow-[inset_0_0_0_1px_var(--line-strong)]";
const TAB_OFF = "text-(--text-2) hover:text-(--text-1)";

export default function SignIn({ next, options, email: email0, code: code0 }: { next: string; options: SignInOptions; email: string; code: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Email code: a link from the message fills both fields and opens the code step; nothing signs in until Sign in.
  const [email, setEmail] = useState(email0);
  const [code, setCode] = useState(code0);
  const [step, setStep] = useState<"email" | "code">(email0 && code0 ? "code" : "email");
  const [sent, setSent] = useState(false);
  // The bot check (hosted with Turnstile keys): one token per send or sign-in, reset after each.
  const bot = useTurnstile(options.email ? options.captchaSiteKey : null);
  // Test identity provider (ALIGN_TEST_IDP=1, Mode L only).
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [password, setPassword] = useState("");
  // Passkeys: a button, and the email field's autofill where the browser offers it. Only on the passkey host.
  const place = usePasskeyPlace(options.passkeyHost);
  const passkeys = place === "here";

  useEffect(() => {
    if (!passkeys || step !== "email") return;
    let live = true;
    void (async () => {
      if (!(await autofillAvailable()) || !live) return;
      // Waits until the person picks a passkey from the email field's suggestions; aborted by the button or unmount.
      const e = await signInWithPasskey(true);
      if (live && !e) go(next);
    })();
    return () => {
      live = false;
    };
  }, [passkeys, step, next]);

  const run = async (fn: () => Promise<void>, msg: (e: unknown) => string = (e) => (e as Error).message) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
      bot.reset();
    }
  };

  const social = (provider: "google" | "github") =>
    run(async () => {
      const d = await post("/sign-in/social", { provider, callbackURL: next, errorCallbackURL: "/app/sign-in" });
      if (d.url) window.location.href = d.url;
    });

  const passkey = () =>
    run(async () => {
      const e = await signInWithPasskey(false);
      if (e) throw new Error(passkeySignInMessage(e));
      go(next);
    });

  const sendCode = () =>
    run(
      async () => {
        await post("/email-otp/send-verification-otp", { email: email.trim(), type: "sign-in" }, bot.headers);
        setSent(true);
        setCode("");
        setStep("code");
      },
      (e) => (e instanceof AuthError && e.status === 429 ? tooManySends(e) : e instanceof AuthError ? (captchaMessage(e) ?? e.message) : (e as Error).message),
    );

  const signInWithCode = () =>
    run(async () => {
      await post("/sign-in/email-otp", { email: email.trim(), otp: code }, bot.headers);
      go(next);
    }, codeMessage);

  const local = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (mode === "up") await post("/sign-up/email", { name, email: tEmail, password });
      else await post("/sign-in/email", { email: tEmail, password });
      go(next);
    });
  };

  return (
    <main className="grid min-h-screen place-items-center bg-(--bg-page) p-6 text-(--text-1) max-sm:p-3">
      <div className="al-in w-full max-w-[460px] rounded-(--radius-l) border border-(--line) bg-(--bg-panel) p-8 max-sm:p-5">
        <h1 className={`${PAGE_H1} mb-1`}>Align</h1>
        <p className="mb-1 text-[16px] text-(--text-2)">Sign in as yourself to see your workspaces, goals and shared sessions.</p>
        <p className="mb-6 text-[14px] text-(--text-3)">Have an invite code? Sign in first, then enter it.</p>
        {(options.google || options.github) && (
          <div className="mb-5 flex flex-col gap-2">
            {options.google && (
              <Btn kind="secondary" onClick={() => void social("google")}>
                Continue with Google
              </Btn>
            )}
            {options.github && (
              <Btn kind="secondary" onClick={() => void social("github")}>
                Continue with GitHub
              </Btn>
            )}
          </div>
        )}
        {passkeys && (
          <div className="mb-5">
            <Btn kind="secondary" disabled={busy} onClick={() => void passkey()}>
              Sign in with a passkey
            </Btn>
          </div>
        )}
        {place === "elsewhere" && (
          <Note>
            Passkeys work only at <a className="font-medium text-(--accent-text) underline underline-offset-2" href={`${options.passkeyOrigin}/app/sign-in`}>{options.passkeyOrigin}</a>
            {options.local ? " (a passkey needs a domain name, and this address is a number)." : "."}
          </Note>
        )}
        {options.email && step === "email" && (
          <form
            id="email-code"
            onSubmit={(e) => {
              e.preventDefault();
              void sendCode();
            }}
          >
            <Field label="Email">
              <Input type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete={passkeys ? "email webauthn" : "email"} maxLength={320} />
            </Field>
            <Btn type="submit" disabled={busy || !email.trim() || !bot.ready}>
              Send code
            </Btn>
          </form>
        )}
        {options.email && step === "code" && (
          <form
            id="email-code"
            onSubmit={(e) => {
              e.preventDefault();
              if (/^\d{6}$/.test(code)) void signInWithCode();
            }}
          >
            {sent && <Note>If this email can sign in to Align, a 6-digit code is on its way. It works for 5 minutes.</Note>}
            <Field label="Email">
              <Input type="email" name="email" value={email} readOnly autoComplete="email" />
            </Field>
            <Field label="Code">
              <Input
                name="code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                required
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Btn type="submit" disabled={busy || !/^\d{6}$/.test(code) || !bot.ready}>
                Sign in
              </Btn>
              <Btn kind="secondary" disabled={busy || !bot.ready} onClick={() => void sendCode()}>
                Send a new code
              </Btn>
              <Btn
                kind="secondary"
                disabled={busy}
                onClick={() => {
                  setStep("email");
                  setSent(false);
                  setCode("");
                  setError(null);
                }}
              >
                Use another email
              </Btn>
            </div>
            {options.local && (
              <Note>
                On this machine the code is not emailed: it is printed in the terminal running Align and saved in <code>&lt;data&gt;/v2/sign-in.txt</code>. Run <code>npm run sign-in-link</code> to get
                a new one (with <code>PORT=&lt;port&gt;</code> in front when Align runs on a port other than 3100).
              </Note>
            )}
          </form>
        )}
        {/* One widget for both steps: it stays mounted while the person moves from Send code to Sign in. */}
        {bot.widget && <div className="mt-4">{bot.widget}</div>}
        {options.testIdp && (
          <form id="test-idp" onSubmit={local} className="mt-6 border-t border-(--line) pt-5">
            <p className="al-lbl mb-2">Test sign-in (this machine only)</p>
            <div className="mb-3 inline-flex max-w-full flex-wrap gap-0.5 rounded-(--radius-s) border border-(--edge) bg-(--bg-inset) p-0.5 text-[14px]">
              <button type="button" aria-pressed={mode === "in"} className={`${TAB} ${mode === "in" ? TAB_ON : TAB_OFF}`} onClick={() => setMode("in")}>
                Sign in
              </button>
              <button type="button" aria-pressed={mode === "up"} className={`${TAB} ${mode === "up" ? TAB_ON : TAB_OFF}`} onClick={() => setMode("up")}>
                Create a test account
              </button>
            </div>
            {mode === "up" && (
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              </Field>
            )}
            <Field label="Email">
              <Input type="email" value={tEmail} onChange={(e) => setTEmail(e.target.value)} required autoComplete="username" />
            </Field>
            <Field label="Password" hint={mode === "up" ? "At least 8 characters" : undefined}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "up" ? "new-password" : "current-password"} />
            </Field>
            <Btn type="submit" disabled={busy}>
              {mode === "up" ? "Create account" : "Sign in"}
            </Btn>
          </form>
        )}
        <Err>{error}</Err>
        <p className="mt-5 text-[15px] text-(--text-2)">Have an invite code? Sign in first, then enter it.</p>
        {options.requestAccess && (
          <p className="mt-5 border-t border-(--line) pt-4 text-[15px] text-(--text-2)">
            New to Align? Creating a workspace here needs a creation code.{" "}
            <Link href="/app/request-access" className="font-medium text-(--accent-text) underline underline-offset-2">
              Request access
            </Link>
          </p>
        )}
        <TrustLinks />
      </div>
    </main>
  );
}
