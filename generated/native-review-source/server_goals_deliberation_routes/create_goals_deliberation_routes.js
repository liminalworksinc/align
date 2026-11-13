'use strict';

function create_goals_deliberation_routes(resources) {
  const { Response, URL } = resources;
  const { eitherAuth, eitherWrite, idParam, readJson, route, webAuth, webWrite } = resources.http;
  const { enter } = resources.workspaces;
  const { ID_RE, str } = resources.validate;
  const { goalsFeed, createGoal, goalDetail, confirmParent, newGoalVersion } = resources.goals;
  const { dependencyChoices, dependencyLoops, counterBase, versionLoops,
    changeRequestGroups, listChangeRequests, createChangeRequest, getChangeRequest,
    assertChangeRequestAction, actOnChangeRequest, addEvidence, removeEvidence } = resources.changes;
  const { listAlignments, createAlignment, getAlignment, assertAction, actOnAlignment } = resources.alignments;
  const { listReallocations, createReallocation, getReallocation,
    assertReallocationAction, actOnReallocation } = resources.reallocations;
  const { valueView, recordValue } = resources.value;
  const { suggestLimits } = resources.limitSuggest;
  const routes = {};
  const base = 'workspaces/[ws]/';
  function register(path, method, handler) {
    const key = base + path;
    if (!routes[key]) routes[key] = {};
    routes[key][method] = route(handler);
  }
  const workspace = (principal, params) => enter(principal, idParam(params.ws, ID_RE));
  const id = value => idParam(value, ID_RE);
  register('goals', 'GET', async (req, params) => {
    const principal = await eitherAuth(req);
    const policy = workspace(principal, params);
    const feed = goalsFeed(policy);
    const etag = `"${feed.version}"`;
    const headers = { 'etag': etag, 'cache-control': 'private, no-cache' };
    const candidates = (req.headers.get('if-none-match') || '').split(',').map(part => part.trim().replace(/^W\//, ''));
    if (candidates.includes(etag) || candidates.includes('*')) return new Response(null, { status: 304, headers });
    return Response.json(feed, { headers });
  });
  register('goals', 'POST', async (req, params) => {
    const principal = await webWrite(req);
    const policy = workspace(principal, params);
    const body = await readJson(req, 32768);
    return Response.json(await createGoal(policy, body), { status: 201 });
  });
  register('goals/[goal]', 'GET', async (req, params) => {
    const principal = await webAuth(req);
    const policy = workspace(principal, params);
    const goal = id(params.goal);
    const raw = new URL(req.url).searchParams.get('counter');
    const counter = raw ? id(raw) : undefined;
    const detail = goalDetail(policy, goal);
    return Response.json({ ...detail,
      dependency_choices: dependencyChoices(policy, goal, counter),
      dependency_loops: dependencyLoops(policy, goal, counter),
      counter_base: counterBase(policy, goal, counter),
      version_loops: versionLoops(policy, goal, detail.can_edit) });
  });
  register('goals/[goal]/review', 'POST', async (req, params) => {
    const principal = await webWrite(req);
    const policy = workspace(principal, params);
    const body = await readJson(req, 4096);
    const goal = id(params.goal);
    const parent = id(str(body, 'parent_id', 80));
    return Response.json(await confirmParent(policy, goal, parent));
  });
  register('goals/[goal]/versions', 'POST', async (req, params) => {
    const principal = await webWrite(req);
    const policy = workspace(principal, params);
    const goal = id(params.goal);
    const body = await readJson(req, 32768);
    return Response.json(await newGoalVersion(policy, goal, body), { status: 201 });
  });
  register('limits/suggest', 'POST', async (req, params) => {
    const principal = await webWrite(req);
    const policy = workspace(principal, params);
    const body = await readJson(req, 32768);
    return Response.json(await suggestLimits(policy, body));
  });
  register('change-requests', 'GET', async (req, params) => {
    const principal = await webAuth(req);
    const policy = workspace(principal, params);
    return Response.json(changeRequestGroups(policy, new URL(req.url).searchParams.get('state')));
  });
  const changesPath = 'goals/[goal]/change-requests';
  register(changesPath, 'GET', async (req, params) => {
    const principal = await webAuth(req);
    const policy = workspace(principal, params);
    const goalId = id(params.goal);
    const state = new URL(req.url).searchParams.get('state');
    return Response.json({ change_requests: listChangeRequests(policy, { goalId, state }) });
  });
  register(changesPath, 'POST', async (req, params) => {
    const principal = await webWrite(req);
    const policy = workspace(principal, params);
    const goal = id(params.goal);
    const body = await readJson(req, 32768);
    return Response.json(await createChangeRequest(policy, goal, body), { status: 201 });
  });
  register(changesPath + '/[id]', 'GET', async (req, params) => {
    const principal = await webAuth(req);
    const policy = workspace(principal, params);
    const requestId = id(params.id);
    const goal = id(params.goal);
    return Response.json(getChangeRequest(policy, requestId, goal));
  });
  register(changesPath + '/[id]/[action]', 'POST', async (req, params) => {
    const principal = await webWrite(req);
    const policy = workspace(principal, params);
    assertChangeRequestAction(params.action);
    const action = params.action;
    const goal = id(params.goal);
    const requestId = id(params.id);
    const body = await readJson(req, 32768);
    return Response.json(await actOnChangeRequest(policy, goal, requestId, action, body));
  });
  register(changesPath + '/[id]/evidence', 'POST', async (req, params) => {
    const principal = await eitherWrite(req);
    const policy = workspace(principal, params);
    const body = await readJson(req, 8192);
    const goal = id(params.goal);
    const requestId = id(params.id);
    return Response.json(await addEvidence(policy, goal, requestId, body, principal.kind === 'web' ? 'person' : 'agent'), { status: 201 });
  });
  register(changesPath + '/[id]/evidence/[evidence]', 'DELETE', async (req, params) => {
    const principal = await eitherWrite(req);
    const policy = workspace(principal, params);
    const goal = id(params.goal);
    const requestId = id(params.id);
    const evidence = id(params.evidence);
    return Response.json(await removeEvidence(policy, goal, requestId, evidence));
  });
  register(changesPath + '/[id]/value', 'GET', async (req, params) => {
    const principal = await webAuth(req);
    const policy = workspace(principal, params);
    const goal = id(params.goal);
    const requestId = id(params.id);
    return Response.json(valueView(policy, goal, requestId), { headers: { 'cache-control': 'no-store' } });
  });
  register(changesPath + '/[id]/value', 'POST', async (req, params) => {
    const principal = await webWrite(req);
    const policy = workspace(principal, params);
    const goal = id(params.goal);
    const requestId = id(params.id);
    const body = await readJson(req, 4096);
    return Response.json(await recordValue(policy, goal, requestId, body));
  });
  function collection(path, list, create, get, assert, act) {
    register(path, 'GET', async (req, params) => {
      const principal = await webAuth(req);
      const policy = workspace(principal, params);
      return Response.json(list(policy));
    });
    register(path, 'POST', async (req, params) => {
      const principal = await webWrite(req);
      const policy = workspace(principal, params);
      const body = await readJson(req, 16384);
      return Response.json(await create(policy, body), { status: 201 });
    });
    register(path + '/[id]', 'GET', async (req, params) => {
      const principal = await webAuth(req);
      const policy = workspace(principal, params);
      return Response.json(get(policy, id(params.id)));
    });
    register(path + '/[id]/[action]', 'POST', async (req, params) => {
      const principal = await webWrite(req);
      const policy = workspace(principal, params);
      const item = id(params.id);
      assert(params.action);
      const action = params.action;
      const body = await readJson(req, 16384);
      return Response.json(await act(policy, item, action, body));
    });
  }
  collection('alignments', listAlignments, createAlignment, getAlignment, assertAction, actOnAlignment);
  collection('reallocations', listReallocations, createReallocation, getReallocation, assertReallocationAction, actOnReallocation);
  return routes;
}

module.exports = { create_goals_deliberation_routes };
