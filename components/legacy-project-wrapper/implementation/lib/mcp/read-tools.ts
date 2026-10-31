// What an AI app connected to a workspace can read: one line per read tool that lib/mcp/register.ts registers for
// every token (goals:read), in its order, in the words the Home's first-run card uses. No imports, so the web app can
// show it; scripts/test-v2.mjs checks these names against the server's own tools/list. The optional evidence tool
// (changes:evidence) is not a read and is not listed here.

export const READ_TOOLS: readonly { name: string; reads: string; agentReported?: true }[] = [
  { name: "align_list_goals", reads: "The goals you can read, at their current version" },
  { name: "align_get_goal", reads: "One goal's measures and its earlier versions" },
  { name: "align_list_change_requests", reads: "Change requests, with their evidence links" },
  { name: "align_get_decision_record", reads: "Decision records: who approved or rejected a change, and why" },
  { name: "align_get_directives", reads: "What changed for your own shared sessions" },
  { name: "align_get_limits", reads: "The goals' limits" },
  { name: "align_get_asks", reads: "What teams were asked to do" },
  { name: "align_get_goal_activity", reads: "Agent activity toward the goals, as sessions reported it", agentReported: true },
  { name: "align_get_brief", reads: "A short brief: your goals, their limits and what is waiting" },
];
