import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/client";
import { useSyncExternalStore } from "react";

// The browser side of passkeys: Better Auth's passkey client (the WebAuthn ceremonies) against /api/v2/auth. Only
// client components import this. Nothing here throws: each call answers null or an error {code, message}.

export interface PasskeyError {
  code: string;
  message: string;
}

let client: ReturnType<typeof make> | null = null;
const make = () => createAuthClient({ baseURL: window.location.origin, basePath: "/api/v2/auth", plugins: [passkeyClient()] });
const auth = () => (client ??= make());

/** Where passkeys stand on this page: usable ("here"), only on another host ("elsewhere": Mode L opened at 127.0.0.1,
 *  while the relying party is localhost), or not in this browser ("unsupported"). */
export type PasskeyPlace = "here" | "elsewhere" | "unsupported";
const placeOf = (host: string): PasskeyPlace =>
  window.location.hostname !== host ? "elsewhere" : typeof window.PublicKeyCredential === "function" ? "here" : "unsupported";

const noSubscribe = () => () => undefined;
/** The PasskeyPlace of this page: null while rendering on the server (the host is known only in the browser). */
export function usePasskeyPlace(host: string): PasskeyPlace | null {
  return useSyncExternalStore(noSubscribe, () => placeOf(host), () => null);
}

/** The browser can offer passkeys in the email field's autofill (WebAuthn conditional mediation). */
export async function autofillAvailable(): Promise<boolean> {
  try {
    return (await window.PublicKeyCredential?.isConditionalMediationAvailable?.()) === true;
  } catch {
    return false;
  }
}

const asError = (e: { code?: string; message?: string; status?: number } | null | undefined): PasskeyError | null =>
  e ? { code: e.code || String(e.status ?? "error"), message: e.message || "The passkey didn't work" } : null;

/** Sign in with a passkey (autoFill: wait for the person to pick one from the email field's suggestions). */
export async function signInWithPasskey(autoFill = false): Promise<PasskeyError | null> {
  const r = await auth().signIn.passkey({ autoFill });
  return asError(r?.error);
}

/** Add a passkey to the signed-in person's account (403 reauth_required without a recent sign-in), then name it. The
 *  name is set afterwards so the authenticator labels the credential with the person's email, not this name. */
export async function addPasskey(name: string): Promise<PasskeyError | null> {
  const r = await auth().passkey.addPasskey({});
  if (r?.error) return asError(r.error);
  const id = (r?.data as { id?: string } | null)?.id;
  if (name && id) {
    const res = await fetch(`/api/v2/account/passkeys/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }), credentials: "same-origin" });
    if (!res.ok) return { code: "rename_failed", message: "The passkey was added, but naming it didn't work. Rename it below." };
  }
  return null;
}

/** What the person reads when a passkey sign-in fails. */
export function passkeySignInMessage(e: PasskeyError): string {
  if (e.code === "PASSKEY_NOT_FOUND") return "That passkey isn't registered with Align. Sign in another way, then add it from your account page.";
  if (e.code === "AUTH_CANCELLED" || e.code === "ERROR_CEREMONY_ABORTED" || /cancel/i.test(e.code)) return "Passkey sign-in was cancelled.";
  if (e.code === "429") return "Too many tries. Wait a minute, then try again.";
  return "Signing in with a passkey didn't work. Try again, or sign in another way.";
}
