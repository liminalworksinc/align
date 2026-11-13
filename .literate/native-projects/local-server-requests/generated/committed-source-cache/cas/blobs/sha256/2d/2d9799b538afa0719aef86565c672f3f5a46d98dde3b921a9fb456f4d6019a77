'use strict';

function create_requests(resources) {
  const {approvalSet,all,audit,get,run,tx,goalTargets,writeDirective,V2Error,badRequest,
    conflict,forbidden,notFound,event,newId,nowIso,goalObj,goalRow,transferFor,
    visibleGoal,authorize,canReadGoal,optStr,oneOf,SESSION_KEY_RE,str,memberName,
    memberPrincipal,readDate} = resources;
  const REQUEST_TYPES = ['replan','checkpoint','switch_goal'];
  const REQUESTS_PER_HOUR = 20, SWITCH_SESSIONS_MAX = 20, NOTE_MAX = 280;
  const Q01 = 'SELECT * FROM v2_requests WHERE ws_id = ? AND id = ?';
  const Q02 = 'SELECT * FROM v2_goal_holds WHERE ws_id = ? AND goal_id = ?';
  const Q03 = 'SELECT user_id FROM v2_sessions WHERE ws_id = ? AND session_key = ?';
  const Q04 = "SELECT 1 AS x FROM v2_requests r WHERE r.ws_id = ? AND r.goal_id = ? AND r.type = ? AND r.cancelled_at IS NULL\n       AND EXISTS (SELECT 1 FROM v2_request_targets t WHERE t.request_id = r.id AND t.state IN ('sent','received'))";
  const Q05 = 'SELECT COUNT(*) AS n FROM v2_requests WHERE sender_id = ? AND created_at > ?';
  const Q06 = 'INSERT INTO v2_requests (id, ws_id, goal_id, type, target_goal_id, goal_version, note, sender_id, sender_role, directive_id, created_at)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  const Q07 = "INSERT INTO v2_request_targets (ws_id, request_id, session_key, state, updated_at) VALUES (?, ?, ?, 'sent', ?)";
  const Q08 = "SELECT t.session_key FROM v2_request_targets t WHERE t.request_id = ? AND t.state IN ('sent','received')";
  const Q09 = "UPDATE v2_request_targets SET state = 'expired', updated_at = ? WHERE request_id = ? AND state IN ('sent','received')";
  const Q10 = 'UPDATE v2_requests SET cancelled_at = ?, cancelled_by = ? WHERE id = ?';
  const Q11 = "SELECT r.id, r.goal_id FROM v2_requests r WHERE r.ws_id = ? AND (r.goal_id = ? OR r.target_goal_id = ?) AND r.cancelled_at IS NULL\n     AND EXISTS (SELECT 1 FROM v2_request_targets t WHERE t.request_id = r.id AND t.state IN ('sent','received')) ORDER BY r.created_at, r.id";
  const Q12 = 'SELECT t.session_key, t.state, t.ended_reason, s.state AS session_state, t.auto_accepted, t.updated_at, s.user_id, s.repo_alias, s.harness, s.title, s.started_at\n     FROM v2_request_targets t JOIN v2_sessions s ON s.ws_id = t.ws_id AND s.session_key = t.session_key\n     WHERE t.request_id = ? ORDER BY t.session_key';
  const Q13 = 'SELECT * FROM v2_requests WHERE ws_id = ? AND goal_id = ? ORDER BY created_at DESC, id LIMIT 50';
  const Q14 = 'SELECT user_id, repo_alias, harness, title, started_at FROM v2_sessions WHERE ws_id = ? AND session_key = ?';
  const Q15 = "UPDATE v2_request_targets SET state = 'expired', updated_at = ? WHERE ws_id = ? AND session_key = ? AND state IN ('sent','received')";
  const Q16 = 'SELECT state, auto_accepted FROM v2_request_targets WHERE request_id = ? AND session_key = ?';
  const Q17 = 'UPDATE v2_request_targets SET state = ?, auto_accepted = ?, updated_at = ? WHERE request_id = ? AND session_key = ?';
  const Q18 = 'INSERT INTO v2_goal_holds (ws_id, goal_id, held_by, reason, held_at, directive_id) VALUES (?, ?, ?, ?, ?, ?)';
  const Q19 = "SELECT DISTINCT t.session_key FROM v2_directives d JOIN v2_directive_targets t ON t.directive_id = d.id\n  WHERE d.ws_id = ? AND d.goal_id = ? AND d.kind = 'hold' AND json_extract(d.hold_json, '$.at') = ?";
  const Q20 = 'DELETE FROM v2_goal_holds WHERE ws_id = ? AND goal_id = ?';
  const Q21 = "SELECT 1 AS x FROM (SELECT DISTINCT t.session_key FROM v2_directives d JOIN v2_directive_targets t ON t.directive_id = d.id\n  WHERE d.ws_id = ? AND d.goal_id = ? AND d.kind = 'hold' AND json_extract(d.hold_json, '$.at') = ?) WHERE session_key = ?";
  const Q22 = 'SELECT * FROM v2_goal_holds WHERE ws_id = ? ORDER BY held_at';

  function holdRow(ws,goalId) { return get(Q02,ws,goalId); }
  function person(id) { return {id,name:memberName(id)}; }
  function sender(r) { return {...person(r.sender_id),role:r.sender_role}; }
  function canSend(pp,g) {
    if (pp.wsRole === 'owner') return true;
    return pp.wsRole === 'member' && approvalSet(g).includes(pp.userId);
  }
  function requireSender(pp,g,what) {
    if (pp.wsRole === 'viewer') throw forbidden('read_only','Viewers can look but not change anything.');
    if (!canSend(pp,g)) throw forbidden('not_approver',`Only someone who can approve for this goal, or a workspace owner, can ${what}.`);
  }
  function goalRef(pp,ws,goalId) {
    const g = goalRow(ws,goalId);
    if (!g || !canReadGoal(pp,goalObj(g))) return {id:null,title:null,version:null,private:true};
    return {id:g.id,title:g.title,version:g.version};
  }
  function selectedKeys(b) {
    const keys = b.session_keys;
    if (keys === undefined || keys === null) return null;
    if (!Array.isArray(keys)) throw badRequest('session_keys must be a list');
    if (keys.length < 1 || keys.length > SWITCH_SESSIONS_MAX) throw badRequest('session_keys: 1 to 20');
    const out = [];
    for (const key of keys) {
      if (typeof key !== 'string' || !SESSION_KEY_RE.test(key)) throw badRequest('session_keys must be session keys');
      if (!out.includes(key)) out.push(key);
    }
    return out;
  }
  function bindableForSession(ws,key,target) {
    if (target.status !== 'active') return false;
    const s = get(Q03,ws,key);
    if (!s) return false;
    const owner = memberPrincipal(ws,s.user_id);
    return authorize(owner,'goal.bind',{kind:'bind',goal:goalObj(target),hasTransfer:!!transferFor(ws,key,target.id)}).ok;
  }
  function requestView(pp,g,r,approvers=approvalSet(g)) {
    const rows = all(Q12,r.id);
    const everyone = r.sender_id === pp.userId || pp.wsRole === 'owner' || approvers.includes(pp.userId);
    const count = (...states) => rows.filter(t => states.includes(t.state)).length;
    const pending = count('sent','received');
    const state = r.cancelled_at ? 'cancelled' : pending ? 'open' : rows.length && count('expired') === rows.length ? 'expired' : 'answered';
    return {
      id:r.id,type:r.type,goal:{id:g.id,title:g.title,version:r.goal_version},
      target_goal:r.target_goal_id ? goalRef(pp,r.ws_id,r.target_goal_id) : null,
      note:r.note,sender:sender(r),created_at:r.created_at,cancelled_at:r.cancelled_at,
      cancelled_by:r.cancelled_by ? person(r.cancelled_by) : null,state,
      expired_reason:state === 'expired' ? rows.every(t => t.ended_reason || t.session_state === 'stopped') ? 'sessions_ended' : 'goal_closed' : null,
      counts:{pending,accepted:rows.filter(t => t.state === 'accepted' && !t.auto_accepted).length,
        declined:count('declined'),expired:count('expired'),not_declined:rows.filter(t => t.state === 'accepted' && t.auto_accepted).length},
      sessions:rows.filter(t => everyone || t.user_id === pp.userId).map(t => ({
        session_key:t.session_key,owner:person(t.user_id),mine:t.user_id === pp.userId,
        repo_alias:t.repo_alias,harness:t.harness,title:t.user_id === pp.userId ? t.title : null,
        started_at:t.started_at,state:t.state,ended_reason:t.state === 'expired' ? t.ended_reason : null,
        auto_accepted:!!t.auto_accepted,updated_at:t.updated_at
      })),
      can_cancel:!r.cancelled_at && pending > 0 && pp.wsRole !== 'viewer' && (r.sender_id === pp.userId || pp.wsRole === 'owner')
    };
  }
  async function sendRequest(pp,goalId,b) {
    const g = visibleGoal(pp,goalId);
    requireSender(pp,g,'send a request to its agents');
    const type = oneOf(b,'type',REQUEST_TYPES);
    const note = optStr(b,'note',NOTE_MAX);
    const keys = selectedKeys(b);
    let target = null;
    if (type === 'switch_goal') {
      if (!keys) throw badRequest('session_keys is required for switch_goal');
      const tid = str(b,'target_goal_id',64);
      if (tid === g.id) throw badRequest('target_goal_id must be another goal');
      target = visibleGoal(pp,tid);
    } else if (b.target_goal_id !== undefined && b.target_goal_id !== null) {
      throw badRequest('target_goal_id goes only with switch_goal');
    }
    const at = nowIso();
    const id = await tx(() => {
      const live = goalRow(pp.wsId,g.id);
      if (live.status !== 'active') throw conflict('wrong_state','This goal is achieved or dropped, so it takes no requests.');
      const onGoal = goalTargets(pp.wsId,g.id);
      if (keys && !keys.every(key => onGoal.includes(key))) throw badRequest('session_keys must be sessions on this goal');
      const targets = keys ?? onGoal;
      if (!targets.length) throw conflict('no_sessions','No shared session is working on this goal, so there is nobody to ask.');
      if (target && targets.some(key => !bindableForSession(pp.wsId,key,target))) throw conflict('not_bindable',"That goal can't be taken up by every chosen session: it is not active, or a session's owner can't bind it.");
      if (get(Q04,pp.wsId,g.id,type)) throw conflict('already_open','A request of this type is still waiting for an answer on this goal; cancel it first.');
      const n = get(Q05,pp.userId,new (readDate())(readDate().now() - 3600000).toISOString())?.n ?? 0;
      if (n >= REQUESTS_PER_HOUR) throw new V2Error(429,'rate_limited','Too many requests sent in the last hour, try again later');
      const rid = newId('rq');
      const role = approvalSet(live).includes(pp.userId) ? 'approver' : 'owner';
      const dir = writeDirective(pp.wsId,'request',targets,null,null,{goalId:g.id,request:{request_id:rid,cancelled:false}});
      run(Q06,rid,pp.wsId,g.id,type,target?.id ?? null,live.version,note,pp.userId,role,dir,at);
      for (const key of targets) run(Q07,pp.wsId,rid,key,at);
      audit(pp.wsId,pp.userId,'request.sent',rid,at);
      event('first_request',{ws:pp.wsId,user:pp.userId,props:{type},at});
      return rid;
    });
    return {request:requestView(pp,g,get(Q01,pp.wsId,id))};
  }
  async function cancelRequest(pp,goalId,id) {
    const g = visibleGoal(pp,goalId);
    if (pp.wsRole === 'viewer') throw forbidden('read_only','Viewers can look but not change anything.');
    const r = get(Q01,pp.wsId,id);
    if (!r || r.goal_id !== g.id) throw notFound();
    if (r.sender_id !== pp.userId && pp.wsRole !== 'owner') throw forbidden('not_sender','Only the person who sent this request, or a workspace owner, can cancel it.');
    const at = nowIso();
    await tx(() => {
      const live = get(Q01,pp.wsId,id);
      if (live.cancelled_at) return;
      const open = all(Q08,id).map(t => t.session_key);
      writeDirective(pp.wsId,'request',open,null,null,{goalId:g.id,request:{request_id:id,cancelled:true,reason:'withdrawn'}});
      run(Q09,at,id);
      run(Q10,at,pp.userId,id);
      audit(pp.wsId,pp.userId,'request.cancelled',id,at);
    });
    return {request:requestView(pp,g,get(Q01,pp.wsId,id))};
  }
  function expireOpenRequests(ws,goalId,actorId,at) {
    const rows = all(Q11,ws,goalId,goalId);
    for (const r of rows) {
      const keys = all(Q08,r.id).map(t => t.session_key);
      writeDirective(ws,'request',keys,null,null,{goalId:r.goal_id,request:{request_id:r.id,cancelled:true,reason:'goal_closed'}});
      run(Q09,at,r.id);
      audit(ws,actorId,'request.expired',r.id,at);
    }
  }
  function listRequests(pp,goalId) {
    const g = visibleGoal(pp,goalId);
    const approvers = approvalSet(g);
    const rows = all(Q13,pp.wsId,g.id);
    const sender = canSend(pp,g);
    const sessions = sender ? goalTargets(pp.wsId,g.id).map(key => {
      const s = get(Q14,pp.wsId,key);
      const mine = s.user_id === pp.userId;
      return {session_key:key,owner:person(s.user_id),mine,repo_alias:s.repo_alias,harness:s.harness,title:mine ? s.title : null,started_at:s.started_at};
    }) : null;
    return {requests:rows.map(r => requestView(pp,g,r,approvers)),can_send:sender && g.status === 'active',sessions,hold:holdView(pp,g)};
  }
  function requestWire(pp,j) {
    const r = get(Q01,pp.wsId,j.request_id);
    if (!r) return null;
    function title(id) {
      const g = goalRow(r.ws_id,id);
      return g && canReadGoal(pp,goalObj(g)) ? {title:g.title,version:g.version} : {title:null,version:g?.version ?? null};
    }
    const target = r.target_goal_id ? title(r.target_goal_id) : null;
    return {id:r.id,type:r.type,cancelled:j.cancelled,cancel_reason:j.cancelled ? (j.reason ?? 'withdrawn') : null,
      goal:{id:r.goal_id,title:title(r.goal_id).title,version:r.goal_version},
      target_goal:r.target_goal_id ? {id:r.target_goal_id,title:target.title,version:target.version} : null,
      sender:sender(r),note:r.note,created_at:r.created_at};
  }
  function expireStoppedSessionTargets(ws,sessionKey,at) { return run(Q15,at,ws,sessionKey); }
  function requestReceipt(ws,requestId,sessionKey,state,auto,actor) {
    const r = get(Q01,ws,requestId);
    const t = get(Q16,requestId,sessionKey);
    if (!r || !t) return null;
    if (auto && r.type === 'switch_goal') throw badRequest('A switch_goal request takes effect only when the developer accepts it');
    const pending = t.state === 'sent' || t.state === 'received';
    let next = t.state, flag = t.auto_accepted;
    if (state === 'received' && t.state === 'sent') next = 'received';
    else if (state === 'accepted' && pending) { next = 'accepted'; flag = auto ? 1 : 0; }
    else if (state === 'accepted' && t.state === 'accepted' && !auto) flag = 0;
    else if (state === 'declined' && (pending || t.state === 'accepted' && t.auto_accepted)) { next = 'declined'; flag = 0; }
    if (next !== t.state || flag !== t.auto_accepted) {
      const at = nowIso();
      run(Q17,next,flag,at,requestId,sessionKey);
      if (next === 'accepted') audit(ws,actor,flag ? 'request.not_declined' : 'request.accepted',requestId,at);
      if (next === 'declined') audit(ws,actor,'request.declined',requestId,at);
    }
    return next;
  }
  function holdView(pp,g) {
    const h = holdRow(g.ws_id,g.id);
    return {held:h ? {held_by:person(h.held_by),reason:h.reason,held_at:h.held_at} : null,can_hold:pp.wsRole !== 'viewer' && canSend(pp,g)};
  }
  function requireHolder(pp,goalId) { requireSender(pp,visibleGoal(pp,goalId),'hold or release its agents'); }
  function getHold(pp,goalId) { return holdView(pp,visibleGoal(pp,goalId)); }
  async function holdGoal(pp,goalId,b) {
    const g = visibleGoal(pp,goalId);
    requireSender(pp,g,'hold its agents');
    const reason = optStr(b,'reason',NOTE_MAX);
    const at = nowIso();
    const created = await tx(() => {
      if (holdRow(pp.wsId,g.id)) return false;
      if (goalRow(pp.wsId,g.id).status !== 'active') throw conflict('wrong_state','This goal is achieved or dropped, so it takes no requests.');
      const dir = writeDirective(pp.wsId,'hold',goalTargets(pp.wsId,g.id),null,null,{goalId:g.id,hold:{by:pp.userId,reason,at}});
      run(Q18,pp.wsId,g.id,pp.userId,reason,at,dir);
      audit(pp.wsId,pp.userId,'goal.held',g.id,at);
      event('first_hold',{ws:pp.wsId,user:pp.userId,at});
      return true;
    });
    return {status:created ? 201 : 200,body:getHold(pp,goalId)};
  }
  function releaseTargets(ws,goalId,heldAt) {
    const held = all(Q19,ws,goalId,heldAt).map(r => r.session_key);
    return [...new Set([...held,...goalTargets(ws,goalId)])].sort();
  }
  function releaseHold(ws,goalId,actorId,at) {
    const h = holdRow(ws,goalId);
    if (!h) return false;
    writeDirective(ws,'release',releaseTargets(ws,goalId,h.held_at),null,null,{goalId,hold:{by:actorId,at}});
    run(Q20,ws,goalId);
    audit(ws,actorId,'goal.released',goalId,at);
    return true;
  }
  async function releaseGoal(pp,goalId) {
    const g = visibleGoal(pp,goalId);
    requireSender(pp,g,'release its agents');
    await tx(() => releaseHold(pp.wsId,g.id,pp.userId,nowIso()));
    return getHold(pp,goalId);
  }
  function holdNewlyBound(ws,goalId,sessionKey) {
    const h = holdRow(ws,goalId);
    if (!h) return;
    if (!get(Q21,ws,goalId,h.held_at,sessionKey)) writeDirective(ws,'hold',[sessionKey],null,null,{goalId,hold:{by:h.held_by,reason:h.reason,at:h.held_at}});
  }
  function holdWire(pp,kind,goalId,j) {
    const g = goalRow(pp.wsId,goalId);
    const goal = {id:goalId,title:g && canReadGoal(pp,goalObj(g)) ? g.title : null};
    if (kind === 'release') return {goal,released_by:person(j.by),at:j.at};
    return {goal,held_by:person(j.by),reason:j.reason ?? null,at:j.at};
  }
  function listHolds(pp) {
    return all(Q22,pp.wsId).map(h => ({h,g:goalRow(pp.wsId,h.goal_id)}))
      .filter(({g}) => g && canReadGoal(pp,goalObj(g)))
      .map(({h,g}) => ({goal:{id:g.id,title:g.title},held_by:person(h.held_by),reason:h.reason,held_at:h.held_at}));
  }
  return {REQUEST_TYPES,REQUESTS_PER_HOUR,SWITCH_SESSIONS_MAX,NOTE_MAX,holdRow,sendRequest,cancelRequest,
    expireOpenRequests,listRequests,requestWire,expireStoppedSessionTargets,requestReceipt,
    requireHolder,getHold,holdGoal,releaseHold,releaseGoal,holdNewlyBound,holdWire,listHolds};
}
module.exports = {create_requests};
