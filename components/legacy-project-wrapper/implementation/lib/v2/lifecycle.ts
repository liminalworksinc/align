import { revokeGrantsFor } from "../oauth/grants";
import { all, run } from "./db";
import { nowIso } from "./ids";
import { endSessions } from "./sessions";
import { deleteOrphanDirectives } from "./retention";
import { create_lifecycle } from "../native/.bindings/server_account_lifecycle.js";

interface MembershipRuntime {
  onMemberRemoved: (wsId: string, userId: string) => void;
  deleteMemberSessions: (wsId: string, userId: string) => number;
}

const lifecycle = create_lifecycle({
  all, run, nowIso, revokeGrantsFor,
  endSessions: (...args: Parameters<typeof endSessions>) => endSessions(...args),
  deleteOrphanDirectives,
}) as unknown as MembershipRuntime;

// Keep these declarations hoisted in the existing session/workspace import cycle.
export function onMemberRemoved(wsId: string, userId: string) {
  return (0, lifecycle.onMemberRemoved)(wsId, userId);
}

export function deleteMemberSessions(wsId: string, userId: string): number {
  return (0, lifecycle.deleteMemberSessions)(wsId, userId);
}
