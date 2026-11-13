// Caller-owned text, refusal, entropy and clock bindings.
import { badRequest } from "./errors";
import { cleanProse, isBlankText } from "./text-core.mts";
import { rand32 } from "./ids";
import { create_goal_limits } from "../native/.bindings/goal_limits.js";

export type LimitType = "must" | "must_not" | "out_of_scope";
export interface LimitSource {
  kind: "meeting" | "manual";
  title: string;
  date: string;
}
export interface Limit {
  id: string;
  type: LimitType;
  text: string;
  source: LimitSource | null;
}
interface LimitRuntime {
  LIMIT_TYPES: readonly LimitType[];
  LIMITS_MAX: 5;
  LIMIT_TEXT_MAX: 160;
  LIMIT_SOURCE_TITLE_MAX: 120;
  cleanText(v: string): string;
  isDay(v: unknown): v is string;
  newLimitId(): string;
  limitsOf(row: { limits_json: string }): Limit[];
  limitsIn(v: unknown, prev: Limit[]): Limit[];
}
const limitService = create_goal_limits({
  badRequest: (...args: Parameters<typeof badRequest>) => badRequest(...args),
  cleanProse: (...args: Parameters<typeof cleanProse>) => cleanProse(...args),
  isBlankText: (...args: Parameters<typeof isBlankText>) => isBlankText(...args),
  rand32: (...args: Parameters<typeof rand32>) => rand32(...args),
  readDate: () => Date,
}) as unknown as LimitRuntime;

export const LIMIT_TYPES = limitService.LIMIT_TYPES;
export const LIMITS_MAX = limitService.LIMITS_MAX;
export const LIMIT_TEXT_MAX = limitService.LIMIT_TEXT_MAX;
export const LIMIT_SOURCE_TITLE_MAX = limitService.LIMIT_SOURCE_TITLE_MAX;
export const cleanText = (v: string) => (0, limitService.cleanText)(v);
export function isDay(v: unknown): v is string {
  return (0, limitService.isDay)(v);
}
export const newLimitId = () => (0, limitService.newLimitId)();
export function limitsOf(row: { limits_json: string }): Limit[] {
  return (0, limitService.limitsOf)(row);
}
export function limitsIn(v: unknown, prev: Limit[]): Limit[] {
  return (0, limitService.limitsIn)(v, prev);
}
