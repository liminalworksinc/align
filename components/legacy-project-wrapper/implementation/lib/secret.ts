import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "./config";

// ALIGN_SECRET, the server's own HMAC key: it signs MCP access tokens (alm.) and keys the stored refresh-token hashes
// (lib/oauth). Hosted servers must set it (lib/config.ts); in Mode L, when it is unset, one is generated into
// <data>/.secret (ALIGN_DATA_DIR, else <cwd>/data; 0600) on first use. Rotating it ends every connected app's tokens.

function secret(): string {
  if (process.env.ALIGN_SECRET) return process.env.ALIGN_SECRET;
  const file = path.join(config().dataDir, ".secret");
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return readFileSync(file, "utf8").trim();
}

/** HMAC-SHA256 of `payload` under ALIGN_SECRET, base64url. Callers domain-separate with a prefix (`alm.`, `alr.`). */
export function signPayload(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}
