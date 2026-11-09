// Caller-owned authorization, visibility, quota and content bindings.
import { badRequest, forbidden, V2Error } from "./errors";
import { cleanText, isDay, limitsOf, LIMIT_SOURCE_TITLE_MAX, LIMIT_TEXT_MAX, type LimitSource, type LimitType } from "./goal-limits";
import { goalObj, goalRow, visibleGoals, type GoalRow } from "./goals";
import { takeAll } from "./limits";
import { isBlankText } from "./text-core.mts";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { type Body } from "./validate";
import { create_suggestions } from "../native/.bindings/limit_suggest.js";

export interface LimitSuggestion {
  type: LimitType;
  text: string;
  quote: string;
  source: LimitSource;
  already: string | null;
}
export interface GoalSuggestions {
  goal: { id: string; title: string; version: number };
  can_edit: boolean;
  can_propose: boolean;
  limits: LimitSuggestion[];
}
interface SuggestionRuntime {
  NOTES_MAX: 20000;
  sentences(text: string): string[];
  limitType(sentence: string): LimitType | null;
  keyWords(text: string): Set<string>;
  sameAs<T extends { text: string }>(limits: T[], text: string): T | undefined;
  goalFor(goals: GoalRow[], sentence: string, prefer: string | null): GoalRow | null;
  suggestLimits(pp: PolicyPrincipal, b: Body): { suggestions: GoalSuggestions[]; dropped: number };
}
const suggestionService = create_suggestions({
  badRequest: (...args: Parameters<typeof badRequest>) => badRequest(...args),
  forbidden: (...args: Parameters<typeof forbidden>) => forbidden(...args),
  V2Error,
  cleanText: (...args: Parameters<typeof cleanText>) => cleanText(...args),
  isDay: (...args: Parameters<typeof isDay>) => isDay(...args),
  limitsOf: (...args: Parameters<typeof limitsOf>) => limitsOf(...args),
  LIMIT_SOURCE_TITLE_MAX,
  LIMIT_TEXT_MAX,
  goalObj: (...args: Parameters<typeof goalObj>) => goalObj(...args),
  goalRow: (...args: Parameters<typeof goalRow>) => goalRow(...args),
  visibleGoals: (...args: Parameters<typeof visibleGoals>) => visibleGoals(...args),
  takeAll: (...args: Parameters<typeof takeAll>) => takeAll(...args),
  isBlankText: (...args: Parameters<typeof isBlankText>) => isBlankText(...args),
  canReadGoal: (...args: Parameters<typeof canReadGoal>) => canReadGoal(...args),
}) as unknown as SuggestionRuntime;

export const NOTES_MAX = suggestionService.NOTES_MAX;
export function sentences(text: string): string[] {
  return (0, suggestionService.sentences)(text);
}
export function limitType(sentence: string): LimitType | null {
  return (0, suggestionService.limitType)(sentence);
}
export function keyWords(text: string): Set<string> {
  return (0, suggestionService.keyWords)(text);
}
export function sameAs<T extends { text: string }>(limits: T[], text: string): T | undefined {
  return (0, suggestionService.sameAs)(limits, text);
}
export function goalFor(goals: GoalRow[], sentence: string, prefer: string | null): GoalRow | null {
  return (0, suggestionService.goalFor)(goals, sentence, prefer);
}
export function suggestLimits(pp: PolicyPrincipal, b: Body): { suggestions: GoalSuggestions[]; dropped: number } {
  return (0, suggestionService.suggestLimits)(pp, b);
}
