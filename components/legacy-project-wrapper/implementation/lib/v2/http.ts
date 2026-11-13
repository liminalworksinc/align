import { connection } from "next/server";
import { config, hostAllowed } from "../config";
import { HttpError } from "../errors";
import * as native from "../native/.bindings/server_request_effects.js";
import { clientNet } from "../ratelimit";
import { getAuth, isRecentSignIn as recentSignIn, reauthMessage } from "./auth";
import { publicOrigin } from "./config";
import { deviceFromAccessToken, userById, type DevicePrincipal, type UserRef } from "./devices";
import { V2Error, badRequest } from "./errors";
import { ready } from "./init";
import type { Body } from "./validate";

export interface WebPrincipal {
  kind: "web";
  user: UserRef;
  emailVerified: boolean;
  /** When the Better Auth session was created. */
  signedInAt: Date;
}
export type Principal = DevicePrincipal | WebPrincipal;

type Params = Record<string, string>;
type Handler<P extends Params> = (req: Request, params: P) => Promise<unknown>;

interface V2HttpTools {
  route<P extends Params = Params>(fn: Handler<P>): (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;
  noContent(): Response;
  rejectBrowser(req: Request): void;
  deviceAuth(req: Request): DevicePrincipal;
  webAuth(req: Request): Promise<WebPrincipal>;
  isRecentSignIn: typeof recentSignIn;
  requireRecentSignIn(p: WebPrincipal, what?: string): void;
  eitherAuth(req: Request): Promise<Principal>;
  requireSameSite(req: Request): void;
  webWrite(req: Request): Promise<WebPrincipal>;
  eitherWrite(req: Request): Promise<Principal>;
  idParam(v: string | undefined, re: RegExp): string;
  readJson(req: Request, max?: number): Promise<Body>;
  originOf(req: Request): string;
  clientKey(req: Request): string;
}

const tools = native.create_v2({
  connection, config, hostAllowed, HttpError, clientNet, getAuth,
  isRecentSignIn: recentSignIn, reauthMessage, publicOrigin,
  deviceFromAccessToken, userById, V2Error, badRequest, ready, console,
}) as V2HttpTools;

export const route = tools.route;
export const noContent = tools.noContent;
export const rejectBrowser = tools.rejectBrowser;
export const deviceAuth = tools.deviceAuth;
export const webAuth = tools.webAuth;
export const isRecentSignIn = tools.isRecentSignIn;
export const requireRecentSignIn = tools.requireRecentSignIn;
export const eitherAuth = tools.eitherAuth;
export const requireSameSite = tools.requireSameSite;
export const webWrite = tools.webWrite;
export const eitherWrite = tools.eitherWrite;
export const idParam = tools.idParam;
export const readJson = tools.readJson;
export const originOf = tools.originOf;
export const clientKey = tools.clientKey;
