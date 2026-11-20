import type { StatusKind } from "../ds";
import type { ChangeRequest } from "../types";

/** The request's state as a pill: launch is its own state, so an approved, unlaunched change never reads as launched. */
export function crStatus(cr: Pick<ChangeRequest, "state" | "launch">): { kind: StatusKind; label?: string } {
  if (cr.state === "approved") return cr.launch === "launched" ? { kind: "launched" } : { kind: "approved", label: cr.launch === "not_yet" ? "Approved, launch not yet" : "Approved, not launched" };
  if (cr.state === "pending") return { kind: "pending" };
  if (cr.state === "countered") return { kind: "countered" };
  if (cr.state === "rejected") return { kind: "declined" };
  return { kind: "draft", label: cr.state === "withdrawn" ? "Withdrawn" : "Superseded" };
}
