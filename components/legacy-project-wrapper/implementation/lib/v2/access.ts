import { config } from "../config";
import { requireCaptcha } from "./captcha";
import { get, run, tx } from "./db";
import { refuseDisposable } from "./disposable";
import { event } from "./events";
import { V2Error, badRequest } from "./errors";
import { newId, nowIso } from "./ids";
import { accessEmailKey, durableCount, durableRoom } from "./limits";
import { oneOf, optOneOf, optStr, str, type Body } from "./validate";
import { create_access } from "../native/.bindings/server_workspace_admission.js";

interface AccessRuntime {
  TEAM_SIZES: readonly ["1", "2-10", "11-50", "51-200", "201+"];
  INTERESTS: readonly ["try", "evaluate"];
  VIAS: readonly ["form", "value_card"];
  createAccessRequest(req: Request, client: string, b: Body): Promise<{ received: boolean }>;
}

const access = create_access({
  config, requireCaptcha, get, run, tx, refuseDisposable, event,
  V2Error, badRequest, newId, nowIso, accessEmailKey, durableCount,
  durableRoom, oneOf, optOneOf, optStr, str,
}) as unknown as AccessRuntime;

export const TEAM_SIZES = access.TEAM_SIZES;
export const INTERESTS = access.INTERESTS;
export const VIAS = access.VIAS;
export const createAccessRequest = access.createAccessRequest;
