// LIM-2529 experience preview (specs/align/transfer-authorization.md, ratified Nov 25): the outbox, the agent's view of it
// and the weekly receipt, on stand-in data, behind a switch that is off by default. Wording follows the founder's mock
// (her review, Nov 25: "use the mock's wording"). This file is the ONE place the screens get their data, so when the
// enforcement side's endpoints exist only this file changes. Nothing here sends, stores or authorizes anything.

/** Off unless ALIGN_PREVIEW_TRANSFER_UI=1. When off, the outbox and receipt routes are not found. */
export function transferPreviewEnabled(): boolean {
  return process.env.ALIGN_PREVIEW_TRANSFER_UI === "1";
}

export type Capability = "activity_names" | "finding" | "excerpt" | "model_check" | "suggestion";
export type Preset = "private" | "team" | "regulated";
export type Decision = "once" | "always" | "no";

/** The ceiling presets, worded as in the founder's mock. The ceiling only narrows; Regulated turns vendor sends off. */
export const PRESETS: { id: Preset; name: string; desc: string }[] = [
  { id: "private", name: "Private by default", desc: "Findings to the goal owner only. No excerpts, no AI analysis." },
  { id: "team", name: "Open team", desc: "Findings flow to the team; words still need their author." },
  { id: "regulated", name: "Regulated", desc: "Nothing leaves unless someone says so." },
];

/** One request an agent made that no consent or standing rule covered (spec: "A refused request becomes an outbox item"). */
export interface OutboxItem {
  id: string;
  capability: Capability;
  goal: string;
  title: string;
  /** What exactly would be sent, as lines; for an excerpt, the exact text instead. */
  lines: string[];
  quote?: string;
  /** Who receives it, as every grant names it (spec: "The recipient is named on every grant"). */
  recipient: string;
  /** Set for vendor sends: "Secrets removed on this machine first: ...". */
  redaction?: string;
  /** Excerpts never get "Always" (each needs its author); vendor sends lose it under Regulated. */
  canAlways: boolean;
  /** The line under the item, from the mock. */
  note: string;
  /** What the person sees after deciding; a missing entry shows the generic line. */
  confirm: Partial<Record<Decision, string>>;
  /** The agent's side: the command it ran and what it was told, per state (the mock's terminal panel). */
  terminal: { command: string } & Record<"pending" | Decision, string[]>;
  /** The receipt line if it leaves. */
  receipt: { what: string; to: string; vendor: boolean };
  expiresAt: string;
}

const HOURS = 3_600_000;

/** Stand-in data shaped like the spec's objects. Dates are relative to `now` so the 72-hour expiry reads true. */
export function standInOutbox(now = Date.now(), preset: Preset = "team"): OutboxItem[] {
  const expiresAt = new Date(now + 72 * HOURS).toISOString();
  return [
    {
      id: "ob_findings", capability: "finding", goal: "Onboarding v2", title: "Wants to share 3 findings with your team",
      lines: ["Skipped the approved step “add empty states” twice", "Ran 42 minutes past the plan’s estimate", "You restated one instruction 5 times"],
      recipient: "People who can see the goal “Onboarding v2”",
      canAlways: true,
      // The mock's "Sent because this goal's findings are visible to the team" describes a LATER request a rule covers; on
      // a waiting item it would be false, so the waiting item carries no note (found in browser review, Nov 25).
      note: "",
      confirm: { always: "Rule added to “Onboarding v2”: agent findings are now visible to the team. Change it on the goal any time." },
      terminal: {
        command: "$ align share findings --goal onboarding-v2",
        pending: ["→ asked. waiting in your outbox.", "→ no pass yet. continuing without sharing."],
        once: ["→ one-time pass received. 3 findings sent.", "→ pass used up."],
        always: ["→ covered by goal rule. 3 findings sent."],
        no: ["→ declined. not shared. continuing."],
      },
      receipt: { what: "3 findings on “Onboarding v2”", to: "people who can see the goal", vendor: false },
      expiresAt,
    },
    {
      id: "ob_excerpt", capability: "excerpt", goal: "Onboarding v2", title: "Wants to share an excerpt of your session with Sean, for 48 hours",
      lines: [], quote: "Use the onboarding copy from the spec, not the old modal.\nKeep the checklist to three steps.",
      recipient: "Sean, for 48 hours",
      canAlways: false,
      note: preset === "regulated" ? "Regulated workspace: your words never leave." : "Your words: no “always” option. Each excerpt needs you.",
      confirm: {},
      terminal: {
        command: "$ align share excerpt --with sean --hours 48",
        pending: ["→ asked. waiting in your outbox."],
        once: ["→ one-time pass received. excerpt shared with Sean."],
        always: ["→ one-time pass received. excerpt shared with Sean."],
        no: ["→ declined. not shared."],
      },
      receipt: { what: "An excerpt of your session", to: "Sean, for 48 hours", vendor: false },
      expiresAt,
    },
    {
      id: "ob_vendor", capability: "suggestion", goal: "Onboarding v2", title: "Wants AI analysis of this session to suggest which goal it serves",
      lines: ["Sends: your first prompt and the branch name, up to 8,000 characters"],
      recipient: "Claude, via Anthropic, under Liminal’s account · not kept after the answer",
      redaction: "Secrets removed on this machine first: 2 API keys, 1 email address",
      canAlways: preset !== "regulated",
      note: preset === "regulated"
        ? "Regulated workspace: AI analysis is off. The agent was told no, and kept working."
        : "Your words, so you decide. “Always” turns analysis on for your sessions on this goal only.",
      confirm: { always: "AI analysis is on for your sessions on “Onboarding v2”. Secrets are removed on your machine first, and each send shows on your receipt." },
      terminal: {
        command: "$ align suggest-goal --session current",
        pending: ["→ secrets removed locally (3). asked. waiting in your outbox."],
        once: ["→ one-time pass received. sent to Claude. suggestion: “Onboarding v2”."],
        always: ["→ covered by your analysis rule. suggestion: “Onboarding v2”."],
        no: ["→ declined. not sent. continuing."],
      },
      receipt: { what: "First prompt and branch name, secrets removed first", to: "Claude, via Anthropic, under Liminal’s account", vendor: true },
      expiresAt,
    },
  ];
}

/** The line every agent gets when it tries to approve for itself (the mock's last terminal line). */
export const AGENT_APPROVE_ATTEMPT = {
  command: "$ align share --approve-all",
  answer: "→ refused: agents can ask, not approve. approvals happen in Align, signed in as a person.",
};

export const GENERIC_CONFIRM: Record<Decision, string> = {
  once: "Allowed once. Only this exact request can be sent, once.",
  always: "Allowed for this goal. Later requests like this are sent without asking, and each shows on your receipt.",
  no: "Not sent. The agent was told no and kept working.",
};

export interface ReceiptRow {
  id: string;
  what: string;
  to: string;
  allowedBy: string;
  how: "standing rule" | "allowed once";
  vendor: boolean;
}

/** The receipt follows the outbox: everything allowed (once or always) appears; "Not this" and undecided items don't. */
export function receiptFrom(items: OutboxItem[], decisions: Record<string, Decision>, allowedBy: string): ReceiptRow[] {
  return items.flatMap((item) => {
    const d = decisions[item.id];
    if (d !== "once" && d !== "always") return [];
    return [{ id: item.id, ...item.receipt, allowedBy, how: d === "always" ? "standing rule" : "allowed once" }];
  });
}

/** Where the preview keeps the outbox's decisions in this browser tab, so the receipt can follow them. */
export const decisionsKey = (ws: string) => `align-preview-outbox:${ws}`;
