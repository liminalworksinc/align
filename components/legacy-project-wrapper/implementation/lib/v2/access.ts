import { config } from "../config";
import { requireCaptcha } from "./captcha";
import { get, run, tx } from "./db";
import { refuseDisposable } from "./disposable";
import { V2Error, badRequest } from "./errors";
import { newId, nowIso } from "./ids";
import { accessEmailKey, durableCount, durableRoom } from "./limits";
import { oneOf, optOneOf, optStr, str, type Body } from "./validate";

// Access requests (PRESEED-002): the public form at /app/request-access, answered by hand. The operator lists,
// approves (an email-bound creation code) or declines them with scripts/align-admin.mjs. A request is interest, not
// an agreement: choosing "evaluate" asks for a follow-up about an evaluation and a non-binding letter of intent, and
// signs or commits nobody to anything.
// Limits (durable, both modes): 5 per client per hour, 3 per email address per day (keyed by an HMAC of the address).
// Hosted, a disposable address is refused and the Turnstile token is checked when Turnstile is on.

export const TEAM_SIZES = ["1", "2-10", "11-50", "51-200", "201+"] as const;
export const INTERESTS = ["try", "evaluate"] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createAccessRequest(req: Request, client: string, b: Body) {
  const email = str(b, "email", 320).toLowerCase();
  if (!EMAIL.test(email)) throw badRequest("Enter an email address");
  const name = str(b, "name", 100);
  const company = optStr(b, "company", 100);
  const teamSize = optOneOf(b, "team_size", TEAM_SIZES);
  const useCase = str(b, "use_case", 500);
  const interest = oneOf(b, "interest", INTERESTS);
  if (config().hosted) refuseDisposable(email);
  const limits = [
    { key: `access-client:${client}`, max: 5, windowMs: 60 * 60 * 1000 },
    { key: accessEmailKey(email), max: 3, windowMs: 24 * 60 * 60 * 1000 },
  ];
  const tooMany = () => new V2Error(429, "rate_limited", "Too many requests were sent. Try again later.");
  if (!durableRoom(limits)) throw tooMany();
  await requireCaptcha(req);
  await tx(() => {
    if (!durableRoom(limits)) throw tooMany();
    durableCount(limits);
    // One pending request per address: sending again updates it (the answer is the same either way).
    const pending = get<{ id: string }>("SELECT id FROM v2_access_requests WHERE email = ? AND status = 'pending'", email);
    if (pending) {
      run("UPDATE v2_access_requests SET name = ?, company = ?, team_size = ?, use_case = ?, interest = ? WHERE id = ?", name, company, teamSize, useCase, interest, pending.id);
    } else {
      run(
        "INSERT INTO v2_access_requests (id, email, name, company, team_size, use_case, interest, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
        newId("ar"),
        email,
        name,
        company,
        teamSize,
        useCase,
        interest,
        nowIso(),
      );
    }
  });
  return { received: true };
}
