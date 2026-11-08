export interface LifecycleResources {
  all: (statement: string, ...params: any[]) => any[];
  run: (statement: string, ...params: any[]) => number;
  nowIso: () => string;
  revokeGrantsFor: (workspace: string, user: string) => number;
  endSessions: (rows: {ws_id: string; session_key: string}[], reason: string, at: string) => number;
  deleteOrphanDirectives: () => unknown;
}
export function create_lifecycle(resources: LifecycleResources): {
  onMemberRemoved(wsId: string, userId: string): void;
  deleteMemberSessions(wsId: string, userId: string): number;
};
