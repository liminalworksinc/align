'use strict';
const asset = require('./sample-text.json');
const SAMPLE_NAME = asset.workspace_name;
const SAMPLE_REASON = asset.change_request_reason;
const SAMPLE_LIMIT_TEXT = asset.limit_text;
function create_sample(resources) {
  const audit = resources.audit;
  const run = resources.run;
  const newId = resources.newId;
  const insertAlignment = resources.insertAlignment;
  const insertChangeRequest = resources.insertChangeRequest;
  const goalRow = resources.goalRow;
  const insertGoal = resources.insertGoal;
  const newLimitId = resources.newLimitId;
  const createWorkspace = resources.createWorkspace;
  const readDate = resources.readDate;
  const anchors = { repos: [], branch_patterns: [], issues: [] };
  function measure(value) {
    return { id: newId('m'), text: value.text, target: value.target };
  }
  function timestamp(at, offset) {
    return new (readDate())(readDate().parse(at) + offset).toISOString();
  }
  async function createSampleWorkspace(req, principal, code) {
    const userId = principal.user.id;
    return createWorkspace(req, principal, SAMPLE_NAME, code, function seed(wsId, at) {
      const pods = new Map();
      const seedPrincipal = { userId, wsId, wsRole: 'owner', pods };
      function team(name) {
        const id = newId('pod');
        run('INSERT INTO v2_pods (id, ws_id, name, created_at) VALUES (?, ?, ?, ?)', id, wsId, name, at);
        audit(wsId, userId, 'team.created', id, at);
        run("INSERT INTO v2_pod_members (ws_id, pod_id, user_id, role, created_at) VALUES (?, ?, ?, 'lead', ?)", wsId, id, userId, at);
        audit(wsId, userId, 'team.member_set', id, at);
        pods.set(id, 'lead');
        return id;
      }
      const product = team(asset.team_names[0]);
      const security = team(asset.team_names[1]);
      const company = insertGoal(seedPrincipal, {
        title: asset.goals[0].title, level: 'company', podId: null,
        visibility: 'workspace', measures: asset.goals[0].measures.map(measure),
        anchors, dependsOn: []
      }, timestamp(at, 0));
      const review = insertGoal(seedPrincipal, {
        title: asset.goals[1].title, level: 'team', podId: security,
        visibility: 'workspace', measures: asset.goals[1].measures.map(measure),
        anchors, dependsOn: [],
        limits: [{ id: newLimitId(), type: 'must_not', text: SAMPLE_LIMIT_TEXT,
          source: { kind: 'meeting', title: asset.limit_source_title, date: at.slice(0, 10) } }]
      }, timestamp(at, 2));
      const onboarding = insertGoal(seedPrincipal, {
        title: asset.goals[2].title, level: 'team', podId: product,
        visibility: 'workspace', measures: asset.goals[2].measures.map(measure),
        anchors, dependsOn: [review]
      }, timestamp(at, 1));
      const companyRow = goalRow(wsId, company);
      insertAlignment(seedPrincipal, companyRow, goalRow(wsId, onboarding), 'contribution', [], null, at);
      insertAlignment(seedPrincipal, companyRow, goalRow(wsId, review), 'contribution', [], null, at);
      const reviewRow = goalRow(wsId, review);
      const measures = [...JSON.parse(reviewRow.measures_json), measure(asset.pending_measure)];
      insertChangeRequest(seedPrincipal, reviewRow, { measures }, SAMPLE_REASON, at);
    });
  }
  return { SAMPLE_NAME, SAMPLE_REASON, SAMPLE_LIMIT_TEXT, createSampleWorkspace };
}
module.exports = { create_sample };
