// The digest a transfer grant is bound to (specs/align/transfer-authorization.md, "The server issues one grant per
// transfer"): SHA-256 of the RFC 8785 (JSON Canonicalization Scheme) form of exactly what will be sent. The server
// computes the same digest from the body it receives, so client and server must agree byte for byte.

import { createHash } from "node:crypto";

export class CanonicalError extends Error {}

/** RFC 8785 canonical JSON: object members sorted by UTF-16 code units, no whitespace, ECMAScript number and string
 *  serialization. Refuses values JSON cannot represent exactly (NaN, Infinity, undefined, functions, BigInt, symbols). */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new CanonicalError(`cannot canonicalize ${value}`);
      return JSON.stringify(value); // ECMAScript shortest round-trip form, as RFC 8785 section 3.2.2.3 requires
    case "string":
      return JSON.stringify(value); // ES2019+ escaping, which matches RFC 8785 section 3.2.2.2
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) throw new CanonicalError("only plain objects can be canonicalized");
      const keys = Object.keys(value as Record<string, unknown>).sort(); // default sort compares UTF-16 code units
      const members: string[] = [];
      for (const k of keys) {
        const v = (value as Record<string, unknown>)[k];
        if (v === undefined) throw new CanonicalError(`member ${JSON.stringify(k)} is undefined`);
        members.push(`${JSON.stringify(k)}:${canonicalize(v)}`);
      }
      return `{${members.join(",")}}`;
    }
    default:
      throw new CanonicalError(`cannot canonicalize a ${typeof value}`);
  }
}

/** Lowercase hex SHA-256 of the canonical form's UTF-8 bytes: the `digest` on a grant request. */
export function transferDigest(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}
