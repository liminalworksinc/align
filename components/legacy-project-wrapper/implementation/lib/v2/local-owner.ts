import { config } from "../config";
import { getAuth } from "./auth";
import { localOwnerEmail } from "./config";
import { get } from "./db";

// Mode L's first account. On a start with no Better Auth user, the server makes one local owner (ALIGN_LOCAL_OWNER_EMAIL,
// or owner@align.localhost; name "Local owner"; email verified, since the server made it) and sends it a sign-in code,
// which Mode L prints (lib/v2/mail.ts). Being on loopback never signs anyone in: the person still enters the code.
// `npm run sign-in-link` (scripts/sign-in-link.mjs) asks the running server for a fresh code.

/** Called once at startup (instrumentation.ts), after the database is migrated. Hosted servers never make one. */
export async function ensureLocalOwner(): Promise<void> {
  if (config().hosted) return;
  if (get("SELECT 1 AS x FROM ba_user LIMIT 1")) return;
  const email = localOwnerEmail();
  const auth = getAuth();
  const ctx = await auth.$context;
  await ctx.internalAdapter.createUser({ email, name: "Local owner", emailVerified: true }, { method: "admin" });
  // The plugin's endpoint, called in-process: the same limits and delivery as a send request (lib/v2/auth.ts).
  // Better Auth resolves its base URL from a Host header, so the call names this server's own loopback address.
  const api = auth.api as unknown as { sendVerificationOTP: (a: { body: { email: string; type: "sign-in" }; headers: Headers }) => Promise<unknown> };
  try {
    await api.sendVerificationOTP({ body: { email, type: "sign-in" }, headers: new Headers({ host: `127.0.0.1:${process.env.PORT || "3100"}` }) });
  } catch {
    console.error(`Align could not print a sign-in code for ${email}. Run npm run sign-in-link to get one.`);
  }
}
