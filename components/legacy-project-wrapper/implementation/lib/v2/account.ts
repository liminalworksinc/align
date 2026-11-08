import { revokeGrantsOfPerson } from "../oauth/grants";
import { softDeleteWorkspace } from "./core.mts";
import { all, audit, get, LIVE_WS, run, sql, tx } from "./db";
import { revokeDevicesOf } from "./devices";
import { actorOf } from "./events";
import { badRequest, conflict, notFound } from "./errors";
import { nowIso } from "./ids";
import { onMemberRemoved } from "./lifecycle";
import { accessEmailKey, otpEmailKey } from "./limits";
import { noteDeparture, pseudonymise, workspacesNaming } from "./retention";
import type { WebPrincipal } from "./http";
import { create_account } from "../native/.bindings/server_account_lifecycle.js";

export interface PasskeyRow {
  id: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}

interface AccountRuntime {
  listPasskeys: (userId: string) => PasskeyRow[];
  passkeyPromptDue: (userId: string) => boolean;
  dismissPasskeyPrompt: (userId: string) => Promise<void>;
  renamePasskey: (userId: string, id: string, name: string) => Promise<{ id: string; name: string }>;
  deletePasskey: (userId: string, id: string) => Promise<void>;
  signOutEverywhere: (userId: string, also: { devices: boolean; apps: boolean }) => Promise<{ sessions: number; devices: number; apps: number }>;
  deleteAccount: (p: WebPrincipal, confirmEmail: string) => Promise<void>;
}

const account = create_account({
  all, get, run, tx, audit, LIVE_WS, sql,
  softDeleteWorkspace, revokeDevicesOf, revokeGrantsOfPerson, actorOf,
  badRequest, conflict, notFound, nowIso, onMemberRemoved,
  accessEmailKey, otpEmailKey, noteDeparture, pseudonymise, workspacesNaming,
}) as unknown as AccountRuntime;

export const listPasskeys = account.listPasskeys;
export const passkeyPromptDue = account.passkeyPromptDue;
export const dismissPasskeyPrompt = account.dismissPasskeyPrompt;
export const renamePasskey = account.renamePasskey;
export const deletePasskey = account.deletePasskey;
export const signOutEverywhere = account.signOutEverywhere;
export const deleteAccount = account.deleteAccount;
