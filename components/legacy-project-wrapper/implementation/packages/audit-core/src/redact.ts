// The redaction pass that runs before the preview (spec C4). The preview shows the redacted text; only redacted text is
// ever sent to a model. Errs toward removing too much: a false positive costs a word, a miss leaks a secret.

export interface Redaction {
  text: string;
  counts: { email: number; phone: number; key: number };
}

const RULES: { kind: keyof Redaction["counts"]; re: RegExp; label: string }[] = [
  // Private keys and bearer/basic credentials first, so their bodies are not half-matched by later rules.
  { kind: "key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, label: "[private key removed]" },
  { kind: "key", re: /\b(?:bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{12,}/gi, label: "[credential removed]" },
  // Known key shapes: Anthropic, OpenAI, GitHub, Slack, AWS, Google, Stripe, JWTs.
  { kind: "key", re: /\b(?:sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|[rs]k_(?:live|test)_[A-Za-z0-9]{16,})\b/g, label: "[key removed]" },
  { kind: "key", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, label: "[token removed]" },
  // key=value / key: value secrets.
  { kind: "key", re: /\b((?:api[_-]?key|secret|password|passwd|pwd|access[_-]?token|auth[_-]?token|client[_-]?secret)\s*[:=]\s*)["']?[^\s"',;]{6,}["']?/gi, label: "$1[removed]" },
  // Long opaque strings (hex 32+, or base64-like 40+ with mixed case and digits).
  { kind: "key", re: /\b[a-f0-9]{32,}\b/gi, label: "[key removed]" },
  { kind: "key", re: /\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[a-z])(?=[A-Za-z0-9+/_-]*[A-Z])[A-Za-z0-9+/_-]{40,}={0,2}/g, label: "[key removed]" },
  { kind: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, label: "[email removed]" },
  // Phone numbers: international or North American shapes, at least 10 digits.
  { kind: "phone", re: /(?<![\w/])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]\d{3,4}(?![\w/])/g, label: "[phone removed]" },
];

export function redact(input: string): Redaction {
  const counts = { email: 0, phone: 0, key: 0 };
  let text = input;
  for (const { kind, re, label } of RULES) {
    text = text.replace(re, (...args) => {
      const digits = String(args[0]).replace(/\D/g, "");
      if (kind === "phone" && digits.length < 10) return String(args[0]);
      counts[kind]++;
      return label.includes("$1") ? label.replace("$1", String(args[1])) : label;
    });
  }
  return { text, counts };
}
