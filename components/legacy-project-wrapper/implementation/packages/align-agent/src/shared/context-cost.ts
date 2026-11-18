// Hook-safe accounting of final returned strings. No I/O and no token or price estimate.
import type { AddedText, InjectedState } from "./types.ts";

export const emptyAddedText = (): AddedText => ({ characters: 0, additions: 0, last_at: null, last_event: null });

type TextOutput = {
  hookSpecificOutput?: { hookEventName?: string; additionalContext?: string; permissionDecisionReason?: string };
  systemMessage?: string;
  decision?: string;
  reason?: string;
};

/** One addition per audience per hook return, including separators already in the final strings. */
export function countOutput(inj: InjectedState, output: Record<string, unknown>, event: NonNullable<AddedText["last_event"]>): void {
  const out = output as TextOutput;
  const model = (out.hookSpecificOutput?.additionalContext?.length || 0) + (out.hookSpecificOutput?.permissionDecisionReason?.length || 0);
  const person = (out.systemMessage?.length || 0) + (out.decision === "block" ? out.reason?.length || 0 : 0);
  const at = new Date().toISOString();
  for (const [key, characters] of [["context_added", model], ["notices_added", person]] as const) {
    if (!characters) continue;
    const before = inj[key] || emptyAddedText();
    inj[key] = { characters: before.characters + characters, additions: before.additions + 1, last_at: at, last_event: event };
  }
}

export function contextAddedLine(total: AddedText | undefined): string {
  if (!total?.additions) return "Align has added no characters to this session's context.";
  const event = total.last_event === "SessionStart" ? "session start" : total.last_event === "PreToolUse" ? "a tool call" : "a prompt";
  return `Align has added ${total.characters} characters to this session's context in ${total.additions} ${total.additions === 1 ? "addition" : "additions"}, last at ${event} (${total.last_at}).`;
}
