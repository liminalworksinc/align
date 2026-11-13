import { config, hostAllowed } from "./config";
import { HttpError } from "./errors";
import * as native from "./native/.bindings/server_request_effects.js";

interface LegacyHttpTools {
  handle(fn: () => Promise<unknown>): Promise<Response>;
  requireJson(req: Request): void;
  cappedJson<T = Record<string, unknown>>(req: Request, max?: number, tooLarge?: string): Promise<T>;
}

const tools = native.create_legacy({ config, hostAllowed, HttpError, console }) as LegacyHttpTools;

export const handle = tools.handle;
export const requireJson = tools.requireJson;
export const cappedJson = tools.cappedJson;
