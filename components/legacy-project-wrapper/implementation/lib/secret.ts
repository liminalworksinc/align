import { config } from "./config";
import { hmac, serverSecret } from "./v2/core.mts";

// ALIGN_SECRET, the server's own HMAC key: it signs MCP access tokens (alm.), keys the stored refresh-token hashes
// (lib/oauth) and creation-code hashes (alc., lib/v2/core.mts). Hosted servers must set it (lib/config.ts); in Mode L,
// when it is unset, one is generated into <data>/.secret (ALIGN_DATA_DIR, else <cwd>/data; 0600) on first use.
// Rotating it ends every connected app's tokens and every unused creation code.

/** The secret itself (lib/v2/creation.ts passes it to lib/v2/core.mts). */
export const secret = (): string => serverSecret(config().dataDir);

/** HMAC-SHA256 of `payload` under ALIGN_SECRET, base64url. Callers domain-separate with a prefix (`alm.`, `alr.`). */
export function signPayload(payload: string): string {
  return hmac(secret(), payload);
}
