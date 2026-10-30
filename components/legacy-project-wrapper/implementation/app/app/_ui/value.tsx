"use client";
import type { ChangeRequest } from "./types";

// The decision value card on an approved change request (PORT-004): the accepted change, who approved it, the goals
// and teams it affects, whether agents have the new version, the spans Align measured, the value reports (an estimate
// with an optional note, one per person) and the follow-up link.
//
// PORT-001 declares this slot and its props; it renders nothing until PORT-004 fills it in. changes.tsx renders it only
// for an approved request.

export function ValueCard(props: { ws: string; cr: ChangeRequest; me: string }) {
  void props;
  return null;
}
