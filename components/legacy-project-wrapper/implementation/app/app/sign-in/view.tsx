"use client";
import { useState } from "react";
import { Btn, Err, Field, Input, Note, go } from "../_ui/kit";

type Options = { google: boolean; github: boolean; testIdp: boolean };

async function post(path: string, body: unknown) {
  const res = await fetch(`/api/v2/auth${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
  if (!res.ok) throw new Error(data.message || "Sign-in failed");
  return data;
}

export default function SignIn({ next, options }: { next: string; options: Options }) {
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const social = async (provider: "google" | "github") => {
    setError(null);
    try {
      const d = await post("/sign-in/social", { provider, callbackURL: next, errorCallbackURL: "/app/sign-in" });
      if (d.url) window.location.href = d.url;
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const local = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "up") await post("/sign-up/email", { name, email, password });
      else await post("/sign-in/email", { email, password });
      go(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const none = !options.google && !options.github && !options.testIdp;
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--al-bg)] p-6 text-zinc-800">
      <div className="al-in w-full max-w-[460px] rounded-[14px] border border-zinc-200 bg-white p-8">
        <h1 className="mb-1 font-display text-[34px] leading-none">Align</h1>
        <p className="mb-6 text-[16px] text-zinc-600">Sign in as yourself to see your workspaces, goals and shared sessions.</p>
        <div className="flex flex-col gap-2">
          {options.google && (
            <Btn kind="secondary" onClick={() => social("google")}>
              Continue with Google
            </Btn>
          )}
          {options.github && (
            <Btn kind="secondary" onClick={() => social("github")}>
              Continue with GitHub
            </Btn>
          )}
        </div>
        {none && <Note>No sign-in method is configured on this server.</Note>}
        {options.testIdp && (
          <form onSubmit={local} className="mt-6 border-t border-zinc-200 pt-5">
            <p className="al-lbl mb-2">Test sign-in (this machine only)</p>
            <div className="mb-3 flex gap-2 text-[14px]">
              <button type="button" className={mode === "in" ? "text-zinc-900 underline" : "text-zinc-500"} onClick={() => setMode("in")}>
                Sign in
              </button>
              <button type="button" className={mode === "up" ? "text-zinc-900 underline" : "text-zinc-500"} onClick={() => setMode("up")}>
                Create a test account
              </button>
            </div>
            {mode === "up" && (
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              </Field>
            )}
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
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
      </div>
    </main>
  );
}
