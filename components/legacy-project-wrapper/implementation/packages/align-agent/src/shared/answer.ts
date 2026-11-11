// The `answer` directive (LIM-2505), checked the same way by directive intake and the hot file. Hook-safe: a type import only.
import type { WireAnswer } from "./types.ts";

/** An `answer` of the shape the server sends (LIM-2505). */
export function validAnswer(a: unknown): a is WireAnswer {
  const x = a as WireAnswer | null;
  return (
    !!x &&
    typeof x.question_id === "string" &&
    (x.answer === "continue" || x.answer === "steer" || x.answer === "switch") &&
    (x.text === null || typeof x.text === "string") &&
    (x.answer !== "steer" || (typeof x.text === "string" && !!x.text.trim())) &&
    typeof x.by === "string" &&
    (x.target_goal === null || (typeof x.target_goal?.id === "string" && typeof x.target_goal?.title === "string")) &&
    (x.limit === null || x.limit === undefined || (typeof x.limit?.type === "string" && typeof x.limit?.text === "string"))
  );
}
