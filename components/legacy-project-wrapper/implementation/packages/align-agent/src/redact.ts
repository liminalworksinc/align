// Secrets are removed on this machine before any vendor send (specs/align/transfer-authorization.md, "Secrets are
// removed on the machine before any vendor send (P0)"). The digest, the request and the preview are all computed from
// the redacted text, so what a person approves is exactly what leaves. A missed pattern is a release blocker: every rule
// below has a positive and a negative case in test/redact.test.ts.

export const REDACTED = "[redacted]";

export type SecretKind =
  | "private_key"
  | "aws_access_key"
  | "github_token"
  | "anthropic_key"
  | "openai_key"
  | "slack_token"
  | "stripe_key"
  | "google_api_key"
  | "jwt"
  | "url_credentials"
  | "bearer_token"
  | "assignment"
  | "high_entropy";

interface Rule {
  kind: SecretKind;
  re: RegExp;
  /** Which capture group is the secret; 0 = the whole match. */
  group?: number;
}

// Order matters: whole blocks first, then specific token formats, then contextual and entropy rules.
const RULES: Rule[] = [
  { kind: "private_key", re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g },
  { kind: "aws_access_key", re: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g },
  { kind: "github_token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g },
  { kind: "anthropic_key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: "openai_key", re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g },
  { kind: "slack_token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { kind: "stripe_key", re: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { kind: "google_api_key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { kind: "url_credentials", re: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]+)(@)/gi, group: 2 },
  { kind: "bearer_token", re: /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{16,})/g, group: 2 },
  // NAME=value or NAME: value, where NAME says it holds a secret. Quoted or bare values, up to the line end.
  {
    kind: "assignment",
    re: /\b([A-Za-z0-9_.-]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET|AUTH)[A-Za-z0-9_.-]*[ \t]*[:=][ \t]*)("[^"\n]{6,}"|'[^'\n]{6,}'|[^\s"'`,;]{6,})/gi,
    group: 2,
  },
];

// Long strings that look random. Hex is only redacted from 64 characters up: 40-hex git commit ids and short hashes
// are common in agent output and are not secrets. Base64-like strings need 32+ characters and real randomness.
const ENTROPY_CANDIDATE = /\b[A-Za-z0-9+/_-]{32,}={0,2}/g;

function shannon(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function looksRandom(token: string): boolean {
  if (/^[0-9a-f]+$/i.test(token)) return token.length >= 64 && shannon(token) >= 3.5;
  if (/^[a-z]+(?:[-_][a-z]+)*$/i.test(token)) return false; // words and identifiers joined by - or _
  if (!/[0-9]/.test(token) || !/[A-Z]/.test(token) || !/[a-z]/.test(token)) return false; // keys mix all three
  return shannon(token) >= 4.0;
}

export interface Redaction {
  /** The text with every secret replaced by `[redacted]`. */
  text: string;
  /** How many secrets were removed. */
  count: number;
  /** Which kinds were found (deduplicated), for the outbox line and the receipt. Never the secrets themselves. */
  kinds: SecretKind[];
  /** Characters of the original text that were removed. */
  removedChars: number;
}

/** Remove secrets from text bound for a vendor. Idempotent: redacting already-redacted text changes nothing. */
export function redactSecrets(input: string): Redaction {
  let text = input;
  let count = 0;
  let removedChars = 0;
  const kinds = new Set<SecretKind>();
  for (const rule of RULES) {
    text = text.replace(rule.re, (...m: string[]) => {
      const whole = m[0];
      const secret = rule.group ? m[rule.group] : whole;
      if (!secret || secret === REDACTED || secret.includes(REDACTED)) return whole;
      count++;
      removedChars += secret.length;
      kinds.add(rule.kind);
      return rule.group ? whole.replace(secret, REDACTED) : REDACTED;
    });
  }
  text = text.replace(ENTROPY_CANDIDATE, (token) => {
    if (!looksRandom(token)) return token;
    count++;
    removedChars += token.length;
    kinds.add("high_entropy");
    return REDACTED;
  });
  return { text, count, kinds: [...kinds], removedChars };
}

/** The spec's refusal rule: a payload is not sent when more than half of its original characters were secrets. */
export function mostlyRedacted(original: string, r: Redaction): boolean {
  return original.length > 0 && r.removedChars > original.length / 2;
}

/** The line the outbox and the receipt show. */
export function redactionLine(r: Redaction): string {
  return r.count === 0
    ? "Secrets removed on this machine first: none found."
    : `Secrets removed on this machine first: ${r.count} (${r.kinds.join(", ")}).`;
}
