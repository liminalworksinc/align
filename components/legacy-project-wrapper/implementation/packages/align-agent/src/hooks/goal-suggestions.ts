import fs from "node:fs";
import path from "node:path";
import { clean } from "../shared/envelope.ts";
import { readJson, writeJsonAtomic } from "../shared/fsx.ts";
import { invalidatePastOffer, setSuggestionsQuiet, suggestionsQuiet, type GoalSuggestion, type SuggestionReply, type SuggestionStage } from "../shared/goal-suggestions.ts";
import { layout, spoolWrite } from "../shared/layout.ts";
import type { FeedFile } from "../shared/types.ts";

function available(home: string, lid: string, stage: SuggestionStage, feed: FeedFile | null, binding: string | null, suggestion = readJson<GoalSuggestion>(layout.suggestion(home, lid))) {
  if (!suggestion || !feed || suggestion.stage !== stage || suggestion.binding !== binding || suggestion.workspace !== feed.workspace_id
    || suggestionsQuiet(home, suggestion.folder) || readJson(layout.suggestionReply(home, lid, stage))) return null;
  const goals = suggestion.candidates.flatMap((id) => feed.goals.filter((g) => g.id === id && g.bindable && g.status === "active"));
  return goals.length === suggestion.candidates.length && goals.length ? { suggestion, goals } : null;
}

export function matchingSuggestionChoices(feed: FeedFile | null, ref: string) {
  const goals = feed?.goals ?? [];
  const byId = goals.find((g) => g.id === ref);
  if (byId) return [byId];
  const title = ref.toLowerCase();
  const exact = goals.filter((g) => g.title.toLowerCase() === title);
  return exact.length ? exact : goals.filter((g) => g.title.toLowerCase().startsWith(title));
}

export function takeGoalSuggestion(home: string, lid: string, cwd: string | null, getFeed: () => FeedFile | null, binding: string | null, stage: SuggestionStage) {
  const saved = readJson<GoalSuggestion>(layout.suggestion(home, lid));
  if (!cwd || saved?.stage !== stage || readJson(layout.suggestionSeen(home, lid, stage))) return null;
  const current = available(home, lid, stage, getFeed(), binding, saved);
  if (!current || current.suggestion.folder !== path.resolve(cwd)) return null;
  try {
    fs.writeFileSync(layout.suggestionSeen(home, lid, stage), "true", { flag: "wx", mode: 0o600 });
  } catch {
    return null;
  }
  const names = current.goals.map(({ title }) => `"${clean(title, 100)}"`).join(" or ");
  const how = stage === "move" ? "`::align bind <goal>`" : current.goals.length === 1 ? "`::align share` to preview sharing" : "`::align share <goal>` to pick one";
  return `Align: this session looks like work toward ${names}. Type ${how}, \`::align not this\` if the goal is wrong, \`::align dismiss\` to skip, or \`::align quiet\` to stop suggestions in this folder.`;
}

export function shownGoalSuggestion(home: string, lid: string, stage: SuggestionStage, feed: FeedFile | null, binding: string | null) {
  return readJson(layout.suggestionSeen(home, lid, stage)) ? available(home, lid, stage, feed, binding) : null;
}

export function saveSuggestionReply(home: string, lid: string, stage: SuggestionStage, reply: SuggestionReply, chosen: string | null, ts: string) {
  const file = layout.suggestionReply(home, lid, stage);
  if (readJson(file)) return;
  spoolWrite(home, { type: "suggestion_reply", local_id: lid, stage, reply, chosen, ts });
  writeJsonAtomic(file, true);
  if (stage === "initial") invalidatePastOffer(home);
}

export function suggestionCommand(home: string, lid: string, stage: SuggestionStage, cwd: string | null, verb: string, arg: string, ts: string) {
  if (verb === "quiet" || (verb === "suggestions" && arg === "on")) {
    if (!cwd) return "Align: this session has no working folder.";
    setSuggestionsQuiet(home, cwd, verb === "quiet");
    if (verb === "quiet") saveSuggestionReply(home, lid, stage, "quiet", null, ts);
    return verb === "quiet" ? "Align: suggestions are off in this folder. Type `::align suggestions on` to turn them back on."
      : "Align: suggestions are on in this folder.";
  }
  if ((verb === "not" && arg === "this") || (verb === "dismiss" && !arg)) {
    saveSuggestionReply(home, lid, stage, verb === "not" ? "wrong" : "dismissed", null, ts);
    return verb === "not" ? "Align: marked this suggestion as the wrong goal on this machine." : "Align: dismissed the suggestion for this session.";
  }
  return "Align: type `::align not this`, `::align dismiss`, `::align quiet` or `::align suggestions on`.";
}
