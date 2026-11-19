import path from "node:path";
import { randomId, readJson, writeJsonAtomic } from "./fsx.ts";
import { layout } from "./layout.ts";

export type SuggestionOrigin = "suggested_rule" | "suggested_agent" | "suggested_model";
export type SuggestionStage = "initial" | "move";
export type SuggestionReply = "accepted" | "changed" | "wrong" | "dismissed" | "quiet";
export type GoalSuggestion = {
  stage: SuggestionStage;
  workspace: string;
  candidates: string[];
  origin: SuggestionOrigin;
  binding: string | null;
  folder: string;
};

const quietFolders = (home: string) => readJson<string[]>(layout.suggestionQuiet(home)) ?? [];

export function suggestionsQuiet(home: string, cwd: string | null): boolean {
  return !!cwd && quietFolders(home).includes(path.resolve(cwd));
}

export function invalidatePastOffer(home: string): void {
  try {
    writeJsonAtomic(layout.pastOfferChange(home), randomId("offer_"));
  } catch {
    // The weekly note is best effort.
  }
}

export function setSuggestionsQuiet(home: string, cwd: string, quiet: boolean): void {
  const folder = path.resolve(cwd);
  const folders = quietFolders(home).filter((dir) => dir !== folder);
  if (quiet) folders.push(folder);
  writeJsonAtomic(layout.suggestionQuiet(home), folders);
  invalidatePastOffer(home);
}
