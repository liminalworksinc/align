export interface PasskeyRow {
  id: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}
export interface WebPrincipal { user: { id: string; email: string; [key: string]: unknown }; [key: string]: unknown }
export interface AccountResources {
  all: (statement: string, ...params: any[]) => any[];
  get: (statement: string, ...params: any[]) => any;
  run: (statement: string, ...params: any[]) => number;
  tx: <T>(callback: () => T) => Promise<T>;
  audit: (workspace: string | null, actor: string | null, action: string, object: string | null, at: string) => void;
  LIVE_WS: (expression: string) => string;
  sql: unknown;
  softDeleteWorkspace: (sql: unknown, workspace: string, actor: string, at: string) => unknown;
  revokeDevicesOf: (user: string, reason: string, actor: string) => number;
  revokeGrantsOfPerson: (user: string, at: string) => number;
  actorOf: (user: string) => string;
  badRequest: (message: string) => unknown;
  conflict: (code: string, message: string) => unknown;
  notFound: () => unknown;
  nowIso: () => string;
  onMemberRemoved: (workspace: string, user: string) => void;
  accessEmailKey: (email: string) => string;
  otpEmailKey: (email: string) => string;
  noteDeparture: (workspace: string, user: string, at: string) => unknown;
  pseudonymise: (workspace: string, user: string, at: string) => unknown;
  workspacesNaming: (user: string) => Iterable<string>;
}
export function create_account(resources: AccountResources): {
  listPasskeys(userId: string): PasskeyRow[];
  passkeyPromptDue(userId: string): boolean;
  dismissPasskeyPrompt(userId: string): Promise<void>;
  renamePasskey(userId: string, id: string, name: string): Promise<{id: string; name: string}>;
  deletePasskey(userId: string, id: string): Promise<void>;
  signOutEverywhere(userId: string, also: {devices: boolean; apps: boolean}): Promise<{sessions: number; devices: number; apps: number}>;
  deleteAccount(principal: WebPrincipal, confirmEmail: string): Promise<void>;
};
