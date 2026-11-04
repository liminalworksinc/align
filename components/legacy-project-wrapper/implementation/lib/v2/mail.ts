import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config";
import { emailApi } from "./config";
import { postEmail } from "./core.mts";
import { dbDir } from "./db";

// Sign-in code delivery, called by Better Auth's emailOtp sendVerificationOTP (lib/v2/auth.ts).
// Hosted: one HTTPS POST to a Resend-compatible email API (postEmail in lib/v2/core.mts: {from, to, subject, text},
//   Bearer key, 10 s timeout). The code, address and key are never logged; a failure logs only the HTTP status or the
//   error's name.
// Mode L: nothing is emailed. The link is printed to stdout and written to <data>/v2/sign-in.txt (0600, replaced on
//   every send). That is safe for any address: only someone at this machine's terminal or files can read it.

export const SIGN_IN_SUBJECT = "Your Align sign-in code";

/** The link in a code message. It only fills the sign-in form: signing in is a POST (app/app/sign-in). */
export function signInLink(origin: string, email: string, code: string): string {
  return `${origin}/app/sign-in?${new URLSearchParams({ email, code })}`;
}

export const signInFile = () => path.join(dbDir(), "sign-in.txt");

/** Deliver one sign-in code. Throws (so the send request fails) when the hosted email API refuses or times out. */
export async function sendSignInCode(email: string, code: string, origin: string): Promise<void> {
  const link = signInLink(origin, email, code);
  if (!config().hosted) {
    const line = `Align sign-in for ${email}: ${link}`;
    console.log(line);
    const file = signInFile();
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, `${line}\n`, { mode: 0o600 });
    chmodSync(file, 0o600); // the mode above applies only when the file is new
    return;
  }
  const api = emailApi();
  if (!api) throw new Error("Email sign-in is not configured"); // startup refuses partial settings; the plugin is off without them
  const text = [
    `Your Align sign-in code is ${code}. It works for 5 minutes.`,
    "",
    `Or open this link to fill it in, then press Sign in: ${link}`,
    "",
    "If you didn't ask to sign in to Align, ignore this email.",
  ].join("\n");
  await postEmail(api, { to: email, subject: SIGN_IN_SUBJECT, text }, "Sign-in email");
}
