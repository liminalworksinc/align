'use strict';

function create_metrics(resources) {
  const ESTIMATES = resources.ESTIMATES;
  const NOTE_REF_RE = resources.NOTE_REF_RE;
  const recordEvent = resources.recordEvent;
  const readDate = resources.readDate;
  const DAY = 86400000;
  const WEEK = 7 * DAY;
  const LOI_EVENTS = ['loi_sent', 'loi_signed'];
  const FUNNEL = [
    {step:'workspace created',events:['workspace_created']},
    {step:'device paired',events:['device_paired']},
    {step:'first session captured',events:['first_session_captured']},
    {step:'first session bound to a goal',events:['first_session_bound']},
    {step:'second member joined',events:['second_member_joined']},
    {step:'first change request',events:['first_change_request']},
    {step:'first approval or directive',events:['first_approval','first_directive']},
    {step:'first MCP read',events:['first_mcp_read']}
  ];
  const WAW_WEEKS = 8;
  function weekStart(t) {
    const d = new (readDate())(t);
    const offset = (d.getUTCDay() + 6) % 7;
    return readDate().UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - offset * DAY;
  }
  function percentile(values, p) {
    if (!values.length) return null;
    const sorted = [...values].sort((a,b) => a-b);
    return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  }
  function recordLoi(db, name, wsId, options, now = readDate().now()) {
    if (name === 'loi_signed' && !options.verifiedOriginal) return {ok:false,reason:'verified_original_required'};
    if (options.noteRef != null && !NOTE_REF_RE.test(options.noteRef)) return {ok:false,reason:'bad_note_ref'};
    if (!db.get('SELECT 1 AS x FROM v2_workspaces WHERE id = ?', wsId)) return {ok:false,reason:'no_workspace'};
    const existing = db.get('SELECT at FROM v2_events WHERE name = ? AND ws_id = ?', name, wsId);
    if (existing) return {ok:false,reason:'already_recorded',at:existing.at};
    const at = new (readDate())(now).toISOString();
    const props = {};
    if (options.noteRef) props.note_ref = options.noteRef;
    if (name === 'loi_signed') props.verified_original = 'yes';
    recordEvent(db, name, {ws:wsId,props,at});
    return {ok:true,at};
  }
  const share = (n,d) => d > 0 ? Math.round(n/d*10000)/10000 : null;
  const day = t => new (readDate())(t).toISOString().slice(0,10);
  function buildReport(db, {since = null, now = new (readDate())()} = {}) {
    const lower = since ?? '';
    const nowMs = now.getTime();
    const samples = new Set(db.all("SELECT ws_id FROM v2_events WHERE name = 'workspace_created' AND json_extract(props, '$.kind') = 'sample'").map(r => r.ws_id));
    const first = new Map();
    for (const row of db.all('SELECT ws_id, name, MIN(at) AS at FROM v2_events WHERE ws_id IS NOT NULL GROUP BY ws_id, name')) {
      if (!first.has(row.ws_id)) first.set(row.ws_id, new Map());
      first.get(row.ws_id).set(row.name, row.at);
    }
    function count(name, predicate = '', ...values) {
      return db.get(`SELECT COUNT(*) AS n FROM v2_events WHERE name = ? AND at >= ? ${predicate}`, name, lower, ...values)?.n ?? 0;
    }
    const access = {
      requested:count('access_requested'),
      requested_try:count('access_requested', "AND json_extract(props, '$.interest') = ?", 'try'),
      requested_evaluate:count('access_requested', "AND json_extract(props, '$.interest') = ?", 'evaluate'),
      approved:count('access_approved'),
      declined:count('access_declined'),
      codes_created:count('code_created'),
      codes_from_requests:count('code_created', "AND json_extract(props, '$.source') = ?", 'request'),
      codes_redeemed:count('code_redeemed')
    };
    const cohort = db.all("SELECT ws_id, at FROM v2_events WHERE name = 'workspace_created' AND ws_id IS NOT NULL AND at >= ? ORDER BY at", lower).filter(r => !samples.has(r.ws_id));
    const funnel = [];
    for (const stage of FUNNEL) {
      const n = cohort.filter(row => {
        const id = row.ws_id;
        return stage.events.some(name => first.get(id)?.has(name));
      }).length;
      funnel.push({step:stage.step,workspaces:n,of_previous:funnel.length ? share(n,funnel[funnel.length-1].workspaces) : null,of_created:funnel.length ? share(n,cohort.length) : null});
    }
    const current = weekStart(nowMs);
    const cohortStart = since ? weekStart(readDate().parse(`${since}T00:00:00Z`)) : current - 11*WEEK;
    const activityLower = new (readDate())(Math.min(cohortStart,current-8*WEEK)).toISOString();
    const activity = new Map();
    for (const row of db.all('SELECT DISTINCT ws_id, substr(at, 1, 10) AS day FROM (\n       SELECT ws_id, created_at AS at FROM v2_sessions\n       UNION ALL SELECT ws_id, created_at FROM v2_epochs\n       UNION ALL SELECT ws_id, received_at FROM v2_usage\n       UNION ALL SELECT ws_id, at FROM v2_audit WHERE ws_id IS NOT NULL AND actor_id IS NOT NULL\n     ) WHERE at >= ?', activityLower)) {
      if (samples.has(row.ws_id)) continue;
      const w = weekStart(readDate().parse(`${row.day}T00:00:00Z`));
      if (!activity.has(w)) activity.set(w,new Set());
      activity.get(w).add(row.ws_id);
    }
    const weekly_active_workspaces = [];
    for (let i = WAW_WEEKS-1; i >= 0; i--) {
      const w = current-i*WEEK;
      const n = activity.get(w)?.size ?? 0;
      const previous = activity.get(w-WEEK)?.size ?? 0;
      weekly_active_workspaces.push({week:day(w),active:n,growth:previous > 0 ? Math.round((n-previous)/previous*10000)/10000 : null,complete:w+WEEK <= nowMs});
    }
    const cohorts = new Map();
    for (const row of cohort) {
      const w = weekStart(readDate().parse(row.at));
      if (w < cohortStart) continue;
      if (!cohorts.has(w)) cohorts.set(w,[]);
      cohorts.get(w).push(row.ws_id);
    }
    const retention = [...cohorts.keys()].sort((a,b)=>a-b).map(w => {
      const ids = cohorts.get(w);
      const retained = k => w+(k+1)*WEEK <= nowMs ? ids.filter(id => activity.get(w+k*WEEK)?.has(id)).length : null;
      const week1 = retained(1);
      const week4 = retained(4);
      return {cohort:day(w),workspaces:ids.length,week1,week1_share:week1 === null ? null : share(week1,ids.length),week4,week4_share:week4 === null ? null : share(week4,ids.length)};
    });
    const sessions = db.get('SELECT COUNT(*) AS n, SUM(EXISTS (SELECT 1 FROM v2_epochs e WHERE e.ws_id = s.ws_id AND e.session_key = s.session_key AND e.goal_id IS NOT NULL)) AS bound\n     FROM v2_sessions s WHERE s.created_at >= ?', lower);
    const live = db.get('SELECT COUNT(*) AS requests, SUM(e.goal_id IS NOT NULL) AS bound_requests, SUM(u.est_list_usd_micros) AS usd,\n            SUM(CASE WHEN e.goal_id IS NOT NULL THEN u.est_list_usd_micros END) AS bound_usd\n     FROM v2_usage u LEFT JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id\n     WHERE u.ts >= ?', lower);
    const rolled = db.get("SELECT SUM(requests) AS requests, SUM(CASE WHEN goal_id <> '' THEN requests END) AS bound_requests,\n            SUM(est_list_usd_micros) AS usd, SUM(CASE WHEN goal_id <> '' THEN est_list_usd_micros END) AS bound_usd\n     FROM v2_spend_rollups WHERE day >= ?", lower);
    const requests = (live?.requests ?? 0)+(rolled?.requests ?? 0);
    const boundRequests = (live?.bound_requests ?? 0)+(rolled?.bound_requests ?? 0);
    const usd = (live?.usd ?? 0)+(rolled?.usd ?? 0);
    const boundUsd = (live?.bound_usd ?? 0)+(rolled?.bound_usd ?? 0);
    const letters = new Map();
    for (const row of db.all("SELECT ws_id, name, at FROM v2_events WHERE name IN ('loi_sent', 'loi_signed') AND at >= ? ORDER BY at", lower)) {
      const l = letters.get(row.ws_id) ?? {ws_id:row.ws_id,sent_at:null,signed_at:null};
      if (row.name === 'loi_sent') l.sent_at = row.at;
      else l.signed_at = row.at;
      letters.set(row.ws_id,l);
    }
    const sampleIds = [...samples];
    const exclude = sampleIds.length ? `AND ws_id NOT IN (${sampleIds.map(()=>'?').join(',')})` : '';
    function wsEvents(name, predicate = '', ...values) {
      return db.all(`SELECT ws_id FROM v2_events WHERE name = ? AND at >= ? AND ws_id IS NOT NULL ${exclude} ${predicate}`, name, lower, ...sampleIds, ...values);
    }
    const viewed = wsEvents('value_card_viewed');
    const byEstimate = Object.fromEntries(ESTIMATES.map(e => [e,wsEvents('value_reported',"AND json_extract(props, '$.estimate') = ?",e).length]));
    const approved = db.get(`SELECT COUNT(DISTINCT ws_id) AS n FROM v2_change_requests WHERE state = 'approved' AND decided_at >= ? ${exclude}`, lower,...sampleIds)?.n ?? 0;
    const value = {
      workspaces_with_approved_request:approved,
      viewed:{people:viewed.length,workspaces:new Set(viewed.map(r=>r.ws_id)).size},
      reported:{people:Object.values(byEstimate).reduce((a,b)=>a+b,0),by_estimate:byEstimate},
      follow_up_clicked:wsEvents('follow_up_clicked').length,
      access_from_value_card:{
        try:count('access_requested',"AND json_extract(props, '$.via') = ? AND json_extract(props, '$.interest') = ?",'value_card','try'),
        evaluate:count('access_requested',"AND json_extract(props, '$.via') = ? AND json_extract(props, '$.interest') = ?",'value_card','evaluate')
      },
      first_ask:wsEvents('first_ask').length,
      first_limit:wsEvents('first_limit').length
    };
    function timing(event) {
      const minutes = [];
      for (const row of cohort) {
        const start = first.get(row.ws_id)?.get(event);
        const bound = first.get(row.ws_id)?.get('first_session_bound');
        if (start && bound) minutes.push(Math.max(0,(readDate().parse(bound)-readDate().parse(start))/60000));
      }
      const p50 = percentile(minutes,0.5);
      const p75 = percentile(minutes,0.75);
      return {workspaces:minutes.length,median_minutes:p50 === null ? null : Math.round(p50*10)/10,p75_minutes:p75 === null ? null : Math.round(p75*10)/10};
    }
    return {
      generated_at:now.toISOString(),since,access,funnel,
      other:{sample_workspaces_created:count('workspace_created',"AND json_extract(props, '$.kind') = ?",'sample'),invites_sent:count('invite_sent'),invites_accepted:count('invite_accepted'),people_with_a_first_session:count('member_first_session_captured')},
      time_to_first_value:{from_workspace_created:timing('workspace_created'),from_code_redeemed:timing('code_redeemed')},
      weekly_active_workspaces,retention,
      goal_binding:{sessions:sessions?.n ?? 0,bound_sessions:sessions?.bound ?? 0,sessions_share:share(sessions?.bound ?? 0,sessions?.n ?? 0),requests,bound_requests:boundRequests,requests_share:share(boundRequests,requests),est_list_usd_micros:usd,bound_est_list_usd_micros:boundUsd,spend_share:share(boundUsd,usd)},
      lois:{sent:count('loi_sent'),signed:count('loi_signed'),workspaces:[...letters.values()]},value
    };
  }
  function formatReport(r) {
    const a = r.access;
    const g = r.goal_binding;
    const t = r.time_to_first_value;
    const pct = x => x === null ? '-' : `${Math.round(x*1000)/10}%`;
    const dur = x => x === null ? '-' : x < 60 ? `${Math.round(x)}m` : x < 2880 ? `${Math.floor(x/60)}h ${Math.round(x%60)}m` : `${Math.floor(x/1440)}d ${Math.round((x%1440)/60)}h`;
    const dollars = x => `$${(x/1000000).toFixed(2)}`;
    function table(head, rows) {
      const widths = head.map((h,i)=>Math.max(h.length,...rows.map(row=>String(row[i]).length)));
      return [head.map((h,i)=>h.padEnd(widths[i])).join('  ').trimEnd(),...rows.map(row=>row.map((cell,i)=>String(cell).padEnd(widths[i])).join('  ').trimEnd())].join('\n');
    }
    return [
      `Align report, ${r.generated_at}${r.since ? `, since ${r.since}` : ''} (weeks start Monday 00:00 UTC; sample workspaces left out)`,
      '', 'Access',
      table(['step','count','detail'],[
        ['requested',a.requested,`${a.requested_try} try, ${a.requested_evaluate} evaluate`],
        ['approved',a.approved,pct(share(a.approved,a.requested))],
        ['declined',a.declined,pct(share(a.declined,a.requested))],
        ['codes created',a.codes_created,`${a.codes_from_requests} from requests`],
        ['codes redeemed',a.codes_redeemed,pct(share(a.codes_redeemed,a.codes_created))]
      ]),
      '', 'Workspace funnel (workspaces created in the period that reached each step)',
      table(['step','workspaces','of previous','of created'],r.funnel.map(f=>[f.step,f.workspaces,pct(f.of_previous),pct(f.of_created)])),
      '', 'Time to first value (to the first session bound to a goal)',
      table(['from','workspaces','median','p75'],[
        ['from workspace created',t.from_workspace_created.workspaces,dur(t.from_workspace_created.median_minutes),dur(t.from_workspace_created.p75_minutes)],
        ['from code redeemed',t.from_code_redeemed.workspaces,dur(t.from_code_redeemed.median_minutes),dur(t.from_code_redeemed.p75_minutes)]
      ]),
      '', "Weekly active workspaces (a shared session, epoch or usage upload, or a member's audited action, that week)",
      table(['week','active','week on week'],r.weekly_active_workspaces.map(w=>[w.complete ? w.week : `${w.week} (so far)`,w.active,w.growth === null ? '-' : `${w.growth >= 0 ? '+' : ''}${pct(w.growth)}`])),
      '', 'Retention by creation week (active in week 1 and week 4 after it; - until that week ends)',
      r.retention.length ? table(['cohort','workspaces','week 1','week 4'],r.retention.map(c=>[c.cohort,c.workspaces,c.week1 === null ? '-' : `${c.week1} (${pct(c.week1_share)})`,c.week4 === null ? '-' : `${c.week4} (${pct(c.week4_share)})`])) : '(none)',
      '', 'Bound to goals (sessions shared, and usage, in the period)',
      table(['','bound','total','share'],[
        ['sessions',g.bound_sessions,g.sessions,pct(g.sessions_share)],
        ['requests',g.bound_requests,g.requests,pct(g.requests_share)],
        ['estimated spend',dollars(g.bound_est_list_usd_micros),dollars(g.est_list_usd_micros),pct(g.spend_share)]
      ]),
      '', 'Other',
      table(['','count'],[
        ['sample workspaces created',r.other.sample_workspaces_created],
        ['invites sent',r.other.invites_sent],
        ['invites accepted',r.other.invites_accepted],
        ['people with a first shared session in a workspace',r.other.people_with_a_first_session]
      ]),
      '', 'Decision value (approved change requests and their value card; one per person per workspace)',
      table(['','count','detail'],[
        ['workspaces with an approved request',r.value.workspaces_with_approved_request,''],
        ['value card viewed',r.value.viewed.people,r.value.viewed.workspaces === 1 ? '1 workspace' : `${r.value.viewed.workspaces} workspaces`],
        ['value reported',r.value.reported.people,ESTIMATES.map(e=>`${r.value.reported.by_estimate[e]} ${e}`).join(', ')],
        ['follow-up clicked',r.value.follow_up_clicked,''],
        ['access requested from the card',r.value.access_from_value_card.try+r.value.access_from_value_card.evaluate,`${r.value.access_from_value_card.try} try, ${r.value.access_from_value_card.evaluate} evaluate`],
        ['workspaces with a first ask',r.value.first_ask,''],
        ['workspaces with a first limit',r.value.first_limit,'']
      ]),
      '', `LOIs (operator-recorded): ${r.lois.sent} sent, ${r.lois.signed} signed (verified originals only)`,
      ...(r.lois.workspaces.length ? [table(['workspace','sent','signed'],r.lois.workspaces.map(l=>[l.ws_id,l.sent_at ? l.sent_at.slice(0,10) : '-',l.signed_at ? l.signed_at.slice(0,10) : '-']))] : [])
    ].join('\n');
  }
  return {weekStart,percentile,LOI_EVENTS,recordLoi,FUNNEL,WAW_WEEKS,buildReport,formatReport};
}
module.exports = {create_metrics};
