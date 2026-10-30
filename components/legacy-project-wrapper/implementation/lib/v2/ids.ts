import { createHash, randomBytes } from "node:crypto";

const B32 = "abcdefghijklmnopqrstuvwxyz234567";

/** Random base32 (lowercase, RFC 4648 alphabet) from `bytes` random bytes. */
export function rand32(bytes = 15): string {
  const buf = randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export type IdPrefix = "u" | "ws" | "pod" | "g" | "al" | "dv" | "dir" | "inv" | "m" | "dr" | "cr" | "ev";

/** `<prefix>_<24 base32 chars>` (120 random bits). Never sequential. */
export const newId = (prefix: IdPrefix) => `${prefix}_${rand32(15)}`;

/** An opaque secret: base64url of `bytes` random bytes. */
export const secretToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const sha256hex = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export const nowIso = () => new Date().toISOString();
