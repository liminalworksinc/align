// Caller-owned resource wiring; behavior is in the admitted package.
import type { Routes } from "./binding";
import { create_goals_deliberation_routes } from "../../native/.bindings/server_goals_deliberation_routes.js";
import { actOnAlignment as alignments_actOnAlignment, assertAction as alignments_assertAction, createAlignment as alignments_createAlignment, getAlignment as alignments_getAlignment, listAlignments as alignments_listAlignments } from "@/lib/v2/alignments";
import { actOnChangeRequest as changes_actOnChangeRequest, addEvidence as changes_addEvidence, assertChangeRequestAction as changes_assertChangeRequestAction, changeRequestGroups as changes_changeRequestGroups, counterBase as changes_counterBase, createChangeRequest as changes_createChangeRequest, dependencyChoices as changes_dependencyChoices, dependencyLoops as changes_dependencyLoops, getChangeRequest as changes_getChangeRequest, listChangeRequests as changes_listChangeRequests, removeEvidence as changes_removeEvidence, versionLoops as changes_versionLoops } from "@/lib/v2/changes";
import { confirmParent as goals_confirmParent, createGoal as goals_createGoal, goalDetail as goals_goalDetail, goalsFeed as goals_goalsFeed, newGoalVersion as goals_newGoalVersion } from "@/lib/v2/goals";
import { eitherAuth as http_eitherAuth, eitherWrite as http_eitherWrite, idParam as http_idParam, readJson as http_readJson, route as http_route, webAuth as http_webAuth, webWrite as http_webWrite } from "@/lib/v2/http";
import { suggestLimits as limitSuggest_suggestLimits } from "@/lib/v2/limit-suggest";
import { actOnReallocation as reallocations_actOnReallocation, assertReallocationAction as reallocations_assertReallocationAction, createReallocation as reallocations_createReallocation, getReallocation as reallocations_getReallocation, listReallocations as reallocations_listReallocations } from "@/lib/v2/reallocations";
import { ID_RE as validate_ID_RE, str as validate_str } from "@/lib/v2/validate";
import { recordValue as value_recordValue, valueView as value_valueView } from "@/lib/v2/value";
import { enter as workspaces_enter } from "@/lib/v2/workspaces";
const resources = {
  Response,
  URL,
  alignments: { actOnAlignment: alignments_actOnAlignment, assertAction: alignments_assertAction, createAlignment: alignments_createAlignment, getAlignment: alignments_getAlignment, listAlignments: alignments_listAlignments },
  changes: { actOnChangeRequest: changes_actOnChangeRequest, addEvidence: changes_addEvidence, assertChangeRequestAction: changes_assertChangeRequestAction, changeRequestGroups: changes_changeRequestGroups, counterBase: changes_counterBase, createChangeRequest: changes_createChangeRequest, dependencyChoices: changes_dependencyChoices, dependencyLoops: changes_dependencyLoops, getChangeRequest: changes_getChangeRequest, listChangeRequests: changes_listChangeRequests, removeEvidence: changes_removeEvidence, versionLoops: changes_versionLoops },
  goals: { confirmParent: goals_confirmParent, createGoal: goals_createGoal, goalDetail: goals_goalDetail, goalsFeed: goals_goalsFeed, newGoalVersion: goals_newGoalVersion },
  http: { eitherAuth: http_eitherAuth, eitherWrite: http_eitherWrite, idParam: http_idParam, readJson: http_readJson, route: http_route, webAuth: http_webAuth, webWrite: http_webWrite },
  limitSuggest: { suggestLimits: limitSuggest_suggestLimits },
  reallocations: { actOnReallocation: reallocations_actOnReallocation, assertReallocationAction: reallocations_assertReallocationAction, createReallocation: reallocations_createReallocation, getReallocation: reallocations_getReallocation, listReallocations: reallocations_listReallocations },
  validate: { ID_RE: validate_ID_RE, str: validate_str },
  value: { recordValue: value_recordValue, valueView: value_valueView },
  workspaces: { enter: workspaces_enter },
};
export const routes = create_goals_deliberation_routes(resources) as unknown as Routes;
