// Bind the qualified core service to the current host. Behavior lives in the library.
import type { SQLInputValue } from "node:sqlite";
import { createHash } from "node:crypto";
import { create_creation_compatibility } from "../native/.bindings/server_creation_compatibility.js";
import { create_core } from "../native/server_core/create_core.js";
import { serverSecret as sourceServerSecret, hmac as sourceHmac } from "../server-secret-tools.mts";
import { runtimeSettings } from "../runtime-settings.mts";
import { identifierTools } from "../identifier-tools.mts";

export interface Sql {
  run(sql: string, ...params: SQLInputValue[]): number;
  get<T = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T[];
}

export type EventName = keyof typeof EVENT_PROPS;

export type EventProps = Record<string, string | number>;

export interface NewCode {
  id: string;
  code: string;
  email: string | null;
  expires_at: string;
}

export interface CodeRow {
  id: string;
  email: string | null;
  request_id: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  redeemed_at: string | null;
  ws_id: string | null;
}

export type RequestStatus = "pending" | "approved" | "declined";

export interface AccessRequestRow {
  id: string;
  email: string;
  name: string;
  company: string | null;
  team_size: string | null;
  use_case: string;
  interest: "try" | "evaluate";
  status: RequestStatus;
  created_at: string;
  decided_at: string | null;
  code_id: string | null;
}

export interface EmailApi {
  url: string;
  key: string;
  from: string;
}

interface CoreRuntime {
    CODE_DAYS: 14;
    CODE_PREFIX: "alc_";
    CODE_RE: RegExp;
    ESTIMATES: readonly ["same_day", "two_to_three_days", "about_a_week", "longer", "would_not_be_decided"];
    EVENT_PROPS: { readonly access_requested: { readonly interest: readonly ["try", "evaluate"]; readonly via: readonly ["form", "value_card"]; }; readonly access_approved: Record<never, never>; readonly access_declined: Record<never, never>; readonly code_created: { readonly source: readonly ["request", "operator"]; }; readonly code_redeemed: Record<never, never>; readonly workspace_created: { readonly kind: readonly ["blank", "sample"]; }; readonly invite_sent: { readonly role: readonly ["owner", "member", "viewer"]; }; readonly invite_accepted: { readonly role: readonly ["owner", "member", "viewer"]; }; readonly device_paired: { readonly workspaces: "count"; }; readonly first_session_captured: { readonly harness: readonly ["claude-code", "codex"]; }; readonly member_first_session_captured: { readonly harness: readonly ["claude-code", "codex"]; }; readonly first_session_bound: { readonly harness: readonly ["claude-code", "codex"]; readonly authority: readonly ["own", "pod", "alignment"]; }; readonly second_member_joined: Record<never, never>; readonly first_change_request: Record<never, never>; readonly first_approval: Record<never, never>; readonly first_directive: { readonly kind: readonly ["goal_version", "binding_changed", "binding_suspended", "stop", "resume", "request", "hold", "release"]; }; readonly first_mcp_read: { readonly client: readonly ["app", "device"]; }; readonly loi_sent: { readonly note_ref: RegExp; }; readonly loi_signed: { readonly note_ref: RegExp; readonly verified_original: readonly ["yes"]; }; readonly first_ask: Record<never, never>; readonly first_limit: Record<never, never>; readonly value_card_viewed: Record<never, never>; readonly value_reported: { readonly estimate: readonly ["same_day", "two_to_three_days", "about_a_week", "longer", "would_not_be_decided"]; }; readonly follow_up_clicked: Record<never, never>; readonly first_request: { readonly type: readonly ["replan", "checkpoint", "switch_goal"]; }; readonly first_hold: Record<never, never>; readonly first_launch: Record<never, never>; };
    NOTE_REF_RE: RegExp;
    ONCE_PER_PERSON: readonly ("access_requested" | "access_approved" | "access_declined" | "code_created" | "code_redeemed" | "workspace_created" | "invite_sent" | "invite_accepted" | "device_paired" | "first_session_captured" | "member_first_session_captured" | "first_session_bound" | "second_member_joined" | "first_change_request" | "first_approval" | "first_directive" | "first_mcp_read" | "loi_sent" | "loi_signed" | "first_ask" | "first_limit" | "value_card_viewed" | "value_reported" | "follow_up_clicked" | "first_request" | "first_hold" | "first_launch")[];
    ONCE_PER_WORKSPACE: readonly ("access_requested" | "access_approved" | "access_declined" | "code_created" | "code_redeemed" | "workspace_created" | "invite_sent" | "invite_accepted" | "device_paired" | "first_session_captured" | "member_first_session_captured" | "first_session_bound" | "second_member_joined" | "first_change_request" | "first_approval" | "first_directive" | "first_mcp_read" | "loi_sent" | "loi_signed" | "first_ask" | "first_limit" | "value_card_viewed" | "value_reported" | "follow_up_clicked" | "first_request" | "first_hold" | "first_launch")[];
    REQUEST_STATUSES: readonly RequestStatus[];
    RESTORE_DAYS: 30;
    SCHEMA_VERSION: 22;
    accessRequest: (db: Sql, id: string) => AccessRequestRow | undefined;
    approveAccessRequest: (db: Sql, secret: string, id: string, days?: number, now?: number) => { request: AccessRequestRow; code: NewCode; } | null;
    codeEmail: (origin: string, name: string, code: NewCode, { local }?: { local?: boolean; }) => { subject: string; text: string; };
    codeHash: (secret: string, code: string) => string;
    declineAccessRequest: (db: Sql, id: string, now?: number) => boolean;
    eventActor: (secret: string, userId: string) => string;
    hmac: typeof sourceHmac;
    insertCreationCode: (db: Sql, secret: string, o: { email?: string | null; days?: number; requestId?: string | null; }, now?: number) => NewCode;
    listAccessRequests: (db: Sql, status?: RequestStatus) => AccessRequestRow[];
    listCreationCodes: (db: Sql) => (CodeRow & { state: "live" | "used" | "revoked" | "expired"; })[];
    liveCodeFor: (db: Sql, email: string, now?: number) => boolean;
    postEmail: (api: EmailApi, msg: { to: string; subject: string; text: string; }, what: string) => Promise<void>;
    purgeWorkspace: (db: Sql, wsId: string) => boolean;
    rand32: typeof identifierTools.rand32;
    recordEvent: (db: Sql, name: EventName, o?: { ws?: string | null; actor?: string | null; props?: EventProps; at?: string; }) => boolean;
    redeemCreationCode: (db: Sql, secret: string, code: string, email: string, userId: string, wsId: string, now?: number) => boolean;
    revokeCreationCode: (db: Sql, id: string, now?: number) => boolean;
    serverSecret: typeof sourceServerSecret;
    sessionMaxDays: typeof runtimeSettings.sessionMaxDays;
    softDeleteWorkspace: (db: Sql, wsId: string, actor: string | null, at: string) => boolean;
    testIdpEnabled: typeof runtimeSettings.testIdpEnabled;
    undoApproval: (db: Sql, requestId: string, codeId: string) => void;
    validMaxDays: typeof runtimeSettings.validMaxDays;
    workspaceSummaries: (db: Sql) => { id: string; name: string; created_at: string; deleted_at: string | null; members: number; owners: number; }[];
}

const core = create_core({
  serverSecret: sourceServerSecret,
  hmac: sourceHmac,
  runtimeSettings,
  identifierTools,
  readDate: () => Date,
  readFetch: () => fetch,
  readAbortSignal: () => AbortSignal,
  readConsole: () => console,
  readURLSearchParams: () => URLSearchParams,
}) satisfies CoreRuntime;

interface CreationCompatibilityRuntime {
  V1_CODE_RE: RegExp;
  isCreationCode(code: string): boolean;
  importCreationCodes(db: Sql, secret: string, codes: {code: string; email: string | null}[], spent: Set<string>, days: number, now?: number): {imported: number; present: number; used: number; spentOnV1: number};
  redeemCreationCode: CoreRuntime["redeemCreationCode"];
}
const creation = create_creation_compatibility({core, createHash, readDate: () => Date}) as unknown as CreationCompatibilityRuntime;
export const V1_CODE_RE: RegExp = creation.V1_CODE_RE;
export const isCreationCode: (code: string) => boolean = creation.isCreationCode;
export const importCreationCodes: (db: Sql, secret: string, codes: {code: string; email: string | null}[], spent: Set<string>, days: number, now?: number) => {imported: number; present: number; used: number; spentOnV1: number} = creation.importCreationCodes;

export const CODE_DAYS: CoreRuntime["CODE_DAYS"] = core.CODE_DAYS;
export const CODE_PREFIX: CoreRuntime["CODE_PREFIX"] = core.CODE_PREFIX;
export const CODE_RE: CoreRuntime["CODE_RE"] = core.CODE_RE;
export const ESTIMATES: CoreRuntime["ESTIMATES"] = core.ESTIMATES;
export const EVENT_PROPS: CoreRuntime["EVENT_PROPS"] = core.EVENT_PROPS;
export const NOTE_REF_RE: CoreRuntime["NOTE_REF_RE"] = core.NOTE_REF_RE;
export const ONCE_PER_PERSON: CoreRuntime["ONCE_PER_PERSON"] = core.ONCE_PER_PERSON;
export const ONCE_PER_WORKSPACE: CoreRuntime["ONCE_PER_WORKSPACE"] = core.ONCE_PER_WORKSPACE;
export const REQUEST_STATUSES: CoreRuntime["REQUEST_STATUSES"] = core.REQUEST_STATUSES;
export const RESTORE_DAYS: CoreRuntime["RESTORE_DAYS"] = core.RESTORE_DAYS;
// The active schema version independently guards the composed migration count.
export const SCHEMA_VERSION = 24;
export const accessRequest: CoreRuntime["accessRequest"] = core.accessRequest;
export const approveAccessRequest: CoreRuntime["approveAccessRequest"] = core.approveAccessRequest;
export const codeEmail: CoreRuntime["codeEmail"] = core.codeEmail;
export const codeHash: CoreRuntime["codeHash"] = core.codeHash;
export const declineAccessRequest: CoreRuntime["declineAccessRequest"] = core.declineAccessRequest;
export const eventActor: CoreRuntime["eventActor"] = core.eventActor;
export const hmac: CoreRuntime["hmac"] = core.hmac;
export const insertCreationCode: CoreRuntime["insertCreationCode"] = core.insertCreationCode;
export const listAccessRequests: CoreRuntime["listAccessRequests"] = core.listAccessRequests;
export const listCreationCodes: CoreRuntime["listCreationCodes"] = core.listCreationCodes;
export const liveCodeFor: CoreRuntime["liveCodeFor"] = core.liveCodeFor;
export const postEmail: CoreRuntime["postEmail"] = core.postEmail;
export const purgeWorkspace: CoreRuntime["purgeWorkspace"] = core.purgeWorkspace;
export const rand32: CoreRuntime["rand32"] = core.rand32;
export const recordEvent: CoreRuntime["recordEvent"] = core.recordEvent;
export const redeemCreationCode: CoreRuntime["redeemCreationCode"] = creation.redeemCreationCode;
export const revokeCreationCode: CoreRuntime["revokeCreationCode"] = core.revokeCreationCode;
export const serverSecret: CoreRuntime["serverSecret"] = core.serverSecret;
export const sessionMaxDays: CoreRuntime["sessionMaxDays"] = core.sessionMaxDays;
export const softDeleteWorkspace: CoreRuntime["softDeleteWorkspace"] = core.softDeleteWorkspace;
export const testIdpEnabled: CoreRuntime["testIdpEnabled"] = core.testIdpEnabled;
export const undoApproval: CoreRuntime["undoApproval"] = core.undoApproval;
export const validMaxDays: CoreRuntime["validMaxDays"] = core.validMaxDays;
export const workspaceSummaries: CoreRuntime["workspaceSummaries"] = core.workspaceSummaries;
