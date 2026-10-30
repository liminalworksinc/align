import { createHash, randomBytes } from "node:crypto";
import { rand32 } from "./core.mts";

export { rand32 };

export type IdPrefix = "u" | "ws" | "pod" | "g" | "al" | "dv" | "dir" | "inv" | "m" | "dr" | "cr" | "ar" | "ev" | "ask" | "vr" | "rq";

/** `<prefix>_<24 base32 chars>` (120 random bits). Never sequential. */
export const newId = (prefix: IdPrefix) => `${prefix}_${rand32(15)}`;

/** An opaque secret: base64url of `bytes` random bytes. */
export const secretToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const sha256hex = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export const nowIso = () => new Date().toISOString();
