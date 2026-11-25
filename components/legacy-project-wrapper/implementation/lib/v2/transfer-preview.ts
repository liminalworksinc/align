// LIM-2529 experience preview (specs/align/transfer-authorization.md, ratified Nov 25): the outbox and the weekly receipt,
// on stand-in data, behind a switch that is off by default. This file is the ONE place the screens get their data, so
// when the enforcement side's endpoints exist only this file changes. Nothing here sends, stores or authorizes anything.

/** Off unless ALIGN_PREVIEW_TRANSFER_UI=1. When off, the outbox and receipt routes are not found. */
export function transferPreviewEnabled(): boolean {
  return process.env.ALIGN_PREVIEW_TRANSFER_UI === "1";
}

export type Capability = "activity_names" | "finding" | "excerpt" | "model_check" | "suggestion";
export type Preset = "private" | "team" | "regulated";

/** The ceiling presets, worded as in the founder's mock. The ceiling only narrows; Regulated turns vendor sends off. */
export const PRESETS: { id: Preset; name: string; desc: string }[] = [
  { id: "private", name: "Private by default", desc: "Findings to the goal owner only. No excerpts, no AI analysis." },
  { id: "team", name: "Open team", desc: "Findings flow to the team; words still need their author." },
  { id: "regulated", name: "Regulated", desc: "Nothing leaves unless someone says so." },
];

/** Who receives a transfer, as every grant names it (spec: "The recipient is named on every grant"). */
export interface Recipient {
  label: string;
}

/** One request an agent made that no consent or standing rule covered (spec: "A refused request becomes an outbox item"). */
export interface OutboxItem {
  id: string;
  capability: Capability;
  goal: string;
  title: string;
  /** What exactly would be sent, as lines; for an excerpt, the exact text instead. */
  lines: string[];
  quote?: string;
  recipient: Recipient;
  /** Set for vendor sends: "Secrets removed on this machine first: ...". */
  redaction?: string;
  /** Excerpts never get "Always" (each needs its author); vendor sends lose it under Regulated. */
  canAlways: boolean;
  /** Author's words: only the author decides (spec: "Only the author decides about their own content"). */
  authorsWords: boolean;
  expiresAt: string;
}

export interface ReceiptRow {
  id: string;
  when: string;
  what: string;
  to: string;
  allowedBy: string;
  /** "standing rule" or "allowed once". */
  how: string;
  vendor: boolean;
  /** Stored items (excerpts, findings) can be removed; a vendor send already happened. */
  undo: "remove" | "stop_future";
}

const HOURS = 3_600_000;

/** Stand-in data shaped like the spec's objects. Dates are relative to `now` so the 72-hour expiry reads true. */
export function standInOutbox(now = Date.now(), preset: Preset = "team"): OutboxItem[] {
  const expires = new Date(now + 72 * HOURS).toISOString();
  return [
    {
      id: "ob_findings", capability: "finding", goal: "Onboarding v2", title: "Wants to share 3 findings with your team",
      lines: ["Skipped the approved step “add empty states” twice", "Ran 42 minutes past the plan’s estimate", "You restated one instruction 5 times"],
      recipient: { label: "People who can see the goal “Onboarding v2”" },
      canAlways: true, authorsWords: false, expiresAt: expires,
    },
    {
      id: "ob_excerpt", capability: "excerpt", goal: "Onboarding v2", title: "Wants to share an excerpt of your session with Sean, for 48 hours",
      lines: [], quote: "Use the onboarding copy from the spec, not the old modal.\nKeep the checklist to three steps.",
      recipient: { label: "Sean, for 48 hours" },
      canAlways: false, authorsWords: true, expiresAt: expires,
    },
    {
      id: "ob_vendor", capability: "suggestion", goal: "Onboarding v2", title: "Wants AI analysis of this session to suggest which goal it serves",
      lines: ["Sends: your first prompt and the branch name, up to 8,000 characters"],
      recipient: { label: "Claude, via Anthropic, under Liminal’s account · not kept after the answer" },
      redaction: "Secrets removed on this machine first: 2 API keys, 1 email address",
      canAlways: preset !== "regulated", authorsWords: true, expiresAt: expires,
    },
  ];
}

export function standInReceipt(now = Date.now()): ReceiptRow[] {
  const at = (h: number) => new Date(now - h * HOURS).toISOString();
  return [
    { id: "rc_1", when: at(5), what: "3 findings on “Onboarding v2”", to: "People who can see the goal", allowedBy: "Shruti", how: "standing rule", vendor: false, undo: "remove" },
    { id: "rc_2", when: at(26), what: "An excerpt of your session", to: "Sean, for 48 hours", allowedBy: "Shruti", how: "allowed once", vendor: false, undo: "remove" },
    { id: "rc_3", when: at(30), what: "First prompt and branch name, secrets removed first (2)", to: "Claude, via Anthropic, under Liminal’s account", allowedBy: "Shruti", how: "standing rule", vendor: true, undo: "stop_future" },
  ];
}
