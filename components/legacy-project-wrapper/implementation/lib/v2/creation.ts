import { config } from "../config";
import { secret } from "../secret";
import { requireCaptcha } from "./captcha";
import { caps, creationMode } from "./config";
import { isCreationCode, redeemCreationCode } from "./core.mts";
import { get, sql } from "./db";
import { refuseDisposable } from "./disposable";
import { V2Error, conflict, forbidden } from "./errors";
import { count } from "./plural.mts";
import { create_creation } from "../native/.bindings/server_workspace_admission.js";

export interface Creator {
  id: string;
  email: string;
  emailVerified: boolean;
}

interface CreationRuntime {
  needsCode(email: string): boolean;
  precheckCreation(req: Request, user: Creator, code: string | null): Promise<void>;
  admitCreation(user: Creator, code: string | null, wsId: string): boolean;
  checkRestoreCaps(userId: string): void;
  checkMemberCap(wsId: string, countInvites: boolean): void;
  sessionCapError(max: number): V2Error;
}

const creation = create_creation({
  config, secret, requireCaptcha, caps, creationMode, isCreationCode,
  redeemCreationCode, get, sql, refuseDisposable, V2Error, conflict,
  forbidden, count,
  readFirstOwnerEmail: () => process.env.ALIGN_FIRST_OWNER_EMAIL,
  memberCheckNow: () => new Date().toISOString(),
}) as unknown as CreationRuntime;

export const needsCode = creation.needsCode;
export const precheckCreation = creation.precheckCreation;
export const admitCreation = creation.admitCreation;
export const checkRestoreCaps = creation.checkRestoreCaps;
export const checkMemberCap = creation.checkMemberCap;
export const sessionCapError = creation.sessionCapError;
