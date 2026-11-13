'use strict';
function create_reallocations(resources) {
  const {all,audit,get,run,tx,badRequest,conflict,forbidden,notFound,newId,nowIso,effectiveSet,launchSet,assertTargetsFit,contentOf,goalObj,goalRow,visibleGoal,writeGoalVersion,canReadGoal,memberName,nameTo,assertRevisionReached,optStr,revisionRead,COUNTER_SAME_AS_PROPOSAL}=resources;
  const REALLOCATION_STATES=['pending','countered','approved','rejected','withdrawn','superseded'];
  const REALLOCATION_ACTIONS=['approve','approve_and_launch','launch','not_yet','counter','accept_counter','reject','withdraw'];
  const REALLOCATION_GOALS_MAX=50;
  const Q01='SELECT * FROM v2_reallocations WHERE ws_id = ? AND id = ?';
  const Q02='SELECT * FROM v2_reallocation_revisions WHERE reallocation_id = ? AND revision = ?';
  const Q03='SELECT goal_id, user_id FROM v2_reallocation_approvals WHERE reallocation_id = ? AND revision = ?';
  const Q04='INSERT OR IGNORE INTO v2_reallocation_approvals (ws_id, reallocation_id, revision, goal_id, user_id, at) VALUES (?, ?, ?, ?, ?, ?)';
  const Q05="UPDATE v2_reallocations SET state = 'approved', launch = 'pending', decided_at = ?, updated_at = ? WHERE id = ?";
  const Q06='INSERT INTO v2_reallocation_revisions (ws_id, reallocation_id, revision, targets_json, note, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
  const Q07='SELECT targets_json FROM v2_reallocation_revisions WHERE reallocation_id = ?';
  const Q08="INSERT INTO v2_reallocations (id, ws_id, requester_id, state, revision, created_at, updated_at) VALUES (?, ?, ?, 'pending', 1, ?, ?)";
  const Q09='UPDATE v2_reallocations SET updated_at = ? WHERE id = ?';
  const Q10="UPDATE v2_reallocations SET launch = 'launched', launch_by = ?, launch_at = ?, updated_at = ? WHERE id = ?";
  const Q11="UPDATE v2_reallocations SET launch = 'not_yet', launch_by = ?, launch_at = ?, updated_at = ? WHERE id = ?";
  const Q12="UPDATE v2_reallocations SET state = 'countered', revision = ?, updated_at = ? WHERE id = ?";
  const Q13="UPDATE v2_reallocations SET state = 'pending', updated_at = ? WHERE id = ?";
  const Q14="UPDATE v2_reallocations SET state = 'rejected', decided_by = ?, decision_note = ?, decided_at = ?, updated_at = ? WHERE id = ?";
  const Q15="UPDATE v2_reallocations SET state = 'withdrawn', decided_at = ?, updated_at = ? WHERE id = ?";
  const Q16="SELECT r.id FROM v2_reallocations r JOIN v2_reallocation_revisions v ON v.reallocation_id = r.id AND v.revision = r.revision\n     WHERE r.ws_id = ? AND (r.state IN ('pending','countered') OR (r.state = 'approved' AND r.launch IN ('pending','not_yet')))\n     AND EXISTS (SELECT 1 FROM json_each(v.targets_json) j WHERE json_extract(j.value, '$.goal_id') = ?)";
  const Q17="UPDATE v2_reallocations SET launch = CASE WHEN state = 'approved' THEN 'superseded' ELSE launch END, state = 'superseded', decided_at = COALESCE(decided_at, ?), updated_at = ? WHERE id = ?";
  const Q18='SELECT * FROM v2_reallocation_revisions WHERE reallocation_id = ? ORDER BY revision';
  const Q19='SELECT * FROM v2_reallocations WHERE ws_id = ? ORDER BY updated_at DESC, id LIMIT 200';
  const revision=(id,n)=>get(Q02,id,n);
  const targets=(id,n)=>JSON.parse(revision(id,n).targets_json);
  const approvals=(id,n)=>new Map(all(Q03,id,n).map(x=>[x.goal_id,x.user_id]));
  const goalIds=id=>[...new Set(all(Q07,id).flatMap(x=>JSON.parse(x.targets_json).map(t=>t.goal_id)))];
  function readable(pp,ws,id) { const g=goalRow(ws,id); return !!(g && canReadGoal(pp,goalObj(g))); }
  function visible(pp,id) { const r=get(Q01,pp.wsId,id); if(!r || !goalIds(r.id).some(g=>readable(pp,r.ws_id,g))) throw notFound(); return r; }
  function validate(pp,input) {
    if(!Array.isArray(input)||!input.length) throw badRequest('targets must list at least one { goal_id, target_share }');
    if(input.length>50) throw badRequest('targets: at most 50');
    const seen=new Set(), result=[];
    for(const item of input) {
      if(!item || typeof item!=='object' || Array.isArray(item)) throw badRequest('each target must be { goal_id, target_share }');
      const share=item.target_share;
      if(share!==null && !(typeof share==='number' && Number.isInteger(share) && share>=0 && share<=100)) throw badRequest('target_share must be a whole percent from 0 to 100, or null');
      const g=visibleGoal(pp,typeof item.goal_id==='string'?item.goal_id:'');
      if(seen.has(g.id)) throw badRequest('Each goal can appear once');
      seen.add(g.id);
      if(g.status!=='active') throw conflict('goal_not_active',"A goal in this proposal is achieved or dropped, so its target can't change.");
      if((g.target_share??null)!==share) result.push({goal_id:g.id,base_version:g.version,from_share:g.target_share??null,target_share:share});
    }
    if(!result.length) throw conflict('no_change','These targets are already set, so there is nothing to propose.');
    return result;
  }
  function fit(ws,ts) { assertTargetsFit(ws,new Map(ts.map(t=>[t.goal_id,t.target_share]))); }
  function same(a,b) { const m=new Map(a.map(t=>[t.goal_id,t.target_share])); return a.length===b.length && b.every(t=>m.has(t.goal_id)&&m.get(t.goal_id)===t.target_share); }
  function approveAs(r,n,user,at) {
    const approved=approvals(r.id,n), ts=targets(r.id,n); let count=0;
    for(const t of ts) { const g=goalRow(r.ws_id,t.goal_id); if(!g || approved.has(t.goal_id) || !effectiveSet(g,r.requester_id).includes(user)) continue; count+=run(Q04,r.ws_id,r.id,n,t.goal_id,user,at); }
    return count;
  }
  function settle(r,at) { const approved=approvals(r.id,r.revision), ts=targets(r.id,r.revision); if(ts.every(t=>approved.has(t.goal_id))) { run(Q05,at,at,r.id); audit(r.ws_id,null,'reallocation.approved',r.id,at); return true; } return false; }
  function writeRevision(r,n,ts,note,author,at) { run(Q06,r.ws_id,r.id,n,JSON.stringify(ts),note,author,at); }
  function mayLaunch(pp,r) { return targets(r.id,r.revision).every(t=>{const g=goalRow(r.ws_id,t.goal_id); return g && launchSet(g,r.requester_id).includes(pp.userId) && canReadGoal(pp,goalObj(g));}); }
  function writeTargets(r,actor,at) {
    const approvedBy=approvals(r.id,r.revision), ts=targets(r.id,r.revision);
    const pairs=ts.map(t=>({t,g:goalRow(r.ws_id,t.goal_id)}));
    pairs.sort((a,b)=>((a.t.target_share??0)-(a.g?.target_share??0))-((b.t.target_share??0)-(b.g?.target_share??0)));
    for(const {t,g} of pairs) { if(!g || g.status!=='active' || g.version!==t.base_version) throw conflict('stale_version',"A goal in this proposal changed, so it can't be launched."); writeGoalVersion(g,{...contentOf(g),target_share:t.target_share},actor,at,approvedBy.get(t.goal_id)??actor); }
  }
  function refusal(r,reader) {
    switch(r.state) {
      case 'pending': return 'This proposal is waiting for approval.';
      case 'countered': {const author=revision(r.id,r.revision).author_id; return author===reader?`You countered this proposal; it waits on ${nameTo(r.requester_id,reader)} to accept it.`:`This proposal was countered by ${memberName(author)}; review the counter.`;}
      case 'approved': return 'This proposal is already approved.';
      case 'rejected': return r.decided_by===reader?'You declined this proposal, so nothing changes.':`This proposal was declined${r.decided_by?' by '+memberName(r.decided_by):''}, so nothing changes.`;
      case 'withdrawn': return r.requester_id===reader?'You withdrew this proposal, so nothing changes.':`This proposal was withdrawn by ${memberName(r.requester_id)}, so nothing changes.`;
      case 'superseded': return 'This proposal was superseded: one of its goals got a newer version or was closed first, so nothing changes.';
    }
  }
  const person=id=>id?{id,name:memberName(id)}:null;
  function view(pp,r) {
    const approved=approvals(r.id,r.revision), me=pp.userId; let isApprover=false, canApproveNow=false;
    const projected=targets(r.id,r.revision).map(t=>{
      const g=goalRow(r.ws_id,t.goal_id), seen=g && canReadGoal(pp,goalObj(g)), set=g?effectiveSet(g,r.requester_id):[];
      if(set.includes(me)) {isApprover=true; if(!approved.has(t.goal_id)) canApproveNow=true;}
      return {goal:seen?{id:g.id,title:g.title}:null,from_share:seen?t.from_share:null,current_share:seen?(g.target_share??null):null,target_share:seen?t.target_share:null,base_version:seen?t.base_version:null,approvers:seen?set.map(person):[],approved_by:seen?person(approved.get(t.goal_id)??null):null,approved:approved.has(t.goal_id)};
    });
    const isRequester=r.requester_id===me, open=r.state==='pending'||r.state==='countered', unlaunched=r.state==='approved'&&(r.launch==='pending'||r.launch==='not_yet');
    const launcher=(r.state==='pending'||unlaunched)&&mayLaunch(pp,r);
    const can={approve:r.state==='pending'&&canApproveNow,approve_and_launch:r.state==='pending'&&canApproveNow&&launcher&&projected.every(t=>t.approved||t.approvers.some(p=>p.id===me)),launch:unlaunched&&launcher,not_yet:unlaunched&&launcher&&r.launch!=='not_yet',counter:r.state==='pending'&&isApprover&&!isRequester,accept_counter:r.state==='countered'&&isRequester,reject:open&&isApprover&&!isRequester,withdraw:open&&isRequester};
    if(pp.wsRole==='viewer') for(const key of Object.keys(can)) can[key]=false;
    const history=all(Q18,r.id).map(x=>({revision:x.revision,author:person(x.author_id),note:x.note,created_at:x.created_at}));
    return {id:r.id,state:r.state,revision:r.revision,requester:person(r.requester_id),targets:projected,note:revision(r.id,r.revision).note,history,launch:r.launch,launch_decided_by:person(r.launch_by),launch_decided_at:r.launch_at,rejected_by:r.state==='rejected'?person(r.decided_by):null,rejection_reason:r.state==='rejected'?r.decision_note:null,waiting_on_me:can.approve||can.accept_counter||(can.launch&&r.launch==='pending'),can,created_at:r.created_at,updated_at:r.updated_at,decided_at:r.decided_at};
  }
  async function createReallocation(pp,b) {
    if(pp.wsRole==='viewer') throw forbidden('read_only','Viewers can look but not change anything.');
    const ts=validate(pp,b.targets), note=optStr(b,'note',1000); fit(pp.wsId,ts); const id=newId('rl'), at=nowIso();
    await tx(()=>{
      for(const t of ts) if(goalRow(pp.wsId,t.goal_id).version!==t.base_version) throw conflict('stale_version','A goal changed while this was being sent. Reload the page and propose again.');
      run(Q08,id,pp.wsId,pp.userId,at,at); writeRevision({id,ws_id:pp.wsId},1,ts,note,pp.userId,at); audit(pp.wsId,pp.userId,'reallocation.requested',id,at); approveAs({id,ws_id:pp.wsId,requester_id:pp.userId},1,pp.userId,at); settle(get(Q01,pp.wsId,id),at);
    });
    return view(pp,get(Q01,pp.wsId,id));
  }
  async function actOnReallocation(pp,id,action,b) {
    visible(pp,id);
    if(pp.wsRole==='viewer') throw forbidden('read_only','Viewers can look but not change anything.');
    const me=pp.userId, at=nowIso(), sent=revisionRead(b,true);
    await tx(()=>{
      const r=get(Q01,pp.wsId,id); assertRevisionReached('proposal',sent,r.revision);
      const counterTargets=action==='counter'?validate(pp,b.targets):null;
      const note=action==='counter'||action==='reject'?optStr(b,action==='reject'?'reason':'note',1000):null;
      const ts=targets(r.id,r.revision), isRequester=r.requester_id===me, eligible=ts.some(t=>{const g=goalRow(r.ws_id,t.goal_id); return g && effectiveSet(g,r.requester_id).includes(me);});
      function inState(states) { if(!states.includes(r.state)) throw conflict('wrong_state',refusal(r,me)); }
      function expected(required) { if((required||b.revision!==undefined)&&b.revision!==r.revision) {const author=r.state==='countered'?revision(r.id,r.revision).author_id:null; const what=author?`${nameTo(author,me)} countered it, and it is now at revision ${r.revision}`:`it is now at revision ${r.revision}`; throw conflict('stale_revision',`This proposal changed after you read it: ${what}. Read it again and decide again.`);} }
      function approverOnly() {if(!eligible) throw forbidden('not_an_approver','Only someone who can approve for one of these goals can do this.');}
      function requesterOnly() {if(!isRequester) throw forbidden('not_requester','Only the person who asked can do this.');}
      function launcherOnly() {if(!mayLaunch(pp,r)) throw forbidden('not_a_launcher','Only someone who can launch for every goal in it (an approver of each, or a workspace owner who can read them all) can launch it.');}
      function launchable() {if(!(r.state==='approved'&&(r.launch==='pending'||r.launch==='not_yet'))) throw conflict('wrong_state',r.launch==='launched'?`These targets were already launched by ${r.launch_by?nameTo(r.launch_by,me):'someone'}.`:refusal(r,me));}
      function approval() {approverOnly(); inState(['pending']); expected(true); if(!approveAs(r,r.revision,me,at)) throw conflict('already_approved','The goals you can approve for are already approved.'); run(Q09,at,r.id); audit(r.ws_id,me,'reallocation.approval',r.id,at); return settle(r,at);}
      function launch() {launcherOnly(); fit(r.ws_id,targets(r.id,r.revision)); run(Q10,me,at,at,r.id); writeTargets(r,me,at); audit(r.ws_id,me,'reallocation.launched',r.id,at);}
      switch(action) {
        case 'approve': approval(); break;
        case 'approve_and_launch': launcherOnly(); if(!approval()) throw conflict('not_ready',"Other goals in this proposal still need an approval, so it can't launch yet; approve it instead."); launch(); break;
        case 'launch': launchable(); expected(false); launch(); break;
        case 'not_yet': launcherOnly(); launchable(); expected(false); if(r.launch==='not_yet') {const who=r.launch_by===me?'You':r.launch_by?memberName(r.launch_by):'Someone'; throw conflict('wrong_state',`${who} already decided not yet, so nothing changes: agents keep the old targets until someone launches the new ones.`);} run(Q11,me,at,at,r.id); audit(r.ws_id,me,'reallocation.not_yet',r.id,at); break;
        case 'counter': {approverOnly(); if(isRequester) throw forbidden('not_an_approver','Withdraw and propose again to change your own proposal.'); inState(['pending']); expected(false); if(same(ts,counterTargets)) throw conflict('no_change',COUNTER_SAME_AS_PROPOSAL); fit(r.ws_id,counterTargets); const next=r.revision+1; writeRevision(r,next,counterTargets,note,me,at); run(Q12,next,at,r.id); approveAs(r,next,me,at); audit(r.ws_id,me,'reallocation.countered',r.id,at); break;}
        case 'accept_counter': requesterOnly(); inState(['countered']); expected(false); for(const t of ts) if(goalRow(r.ws_id,t.goal_id)?.version!==t.base_version) throw conflict('stale_version',"A goal in this proposal changed after the counter, so it can't go back for approval. Withdraw it and propose again."); fit(r.ws_id,ts); run(Q13,at,r.id); approveAs(r,r.revision,me,at); audit(r.ws_id,me,'reallocation.counter_accepted',r.id,at); settle({...r,state:'pending'},at); break;
        case 'reject': approverOnly(); if(isRequester) throw forbidden('not_an_approver','Withdraw your own proposal instead.'); inState(['pending','countered']); expected(false); run(Q14,me,note,at,at,r.id); audit(r.ws_id,me,'reallocation.rejected',r.id,at); break;
        case 'withdraw': requesterOnly(); inState(['pending','countered']); expected(false); run(Q15,at,at,r.id); audit(r.ws_id,me,'reallocation.withdrawn',r.id,at); break;
      }
    });
    return view(pp,get(Q01,pp.wsId,id));
  }
  function supersedeReallocations(ws,goalId,actorId,at) {for(const row of all(Q16,ws,goalId)) {run(Q17,at,at,row.id); audit(ws,actorId,'reallocation.superseded',row.id,at);} }
  function getReallocation(pp,id) {return view(pp,visible(pp,id));}
  function listReallocations(pp) {const views=all(Q19,pp.wsId).filter(r=>goalIds(r.id).some(g=>readable(pp,r.ws_id,g))).map(r=>view(pp,r)); return {waiting_on_me:views.filter(v=>v.waiting_on_me),mine:views.filter(v=>!v.waiting_on_me&&v.requester.id===pp.userId),others:views.filter(v=>!v.waiting_on_me&&v.requester.id!==pp.userId)};}
  function assertReallocationAction(a) {if(!REALLOCATION_ACTIONS.includes(a)) throw notFound(); return a;}
  return {REALLOCATION_STATES,REALLOCATION_ACTIONS,REALLOCATION_GOALS_MAX,createReallocation,actOnReallocation,supersedeReallocations,getReallocation,listReallocations,assertReallocationAction};
}
module.exports={create_reallocations};
