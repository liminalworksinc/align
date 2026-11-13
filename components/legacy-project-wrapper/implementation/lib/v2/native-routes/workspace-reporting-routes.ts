// Caller-owned resource wiring; behavior is in the admitted package.
import type { Routes } from "./binding";
import { create_workspace_reporting_routes } from "../../native/.bindings/server_workspace_reporting_routes.js";
import { activityFor as activity_activityFor, ingestActivity as activity_ingestActivity } from "@/lib/v2/activity";
import { allocation as allocation_allocation, weeklyAllocation as allocation_weeklyAllocation } from "@/lib/v2/allocation";
import { badRequest as errors_badRequest } from "@/lib/v2/errors";
import { ACTIVITY_WINDOW_DAYS as goalActivity_ACTIVITY_WINDOW_DAYS, goalActivity as goalActivity_goalActivity } from "@/lib/v2/goal-activity";
import { workspaceHome as home_workspaceHome } from "@/lib/v2/home";
import { deviceAuth as http_deviceAuth, eitherAuth as http_eitherAuth, idParam as http_idParam, readJson as http_readJson, route as http_route, webAuth as http_webAuth } from "@/lib/v2/http";
import { spend as spend_spend } from "@/lib/v2/spend";
import { ingestSteering as steering_ingestSteering, steeringCounts as steering_steeringCounts } from "@/lib/v2/steering";
import { ID_RE as validate_ID_RE } from "@/lib/v2/validate";
import { enter as workspaces_enter } from "@/lib/v2/workspaces";
const resources = {
  Response,
  URL,
  Date,
  activity: { activityFor: activity_activityFor, ingestActivity: activity_ingestActivity },
  allocation: { allocation: allocation_allocation, weeklyAllocation: allocation_weeklyAllocation },
  errors: { badRequest: errors_badRequest },
  goalActivity: { ACTIVITY_WINDOW_DAYS: goalActivity_ACTIVITY_WINDOW_DAYS, goalActivity: goalActivity_goalActivity },
  home: { workspaceHome: home_workspaceHome },
  http: { deviceAuth: http_deviceAuth, eitherAuth: http_eitherAuth, idParam: http_idParam, readJson: http_readJson, route: http_route, webAuth: http_webAuth },
  spend: { spend: spend_spend },
  steering: { ingestSteering: steering_ingestSteering, steeringCounts: steering_steeringCounts },
  validate: { ID_RE: validate_ID_RE },
  workspaces: { enter: workspaces_enter },
};
export const routes = create_workspace_reporting_routes(resources) as unknown as Routes;
