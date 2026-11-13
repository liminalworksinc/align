import type { SQLInputValue } from 'node:sqlite';

export interface Sql {
  run(sql: string, ...params: SQLInputValue[]): number;
  get<T = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T[];
}
export type EventName = keyof Core['EVENT_PROPS'];
export type EventProps = Record<string, string | number>;
export interface NewCode { id: string; code: string; email: string | null; expires_at: string; }
export interface CodeRow {
  id: string; email: string | null; request_id: string | null;
  created_at: string; expires_at: string; revoked_at: string | null;
  redeemed_at: string | null; ws_id: string | null;
}
export type RequestStatus = 'pending' | 'approved' | 'declined';
export interface AccessRequestRow {
  id: string; email: string; name: string; company: string | null;
  team_size: string | null; use_case: string; interest: 'try' | 'evaluate';
  status: RequestStatus; created_at: string; decided_at: string | null;
  code_id: string | null;
}
export interface EmailApi { url: string; key: string; from: string; }
type Harness = readonly ['claude-code', 'codex'];
type Estimates = readonly ['same_day', 'two_to_three_days', 'about_a_week', 'longer', 'would_not_be_decided'];
export interface Core {
  CODE_DAYS: 14;
  CODE_PREFIX: 'alc_';
  CODE_RE: RegExp;
  ESTIMATES: Estimates;
  EVENT_PROPS: {
    readonly access_requested: { readonly interest: readonly ['try', 'evaluate']; readonly via: readonly ['form', 'value_card'] };
    readonly access_approved: {};
    readonly access_declined: {};
    readonly code_created: { readonly source: readonly ['request', 'operator'] };
    readonly code_redeemed: {};
    readonly workspace_created: { readonly kind: readonly ['blank', 'sample'] };
    readonly invite_sent: { readonly role: readonly ['owner', 'member', 'viewer'] };
    readonly invite_accepted: { readonly role: readonly ['owner', 'member', 'viewer'] };
    readonly device_paired: { readonly workspaces: 'count' };
    readonly first_session_captured: { readonly harness: Harness };
    readonly member_first_session_captured: { readonly harness: Harness };
    readonly first_session_bound: { readonly harness: Harness; readonly authority: readonly ['own', 'pod', 'alignment'] };
    readonly second_member_joined: {};
    readonly first_change_request: {};
    readonly first_approval: {};
    readonly first_directive: { readonly kind: readonly ['goal_version', 'binding_changed', 'binding_suspended', 'stop', 'resume', 'request', 'hold', 'release'] };
    readonly first_mcp_read: { readonly client: readonly ['app', 'device'] };
    readonly loi_sent: { readonly note_ref: RegExp };
    readonly loi_signed: { readonly note_ref: RegExp; readonly verified_original: readonly ['yes'] };
    readonly first_ask: {};
    readonly first_limit: {};
    readonly value_card_viewed: {};
    readonly value_reported: { readonly estimate: Estimates };
    readonly follow_up_clicked: {};
    readonly first_request: { readonly type: readonly ['replan', 'checkpoint', 'switch_goal'] };
    readonly first_hold: {};
    readonly first_launch: {};
  };
  NOTE_REF_RE: RegExp;
  ONCE_PER_PERSON: readonly EventName[];
  ONCE_PER_WORKSPACE: readonly EventName[];
  REQUEST_STATUSES: readonly RequestStatus[];
  RESTORE_DAYS: 30;
  SCHEMA_VERSION: 22;
  accessRequest(db: Sql, id: string): AccessRequestRow | undefined;
  approveAccessRequest(db: Sql, secret: string, id: string, days?: number, now?: number): { request: AccessRequestRow; code: NewCode } | null;
  codeEmail(origin: string, name: string, code: NewCode, options?: { local?: boolean }): { subject: string; text: string };
  codeHash(secret: string, code: string): string;
  declineAccessRequest(db: Sql, id: string, now?: number): boolean;
  eventActor(secret: string, userId: string): string;
  hmac(secret: string, value: string): string;
  insertCreationCode(db: Sql, secret: string, o: { email?: string | null; requestId?: string | null; days?: number }, now?: number): NewCode;
  listAccessRequests(db: Sql, status?: RequestStatus): AccessRequestRow[];
  listCreationCodes(db: Sql): (CodeRow & { state: 'used' | 'revoked' | 'expired' | 'live' })[];
  liveCodeFor(db: Sql, email: string, now?: number): boolean;
  postEmail(api: EmailApi, msg: { to: string; subject: string; text: string }, what: string): Promise<void>;
  purgeWorkspace(db: Sql, wsId: string): boolean;
  rand32(bytes: number): string;
  recordEvent(db: Sql, name: EventName, o?: { ws?: string | null; actor?: string | null; at?: string; props?: EventProps }): boolean;
  redeemCreationCode(db: Sql, secret: string, code: string, email: string, userId: string, wsId: string, now?: number): boolean;
  revokeCreationCode(db: Sql, id: string, now?: number): boolean;
  serverSecret(): string;
  sessionMaxDays(): number;
  softDeleteWorkspace(db: Sql, wsId: string, actor: string, at: string): boolean;
  testIdpEnabled(): boolean;
  undoApproval(db: Sql, requestId: string, codeId: string): void;
  validMaxDays(): number;
  workspaceSummaries(db: Sql): { id: string; name: string; created_at: string; deleted_at: string | null; members: number; owners: number }[];
}
export interface CoreResources {
  serverSecret: Core['serverSecret'];
  hmac: Core['hmac'];
  runtimeSettings: Pick<Core, 'testIdpEnabled' | 'validMaxDays' | 'sessionMaxDays'>;
  identifierTools: Pick<Core, 'rand32'>;
  readDate(): DateConstructor;
  readFetch(): typeof fetch;
  readAbortSignal(): typeof AbortSignal;
  readConsole(): Pick<Console, 'error'>;
  readURLSearchParams(): typeof URLSearchParams;
}
export declare function create_core<R extends CoreResources>(resources: R): Omit<Core, 'serverSecret' | 'hmac' | 'testIdpEnabled' | 'validMaxDays' | 'sessionMaxDays' | 'rand32'> & {
  serverSecret: R['serverSecret']; hmac: R['hmac'];
  testIdpEnabled: R['runtimeSettings']['testIdpEnabled'];
  validMaxDays: R['runtimeSettings']['validMaxDays'];
  sessionMaxDays: R['runtimeSettings']['sessionMaxDays'];
  rand32: R['identifierTools']['rand32'];
};
