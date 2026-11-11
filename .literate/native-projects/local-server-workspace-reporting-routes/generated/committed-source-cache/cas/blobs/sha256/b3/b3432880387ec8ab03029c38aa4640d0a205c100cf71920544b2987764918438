'use strict';

function create_workspace_reporting_routes(resources) {
  const {activity, allocation, errors, goalActivity, home, http, spend, steering,
    validate, workspaces, Response, URL, Date} = resources;
  const {activityFor, ingestActivity} = activity;
  const {allocation: windowAllocation, weeklyAllocation} = allocation;
  const {badRequest} = errors;
  const {goalActivity: readGoalActivity} = goalActivity;
  const {workspaceHome} = home;
  const {deviceAuth, eitherAuth, idParam, readJson, route, webAuth} = http;
  const {spend: readSpend} = spend;
  const {ingestSteering, steeringCounts} = steering;
  const {enter} = workspaces;
  const {ID_RE} = validate;
  function admit(principal, params) {
    return enter(principal, idParam(params.ws, ID_RE));
  }
  function time(value, field) {
    if (!value) return null;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) throw badRequest(`${field} must be an ISO 8601 time`);
    return new Date(parsed).toISOString();
  }
  return {
    'workspaces/[ws]/activity': {
      GET: route((req, params) => {
        const principal = deviceAuth(req);
        const policy = admit(principal, params);
        const after = Number(new URL(req.url).searchParams.get('after') || 0);
        return activityFor(policy, Number.isSafeInteger(after) && after >= 0 ? after : 0);
      }),
      POST: route(async (req, params) => {
        const principal = deviceAuth(req);
        const policy = admit(principal, params);
        const body = await readJson(req, 128 * 1024);
        return ingestActivity(policy, principal, body);
      })
    },
    'workspaces/[ws]/allocation': {
      GET: route(async (req, params) => {
        const principal = await eitherAuth(req);
        const policy = admit(principal, params);
        const query = new URL(req.url).searchParams;
        const to = time(query.get('to'), 'to');
        let from = time(query.get('from'), 'from');
        if (from === null) from = new Date((to === null ? Date.now() : Date.parse(to)) - 7 * 24 * 60 * 60 * 1000).toISOString();
        const rawWeeks = query.get('weeks');
        const weeks = rawWeeks === null ? 6 : Number(rawWeeks);
        if (!Number.isInteger(weeks) || weeks < 1 || weeks > 26) throw badRequest('weeks must be 1 to 26');
        return {
          window: windowAllocation(policy, from, to),
          weekly: weeklyAllocation(policy, weeks),
          steering: steeringCounts(policy, from, to)
        };
      })
    },
    'workspaces/[ws]/goals/[goal]/activity': {
      GET: route(async (req, params) => {
        const window_days = goalActivity.ACTIVITY_WINDOW_DAYS;
        const principal = await webAuth(req);
        const policy = admit(principal, params);
        const goal = idParam(params.goal, ID_RE);
        return {window_days, ...readGoalActivity(policy, goal)};
      })
    },
    'workspaces/[ws]/home': {
      GET: route(async (req, params) => {
        const principal = await webAuth(req);
        const policy = admit(principal, params);
        return Response.json(workspaceHome(policy), {headers: {'cache-control': 'no-store'}});
      })
    },
    'workspaces/[ws]/spend': {
      GET: route(async (req, params) => {
        const principal = await webAuth(req);
        const policy = admit(principal, params);
        const query = new URL(req.url).searchParams;
        let by = query.get('by') || 'goal';
        if (by === 'pod') by = 'team';
        if (!['goal', 'team', 'session'].includes(by)) throw badRequest('by must be goal, team or session');
        const from = time(query.get('from'), 'from');
        const to = time(query.get('to'), 'to');
        return readSpend(policy, by, from, to);
      })
    },
    'workspaces/[ws]/steering': {
      POST: route(async (req, params) => {
        const principal = deviceAuth(req);
        const policy = admit(principal, params);
        const body = await readJson(req, 32 * 1024);
        return ingestSteering(policy, principal, body);
      })
    }
  };
}

module.exports = {create_workspace_reporting_routes};
