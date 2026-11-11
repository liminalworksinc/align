// Caller-owned resource wiring; behavior is in the admitted package.
import type { Routes } from "./binding";
import { create_team_asks_routes } from "../../native/.bindings/server_team_asks_routes.js";
import { actOnAsk as asks_actOnAsk, asksFeed as asks_asksFeed, assertAskAction as asks_assertAskAction, createAsk as asks_createAsk, getAsk as asks_getAsk, importAsks as asks_importAsks } from "@/lib/v2/asks";
import { eitherAuth as http_eitherAuth, idParam as http_idParam, readJson as http_readJson, route as http_route, webAuth as http_webAuth, webWrite as http_webWrite } from "@/lib/v2/http";
import { ID_RE as validate_ID_RE } from "@/lib/v2/validate";
import { enter as workspaces_enter } from "@/lib/v2/workspaces";
const resources = {
  Response,
  URL,
  asks: { actOnAsk: asks_actOnAsk, asksFeed: asks_asksFeed, assertAskAction: asks_assertAskAction, createAsk: asks_createAsk, getAsk: asks_getAsk, importAsks: asks_importAsks },
  http: { eitherAuth: http_eitherAuth, idParam: http_idParam, readJson: http_readJson, route: http_route, webAuth: http_webAuth, webWrite: http_webWrite },
  validate: { ID_RE: validate_ID_RE },
  workspaces: { enter: workspaces_enter },
};
export const routes = create_team_asks_routes(resources) as unknown as Routes;
