export interface Creator { id: string; email: string; emailVerified: boolean; }
export interface Creation {
  needsCode(email: string): boolean;
  precheckCreation(request: unknown, creator: Creator, code: string | null): Promise<void>;
  admitCreation(creator: Creator, code: string | null, workspaceId: string): boolean;
  checkRestoreCaps(userId: string): void;
  checkMemberCap(workspaceId: string, countInvites: boolean): void;
  sessionCapError(max: number): Error;
}
export interface Access {
  TEAM_SIZES: readonly ['1', '2-10', '11-50', '51-200', '201+'];
  INTERESTS: readonly ['try', 'evaluate'];
  VIAS: readonly ['form', 'value_card'];
  createAccessRequest(request: unknown, client: string, body: unknown): Promise<{received: true}>;
}
export interface Disposable { isDisposable(email: string): boolean; refuseDisposable(email: string): void; }
