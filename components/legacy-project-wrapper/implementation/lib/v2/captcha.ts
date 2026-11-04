import { captcha } from "better-auth/plugins";
import type { BetterAuthPlugin } from "better-auth";
import { config } from "../config";
import { turnstile } from "./config";
import { V2Error } from "./errors";

// The bot check: Cloudflare Turnstile, hosted only and only when ALIGN_TURNSTILE_SITE_KEY and
// ALIGN_TURNSTILE_SECRET_KEY are both set (lib/v2/config.ts). The browser solves the widget and sends its token in the
// x-captcha-response header:
//   - Better Auth's captcha plugin checks it on the email-code send and email-code sign-in routes (its defaults cover
//     only password routes, so they are listed here): 400 MISSING_RESPONSE, 403 VERIFICATION_FAILED;
//   - requireCaptcha() checks it on POST /api/v2/access-requests and on workspace creation: 400 captcha_required,
//     403 captcha_failed, 503 captcha_unavailable.
// Both call the same verify URL (Cloudflare's, or ALIGN_TURNSTILE_VERIFY_URL in tests) and accept only a token solved
// on one of this server's host names.

export const CAPTCHA_HEADER = "x-captcha-response";
const TIMEOUT_MS = 10_000;

/** The host names a token may have been solved on: ALIGN_HOSTS. */
const hostnames = () => [...config().allowedHosts];

/** Better Auth's captcha plugin for the email-code routes, or null when Turnstile is off. */
export function captchaPlugin(): BetterAuthPlugin | null {
  const t = turnstile();
  if (!t) return null;
  return captcha({
    provider: "cloudflare-turnstile",
    secretKey: t.secretKey,
    siteVerifyURLOverride: t.verifyUrl,
    endpoints: ["/email-otp/send-verification-otp", "/sign-in/email-otp"],
    allowedHostnames: hostnames(),
  });
}

/** When Turnstile is on, the request must carry a token that the verify URL accepts for one of this server's hosts. */
export async function requireCaptcha(req: Request): Promise<void> {
  const t = turnstile();
  if (!t) return;
  const token = req.headers.get(CAPTCHA_HEADER);
  if (!token || token.length > 4096) throw new V2Error(400, "captcha_required", "Complete the check that you are a person, then try again.");
  type Verdict = { success?: boolean; hostname?: string };
  let data = null as Verdict | null;
  try {
    const res = await fetch(t.verifyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: t.secretKey, response: token, remoteip: req.headers.get("fly-client-ip") ?? undefined }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
    data = res.ok ? ((await res.json()) as Verdict) : null;
  } catch (e) {
    console.error("Captcha check failed:", (e as Error)?.name ?? "unknown");
  }
  if (!data) throw new V2Error(503, "captcha_unavailable", "The check that you are a person isn't working right now. Try again in a minute.");
  if (data.success !== true || !data.hostname || !hostnames().includes(data.hostname.toLowerCase())) {
    throw new V2Error(403, "captcha_failed", "The check that you are a person didn't pass. Try it again.");
  }
}
