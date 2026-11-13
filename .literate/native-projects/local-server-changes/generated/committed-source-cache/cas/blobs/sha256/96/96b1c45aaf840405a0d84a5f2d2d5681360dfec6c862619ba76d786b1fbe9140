'use strict';

function create_changes(resources) {
  const {all,audit,get,run,tx,V2Error,badRequest,conflict,forbidden,notFound,event,
    newId,nowIso,effectiveSet,launchSet,contentOf,dependencyCycle,goalObj,goalRow,
    goalsDependingOn,nextContent,sameContent,unreadableGoals,versionContentOf,
    visibleGoal,writeGoalVersion,canReadGoal,memberName,memberPrincipal,nameTo,
    assertRevisionReached,nonNegInt,optStr,revisionRead,str,EVIDENCE_PER_REVISION,
    evidenceCount,evidenceInput,evidenceRows,evidenceView,recordSnapshot,snapshotView,
    counterNoChange,counterSameAsRequest} = resources;
  const CHANGE_REQUEST_STATES = ['pending','countered','approved','rejected','withdrawn','superseded'];
  const CHANGE_REQUEST_ACTIONS = ['approve','approve_and_launch','launch','not_yet','reject','counter','accept_counter','acknowledge','withdraw','rebase'];
  const LAUNCH_STATES = ['pending','not_yet','launched','superseded'];
  const CHANGE_KEYS = ['title','measures','depends_on','status','limits'];
  const sortedIds = ids => [...ids].sort().join(',');
  const applied = (base, changes) => ({...base,...changes});
  const isOpen = r => r.state === 'pending' || r.state === 'countered';
  const rowFor = (ws,id) => get('SELECT * FROM v2_change_requests WHERE ws_id = ? AND id = ?',ws,id);
  const openFor = (ws,goal,user) => get("SELECT id FROM v2_change_requests WHERE ws_id = ? AND goal_id = ? AND requester_id = ? AND state IN ('pending','countered')",ws,goal,user);
  const revisionsFor = id => all('SELECT * FROM v2_change_request_revisions WHERE change_request_id = ? ORDER BY revision',id);
  const latestCounter = rows => [...rows].reverse().find(r => r.note !== null);
  const person = id => id ? {id,name:memberName(id)} : null;
  function changesIn(principal,goalId,base,changes,keepDepsFrom=base.depends_on,loopOk=false) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw badRequest('changes must be an object with title, measures, depends_on, status or limits');
    const keys = Object.keys(changes);
    if (!keys.length) throw badRequest('changes must name at least one of title, measures, depends_on, status or limits');
    const unknown = keys.find(k => !CHANGE_KEYS.includes(k));
    if (unknown) throw badRequest(`changes: ${unknown} can't be proposed (only title, measures, depends_on, status and limits)`);
    const next = nextContent(principal,goalId,base,changes,keepDepsFrom,loopOk);
    const result = {};
    if (next.title !== base.title) result.title = next.title;
    if (JSON.stringify(next.measures) !== JSON.stringify(base.measures)) result.measures = next.measures;
    if (sortedIds(next.depends_on) !== sortedIds(base.depends_on)) result.depends_on = next.depends_on;
    if (next.status !== base.status) result.status = next.status;
    if (JSON.stringify(next.limits) !== JSON.stringify(base.limits)) result.limits = next.limits;
    return result;
  }
  function visibleRequest(principal,id,goalId) {
    const row = rowFor(principal.wsId,id);
    if (!row || (goalId && row.goal_id !== goalId)) throw notFound();
    visibleGoal(principal,row.goal_id);
    return row;
  }
  function counterAuthor(row) {
    if (row.state !== 'countered') return null;
    return get('SELECT author_id FROM v2_change_request_revisions WHERE change_request_id = ? AND revision = ?',row.id,row.revision)?.author_id ?? null;
  }
  function stateRefusal(row,reader) {
    switch (row.state) {
      case 'pending': return latestCounter(revisionsFor(row.id)) ? 'The suggested change was already accepted, so this request is waiting for approval.' : 'This request is waiting for approval.';
      case 'countered': {
        const author = counterAuthor(row);
        return author === reader ? `You countered this request; it waits on ${nameTo(row.requester_id,reader)} to accept it.` : `This request was countered${author ? ` by ${memberName(author)}` : ''}; review the counter.`;
      }
      case 'approved': return row.approved_by === reader ? 'You already approved this request.' : `This request was already approved${row.approved_by ? ` by ${memberName(row.approved_by)}` : ''}.`;
      case 'rejected': return row.rejected_by === reader ? 'You declined this request, so nothing changes.' : `This request was declined${row.rejected_by ? ` by ${memberName(row.rejected_by)}` : ''}, so nothing changes.`;
      case 'withdrawn': return row.requester_id === reader ? 'You withdrew this request, so nothing changes.' : `This request was withdrawn by ${memberName(row.requester_id)}, so nothing changes.`;
      case 'superseded': return 'This request was superseded: its goal was closed or got a newer version first, so nothing changes.';
    }
  }
  function revisionRefusal(row,reader,then='Read it again and decide again.') {
    const author = counterAuthor(row);
    const what = author ? `${nameTo(author,reader)} countered it, and it is now at revision ${row.revision}` : `it is now at revision ${row.revision}`;
    return `This request changed after you read it: ${what}. ${then}`;
  }
  function hiddenAddedDependency(ws,already,changes,readers) {
    const added = (changes.depends_on ?? []).filter(id => !already.includes(id));
    if (!added.length) return null;
    for (const reader of readers) {
      const hidden = unreadableGoals(memberPrincipal(ws,reader),added);
      if (hidden.length) return hidden[0];
    }
    return null;
  }
  const proposalRefusal = "Someone who decides on this goal can't see a goal you added as a dependency, so they couldn't see what they approve. Remove it, or ask that goal's owner to share it with them first.";
  function assertDependenciesVisible(ws,base,changes,readers,kind,already=base.depends_on) {
    if (hiddenAddedDependency(ws,already,changes,readers)) {
      const message = kind === 'counter' ? "The person who asked can't see a goal you added as a dependency, so they couldn't see what they accept. Remove it from your suggestion." : kind === 'counter_approvers' ? "Someone who decides on this goal can't see a goal you added as a dependency, so they couldn't see what they approve once it is accepted. Remove it from your suggestion, or ask that goal's owner to share it with them first." : proposalRefusal;
      throw conflict('dependency_not_visible',message);
    }
  }
  function dependencyRefusal(requester,reader,kind) {
    if (kind === 'launch') return `This change adds a dependency on a goal you can't see, so you can't launch what it publishes. Ask someone who decides on this goal and can see it to launch it, or ${requester === reader ? 'propose' : `ask ${memberName(requester)} to propose`} the change again without that dependency.`;
    return requester === reader ? "This request adds a dependency on a goal you can't see, so you can't approve what it asks. Withdraw it, or update it without that dependency." : `This request adds a dependency on a goal you can't see, so you can't approve what it asks. Ask ${memberName(requester)} to withdraw it, or to rebase it without that dependency.`;
  }
  function hiddenDependencyRefusal(principal,row,kind) {
    const deps = kind === 'approve' ? (JSON.parse(row.changes_json).depends_on ?? []) : row.approved_json ? JSON.parse(row.approved_json).depends_on : [];
    const base = versionContentOf(row.ws_id,row.goal_id,row.base_version);
    if (unreadableGoals(principal,deps.filter(id => !base.depends_on.includes(id))).length) return dependencyRefusal(row.requester_id,principal.userId,kind);
    return null;
  }
  function dependencyLoop(row,goal,reader) {
    let deps;
    if (row.state === 'pending') {
      const changes = JSON.parse(row.changes_json);
      if (!changes.depends_on) return null;
      deps = changes.depends_on;
    } else if (row.state === 'approved' && (row.launch === 'pending' || row.launch === 'not_yet') && row.approved_json && goal.version === row.base_version) {
      deps = JSON.parse(row.approved_json).depends_on;
    } else return null;
    if (!deps.length || !dependencyCycle(row.ws_id,row.goal_id,deps)) return null;
    return row.state === 'approved' ? `A goal this change adds as a dependency has since come to depend on this goal, so launching it would make a loop. It can launch once that loop is gone; a newer version of this goal supersedes it, and ${nameTo(row.requester_id,reader)} can propose the change again without that dependency.` : `A goal this request adds as a dependency has since come to depend on this goal, so approving it would make a loop. Someone who decides on this goal can suggest a change without that dependency or decline it, and ${nameTo(row.requester_id,reader)} can withdraw it.`;
  }
  function dependencyAddedBy(rows,id) {
    let author = null;
    for (const r of rows) {
      if (JSON.parse(r.changes_json).depends_on?.includes(id)) { if (author === null) author = r.author_id; }
      else author = null;
    }
    return author;
  }
  function dependencyReaders(principal,goal,counterOf) {
    if (principal.wsRole === 'viewer' || goal.status !== 'active') return null;
    if (counterOf) {
      const row = rowFor(principal.wsId,counterOf);
      if (!row || row.goal_id !== goal.id) throw notFound();
      const approvers = effectiveSet(goal,row.requester_id);
      if (row.state !== 'pending' || !approvers.includes(principal.userId)) return null;
      return [row.requester_id,...approvers];
    }
    if (goal.owner_id === principal.userId) return null;
    return effectiveSet(goal,principal.userId);
  }
  function readableLoops(principal,goalId) {
    return [...goalsDependingOn(principal.wsId,goalId)].filter(id => {
      const g = goalRow(principal.wsId,id);
      return g && canReadGoal(principal,goalObj(g));
    });
  }
  function dependencyChoices(principal,goalId,counterOf) {
    const goal = visibleGoal(principal,goalId);
    const audience = dependencyReaders(principal,goal,counterOf);
    if (!audience) return null;
    const readers = audience.map(id => memberPrincipal(principal.wsId,id));
    const loops = goalsDependingOn(principal.wsId,goal.id);
    return all('SELECT * FROM v2_goals WHERE ws_id = ? AND id != ? ORDER BY id',principal.wsId,goal.id).filter(g => !loops.has(g.id) && canReadGoal(principal,goalObj(g)) && readers.every(p => canReadGoal(p,goalObj(g)))).map(g => g.id);
  }
  function dependencyLoops(principal,goalId,counterOf) {
    const goal = visibleGoal(principal,goalId);
    if (!dependencyReaders(principal,goal,counterOf)) return null;
    return readableLoops(principal,goal.id);
  }
  function counterBase(principal,goalId,counterOf) {
    if (!counterOf) return null;
    const goal = visibleGoal(principal,goalId);
    if (!dependencyReaders(principal,goal,counterOf)) return null;
    const base = versionContentOf(principal.wsId,goal.id,rowFor(principal.wsId,counterOf).base_version);
    const hidden = unreadableGoals(principal,base.depends_on);
    return {title:base.title,measures:base.measures,depends_on:base.depends_on.filter(id => !hidden.includes(id)),status:base.status,limits:base.limits};
  }
  function versionLoops(principal,goalId,canEdit) {
    const goal = visibleGoal(principal,goalId);
    return canEdit ? readableLoops(principal,goal.id) : null;
  }
  function writeRevision(ws,goal,id,revision,base,changes,note,author,time,condition=null) {
    run('INSERT INTO v2_change_request_revisions (ws_id, change_request_id, revision, base_version, changes_json, note, author_id, created_at, snapshot_json, condition) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',ws,id,revision,base,JSON.stringify(changes),note,author,time,recordSnapshot(ws,goal,time),condition);
  }
  function insertChangeRequest(principal,goal,changes,reason,time) {
    const id = newId('cr');
    run("INSERT INTO v2_change_requests (id, ws_id, goal_id, requester_id, state, revision, base_version, changes_json, reason, created_at, updated_at)\n     VALUES (?, ?, ?, ?, 'pending', 1, ?, ?, ?, ?, ?)",id,principal.wsId,goal.id,principal.userId,goal.version,JSON.stringify(changes),reason,time,time);
    writeRevision(principal.wsId,goal.id,id,1,goal.version,changes,null,principal.userId,time);
    audit(principal.wsId,principal.userId,'change_request.created',id,time);
    return id;
  }
  function viewerCheck(principal) {
    if (principal.wsRole === 'viewer') throw forbidden('read_only','Viewers can look but not change anything.');
  }
  function activeCheck(goal) {
    if (goal.status !== 'active') throw conflict('goal_not_active','This goal is achieved or dropped, so it takes no change requests.');
  }
  async function createChangeRequest(principal,goalId,body) {
    const goal = visibleGoal(principal,goalId);
    viewerCheck(principal);
    if (goal.owner_id === principal.userId) throw forbidden('own_goal','You own this goal. Save a new version instead.');
    activeCheck(goal);
    const base = nonNegInt(body,'base_version');
    if (base !== goal.version) throw conflict('stale_version',`This goal changed while you were editing. Reload to start from version ${goal.version}.`);
    const reason = str(body,'reason',2000);
    if (openFor(principal.wsId,goal.id,principal.userId)) throw conflict('already_open','You already have an open change request on this goal.');
    const changes = changesIn(principal,goal.id,contentOf(goal),body.changes);
    const time = nowIso();
    const id = await tx(() => {
      const current = goalRow(principal.wsId,goal.id);
      if (current.version !== goal.version) throw conflict('stale_version',`This goal changed while you were editing. Reload to start from version ${current.version}.`);
      activeCheck(current);
      if (openFor(principal.wsId,goal.id,principal.userId)) throw conflict('already_open','You already have an open change request on this goal.');
      assertDependenciesVisible(principal.wsId,contentOf(current),changes,effectiveSet(current,principal.userId),'proposal');
      const id = insertChangeRequest(principal,current,changes,reason,time);
      event('first_change_request',{ws:principal.wsId,user:principal.userId,at:time});
      return id;
    });
    return requestView(rowFor(principal.wsId,id),principal);
  }
  function mayAddEvidence(principal,row,approvers) {
    return principal.wsRole !== 'viewer' && isOpen(row) && (row.requester_id === principal.userId || approvers.includes(principal.userId));
  }
  function mayRemoveEvidence(principal,row,evidence) {
    return principal.wsRole !== 'viewer' && isOpen(row) && evidence.revision === row.revision && evidence.added_by === principal.userId;
  }
  async function actOnChangeRequest(principal,goalId,requestId,action,body) {
    visibleRequest(principal,requestId,goalId);
    viewerCheck(principal);
    const sent = revisionRead(body,true);
    const actor = principal.userId;
    const time = nowIso();
    await tx(() => {
      const row = rowFor(principal.wsId,requestId);
      assertRevisionReached('request',sent,row.revision);
      const goal = goalRow(principal.wsId,row.goal_id);
      const isRequester = row.requester_id === actor;
      const isApprover = effectiveSet(goal,row.requester_id).includes(actor);
      const changes = JSON.parse(row.changes_json);
      const log = action => audit(principal.wsId,actor,action,row.id,time);
      const approverOnly = () => { if (!isApprover) throw forbidden('not_an_approver','Only someone who can approve for this goal can do this.'); };
      const requesterOnly = () => { if (!isRequester) throw forbidden('not_requester','Only the person who asked can do this.'); };
      const launcherOnly = () => { if (!launchSet(goal,row.requester_id).includes(actor)) throw forbidden('not_a_launcher','Only someone who can approve for this goal, or a workspace owner, can launch it.'); };
      const stateOnly = states => { if (!states.includes(row.state)) throw conflict('wrong_state',stateRefusal(row,actor)); };
      const expectRevision = (required=false) => {
        if ((required || body.revision !== undefined) && body.revision !== row.revision) throw conflict('stale_revision',revisionRefusal(row,actor));
      };
      const launchable = () => {
        if (row.state === 'approved' && row.launch === 'launched') throw conflict('wrong_state',`This change is already launched as version ${row.version}.`);
        if (row.state === 'superseded' && row.launch === 'superseded') throw conflict('wrong_state',`This change was superseded before launch. ${isRequester ? 'You' : memberName(row.requester_id)} can propose it again.`);
        stateOnly(['approved']);
        if (goal.version !== row.base_version) throw conflict('stale_version',`The goal changed after this change was approved: it is now at version ${goal.version}.`);
      };
      const checkHiddenAndLoop = kind => {
        const hidden = hiddenDependencyRefusal(principal,row,kind);
        if (hidden) throw conflict('dependency_not_visible',hidden);
        const loop = dependencyLoop(row,goal,actor);
        if (loop) throw conflict('cycle',loop);
      };
      const approve = () => {
        approverOnly(); stateOnly(['pending']); expectRevision(true);
        const note = optStr(body,'note',2000);
        if (goal.version !== row.base_version) throw conflict('stale_version',`The goal changed after this request was made. ${isRequester ? 'You need' : `${memberName(row.requester_id)} needs`} to update it before it can be approved.`);
        checkHiddenAndLoop('approve');
        const content = applied(contentOf(goal),changes);
        if (sameContent(content,contentOf(goal))) throw conflict('no_change','This request no longer changes anything.');
        const withoutEvidence = evidenceCount(row.id,row.revision) === 0 ? 1 : 0;
        run("UPDATE v2_change_requests SET state = 'approved', approved_by = ?, decision_note = ?, decided_at = ?, updated_at = ?, approved_without_evidence = ?, launch = 'pending', approved_json = ? WHERE id = ?",actor,note,time,time,withoutEvidence,JSON.stringify(content),row.id);
        log('change_request.approved');
        if (withoutEvidence) log('change_request.approved_without_evidence');
        event('first_approval',{ws:principal.wsId,user:actor,at:time});
        return content;
      };
      const launch = (content,approvedBy) => {
        run("UPDATE v2_change_requests SET launch = 'launched', launch_by = ?, launch_at = ?, updated_at = ? WHERE id = ?",actor,time,time,row.id);
        const written = writeGoalVersion(goal,content,actor,time,approvedBy);
        run('UPDATE v2_change_requests SET version = ? WHERE id = ?',written.version,row.id);
        log('change_request.launched');
        event('first_launch',{ws:principal.wsId,user:actor,at:time});
      };
      switch (action) {
        case 'approve': approve(); break;
        case 'approve_and_launch': { const content = approve(); launcherOnly(); launch(content,actor); break; }
        case 'launch': {
          launcherOnly(); launchable(); expectRevision();
          const content = JSON.parse(row.approved_json);
          checkHiddenAndLoop('launch'); launch(content,row.approved_by); break;
        }
        case 'not_yet': {
          launcherOnly(); launchable(); expectRevision();
          if (row.launch === 'not_yet') throw conflict('wrong_state',`${row.launch_by === actor ? 'You' : row.launch_by ? memberName(row.launch_by) : 'Someone'} already decided not yet, so nothing changes: agents stay on version ${row.base_version} until someone launches version ${row.base_version + 1}.`);
          run("UPDATE v2_change_requests SET launch = 'not_yet', launch_by = ?, launch_at = ?, updated_at = ? WHERE id = ?",actor,time,time,row.id);
          log('change_request.not_yet'); break;
        }
        case 'acknowledge': {
          requesterOnly(); stateOnly(['pending','approved']);
          const counter = latestCounter(revisionsFor(row.id));
          if (!counter?.condition) throw conflict('no_condition','This request has no condition to acknowledge.');
          if (body.revision !== undefined && body.revision !== counter.revision) throw conflict('stale_revision',`This request changed after you read it: its condition is now on revision ${counter.revision}. Read the condition again before you confirm it.`);
          if (counter.acknowledged_by) throw conflict('already_acknowledged','You already confirmed this condition.');
          run('UPDATE v2_change_request_revisions SET acknowledged_by = ?, acknowledged_at = ? WHERE change_request_id = ? AND revision = ?',actor,time,row.id,counter.revision);
          run('UPDATE v2_change_requests SET updated_at = ? WHERE id = ?',time,row.id);
          log('change_request.condition_acknowledged'); break;
        }
        case 'reject': {
          approverOnly(); stateOnly(['pending','countered']); expectRevision();
          const reason = str(body,'reason',2000);
          run("UPDATE v2_change_requests SET state = 'rejected', rejected_by = ?, decision_note = ?, decided_at = ?, updated_at = ? WHERE id = ?",actor,reason,time,time,row.id);
          log('change_request.rejected'); break;
        }
        case 'counter': {
          approverOnly(); stateOnly(['pending']); expectRevision();
          const note = str(body,'note',2000);
          const condition = body.condition !== undefined && body.condition !== null ? str(body,'condition',2000) : null;
          const base = versionContentOf(principal.wsId,goal.id,row.base_version);
          const current = applied(base,changes);
          const hidden = unreadableGoals(principal,current.depends_on);
          let input = body.changes;
          if (input && typeof input === 'object' && !Array.isArray(input) && input.depends_on === undefined && sortedIds(hidden) !== sortedIds(unreadableGoals(principal,base.depends_on))) {
            const hiddenBase = unreadableGoals(principal,base.depends_on);
            input = {...input,depends_on:base.depends_on.filter(id => !hiddenBase.includes(id))};
          }
          let proposed;
          try { proposed = changesIn(principal,goal.id,base,input,current.depends_on); }
          catch (error) { if (error instanceof V2Error && error.code === 'no_change') throw conflict('no_change',counterNoChange(row.base_version,goal.version)); throw error; }
          if (condition === null && sameContent(applied(base,proposed),current)) throw conflict('no_change',counterSameAsRequest(memberName(row.requester_id),row.base_version,goal.version));
          const already = [...base.depends_on,...current.depends_on];
          assertDependenciesVisible(principal.wsId,base,proposed,[row.requester_id],'counter',already);
          assertDependenciesVisible(principal.wsId,base,proposed,effectiveSet(goal,row.requester_id),'counter_approvers',already);
          const next = row.revision + 1;
          writeRevision(principal.wsId,goal.id,row.id,next,row.base_version,proposed,note,actor,time,condition);
          run("UPDATE v2_change_requests SET state = 'countered', revision = ?, changes_json = ?, updated_at = ? WHERE id = ?",next,JSON.stringify(proposed),time,row.id);
          log('change_request.countered'); break;
        }
        case 'accept_counter':
          requesterOnly(); stateOnly(['countered']); expectRevision();
          run("UPDATE v2_change_requests SET state = 'pending', updated_at = ? WHERE id = ?",time,row.id);
          log('change_request.counter_accepted'); break;
        case 'withdraw':
          requesterOnly(); stateOnly(['pending','countered']); expectRevision();
          run("UPDATE v2_change_requests SET state = 'withdrawn', updated_at = ? WHERE id = ?",time,row.id);
          log('change_request.withdrawn'); break;
        case 'rebase': {
          requesterOnly(); stateOnly(['pending']); expectRevision();
          const version = nonNegInt(body,'base_version');
          if (version !== goal.version) throw conflict('stale_version',`The goal changed after you read it: it is now at version ${goal.version}. Update your request to that version.`);
          const own = body.changes === undefined;
          const proposed = changesIn(principal,goal.id,contentOf(goal),own ? changes : body.changes,contentOf(goal).depends_on,own);
          const hidden = hiddenAddedDependency(principal.wsId,contentOf(goal).depends_on,proposed,effectiveSet(goal,row.requester_id));
          if (hidden) {
            let message = proposalRefusal;
            if (body.changes === undefined) {
              const author = dependencyAddedBy(revisionsFor(row.id),hidden);
              if (author && author !== row.requester_id) message = `Someone who decides on this goal can't see a goal that ${memberName(author)}'s suggestion added as a dependency, so they couldn't see what they approve. Withdraw this request and propose the change again without it, or ask that goal's owner to share it with them first.`;
            }
            throw conflict('dependency_not_visible',message);
          }
          const next = row.revision + 1;
          writeRevision(principal.wsId,goal.id,row.id,next,goal.version,proposed,null,actor,time);
          run('UPDATE v2_change_requests SET revision = ?, base_version = ?, changes_json = ?, updated_at = ? WHERE id = ?',next,goal.version,JSON.stringify(proposed),time,row.id);
          log('change_request.rebased'); break;
        }
      }
    });
    return requestView(rowFor(principal.wsId,requestId),principal);
  }
  async function addEvidence(principal,goalId,requestId,body,source) {
    visibleRequest(principal,requestId,goalId); viewerCheck(principal);
    const input = evidenceInput(body);
    const time = nowIso();
    const id = await tx(() => {
      const row = rowFor(principal.wsId,requestId);
      const goal = goalRow(principal.wsId,row.goal_id);
      const approvers = effectiveSet(goal,row.requester_id);
      if (row.requester_id !== principal.userId && !approvers.includes(principal.userId)) throw forbidden('not_involved','Only the person who asked or someone who can approve can add evidence.');
      if (!isOpen(row)) throw conflict('wrong_state',stateRefusal(row,principal.userId));
      if (body.revision !== undefined && body.revision !== row.revision) throw conflict('stale_revision',revisionRefusal(row,principal.userId,'Add the link again if it supports that revision.'));
      if (get('SELECT 1 AS x FROM v2_change_request_evidence WHERE change_request_id = ? AND revision = ? AND url = ?',row.id,row.revision,input.url)) throw conflict('duplicate_evidence',`This link is already on revision ${row.revision}, so it isn't added twice.`);
      if (evidenceCount(row.id,row.revision) >= EVIDENCE_PER_REVISION) throw conflict('too_much_evidence',`A revision holds at most ${EVIDENCE_PER_REVISION} evidence links; remove one to add another.`);
      const id = newId('ev');
      run('INSERT INTO v2_change_request_evidence (id, ws_id, change_request_id, revision, kind, url, label, source, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',id,principal.wsId,row.id,row.revision,input.kind,input.url,input.label,source,principal.userId,time);
      run('UPDATE v2_change_requests SET updated_at = ? WHERE id = ?',time,row.id);
      audit(principal.wsId,principal.userId,'change_request.evidence_added',row.id,time);
      return id;
    });
    const view = requestView(rowFor(principal.wsId,requestId),principal);
    return {evidence:view.revisions.flatMap(r => r.evidence).find(e => e.id === id),change_request:view};
  }
  async function removeEvidence(principal,goalId,requestId,evidenceId) {
    visibleRequest(principal,requestId,goalId); viewerCheck(principal);
    const time = nowIso();
    await tx(() => {
      const row = rowFor(principal.wsId,requestId);
      const evidence = get('SELECT revision, added_by FROM v2_change_request_evidence WHERE id = ? AND change_request_id = ?',evidenceId,row.id);
      if (!evidence) throw notFound();
      if (evidence.added_by !== principal.userId) throw forbidden('not_evidence_author','Only the person who added this link can remove it.');
      if (!mayRemoveEvidence(principal,row,evidence)) throw conflict('evidence_frozen',isOpen(row) ? `This link is on revision ${evidence.revision}, and the request has moved on to revision ${row.revision}, so the link is kept as it was.` : stateRefusal(row,principal.userId));
      run('DELETE FROM v2_change_request_evidence WHERE id = ?',evidenceId);
      run('UPDATE v2_change_requests SET updated_at = ? WHERE id = ?',time,row.id);
      audit(principal.wsId,principal.userId,'change_request.evidence_removed',row.id,time);
    });
    return requestView(rowFor(principal.wsId,requestId),principal);
  }
  function requestView(row,principal) {
    const goal = goalRow(row.ws_id,row.goal_id);
    const readable = ids => ids.filter(id => { const g = goalRow(row.ws_id,id); return g && canReadGoal(principal,goalObj(g)); });
    const shown = content => content.depends_on ? {...content,depends_on:readable(content.depends_on)} : content;
    const hiddenCount = ids => ids.length - readable(ids).length;
    const pick = content => shown(Object.fromEntries(fields.map(k => [k,content[k]])));
    const changes = JSON.parse(row.changes_json);
    const fields = CHANGE_KEYS.filter(k => k in changes);
    const base = versionContentOf(row.ws_id,row.goal_id,row.base_version);
    const result = row.state === 'approved' && row.version ? versionContentOf(row.ws_id,row.goal_id,row.version) : null;
    const after = result ?? applied(base,changes);
    const approvers = effectiveSet(goal,row.requester_id);
    const launchers = launchSet(goal,row.requester_id);
    const reader = principal.userId;
    const isRequester = row.requester_id === reader;
    const isApprover = approvers.includes(reader);
    const open = isOpen(row);
    const unlaunched = row.state === 'approved' && (row.launch === 'pending' || row.launch === 'not_yet');
    const revisionRows = revisionsFor(row.id);
    const counter = latestCounter(revisionRows);
    const condition = counter?.condition ? {revision:counter.revision,text:counter.condition,acknowledged_by:person(counter.acknowledged_by),acknowledged_at:counter.acknowledged_at} : null;
    const approvable = row.state === 'pending' && isApprover && row.base_version === goal.version && principal.wsRole !== 'viewer';
    const launchable = unlaunched && launchers.includes(reader) && row.base_version === goal.version && principal.wsRole !== 'viewer';
    const hidden = approvable ? hiddenDependencyRefusal(principal,row,'approve') : launchable ? hiddenDependencyRefusal(principal,row,'launch') : null;
    const loop = dependencyLoop(row,goal,principal.userId);
    const can = {
      approve:approvable && !hidden && !loop,
      approve_and_launch:approvable && !hidden && !loop,
      reject:open && isApprover,
      counter:row.state === 'pending' && isApprover,
      accept_counter:row.state === 'countered' && isRequester,
      acknowledge:(row.state === 'pending' || row.state === 'approved') && isRequester && !!condition && !condition.acknowledged_by,
      withdraw:open && isRequester,
      rebase:row.state === 'pending' && isRequester,
      add_evidence:mayAddEvidence(principal,row,approvers),
      launch:launchable && !hidden && !loop,
      not_yet:launchable && row.launch !== 'not_yet'
    };
    if (principal.wsRole === 'viewer') for (const key of Object.keys(can)) can[key] = false;
    const evidence = evidenceRows(row.id);
    const revisions = revisionRows.map(r => ({revision:r.revision,base_version:r.base_version,changes:shown(JSON.parse(r.changes_json)),note:r.note,condition:r.condition,acknowledged_by:person(r.acknowledged_by),acknowledged_at:r.acknowledged_at,author:person(r.author_id),created_at:r.created_at,evidence:evidence.filter(e => e.revision === r.revision).map(e => evidenceView(e,mayRemoveEvidence(principal,row,e))),snapshot:snapshotView(principal,r.snapshot_json,r.revision)}));
    return {
      id:row.id,goal:{id:goal.id,title:goal.title,version:goal.version},state:row.state,revision:row.revision,base_version:row.base_version,behind:open && row.base_version !== goal.version,
      requester:person(row.requester_id),changes:shown(changes),reason:row.reason,revisions,
      diff:{before:pick(base),after:pick(after),hidden_depends_on:fields.includes('depends_on') ? {before:hiddenCount(base.depends_on),after:hiddenCount(after.depends_on)} : null},
      approvers:approvers.map(person),launchers:launchers.map(person),approved_by:person(row.approved_by),rejected_by:person(row.rejected_by),decision_note:row.decision_note,
      note:row.state === 'approved' ? row.decision_note : null,rejection_reason:row.state === 'rejected' ? row.decision_note : null,version:row.version,launch:row.launch ?? null,
      launch_decided_by:person(row.launch_by),launch_decided_at:row.launch_at,condition,evidence_count:evidence.filter(e => e.revision === row.revision).length,
      approved_without_evidence:row.state === 'approved' && row.approved_without_evidence !== null ? row.approved_without_evidence === 1 : null,
      can,state_note:stateRefusal(row,reader),dependency_not_visible:hidden,dependency_loop:loop,
      waiting_on_me:can.approve || can.accept_counter || can.launch || (!!loop && row.state === 'pending' && row.base_version === goal.version && can.counter),
      created_at:row.created_at,updated_at:row.updated_at,decided_at:row.decided_at
    };
  }
  function listChangeRequests(principal,opts={}) {
    const state = opts.state;
    const filtered = state !== undefined && state !== null && state !== '';
    if (filtered && !CHANGE_REQUEST_STATES.includes(state)) throw badRequest(`state must be one of ${CHANGE_REQUEST_STATES.join(', ')}`);
    if (opts.goalId) visibleGoal(principal,opts.goalId);
    const rows = opts.goalId ? all('SELECT * FROM v2_change_requests WHERE ws_id = ? AND goal_id = ? ORDER BY updated_at DESC, id',principal.wsId,opts.goalId) : all('SELECT * FROM v2_change_requests WHERE ws_id = ? ORDER BY updated_at DESC, id',principal.wsId);
    const permissions = new Map();
    function readable(id) {
      if (!permissions.has(id)) { const goal = goalRow(principal.wsId,id); permissions.set(id,!!goal && canReadGoal(principal,goalObj(goal))); }
      return permissions.get(id);
    }
    return rows.filter(r => (!filtered || r.state === state) && readable(r.goal_id)).map(r => requestView(r,principal));
  }
  function changeRequestGroups(principal,state) {
    const views = listChangeRequests(principal,{state});
    return {waiting_on_me:views.filter(v => v.waiting_on_me),mine:views.filter(v => !v.waiting_on_me && v.requester.id === principal.userId),others:views.filter(v => !v.waiting_on_me && v.requester.id !== principal.userId)};
  }
  function getChangeRequest(principal,requestId,goalId) { return requestView(visibleRequest(principal,requestId,goalId),principal); }
  function assertChangeRequestAction(action) { if (!CHANGE_REQUEST_ACTIONS.includes(action)) throw notFound(); return action; }
  function requestCondition(requestId) {
    const counter = latestCounter(revisionsFor(requestId));
    if (!counter?.condition) return null;
    return {revision:counter.revision,text:counter.condition,acknowledged_by:counter.acknowledged_by ? {id:counter.acknowledged_by,name:memberName(counter.acknowledged_by)} : null,acknowledged_at:counter.acknowledged_at};
  }
  return {CHANGE_REQUEST_STATES,CHANGE_REQUEST_ACTIONS,LAUNCH_STATES,dependencyChoices,dependencyLoops,counterBase,versionLoops,insertChangeRequest,createChangeRequest,actOnChangeRequest,addEvidence,removeEvidence,listChangeRequests,changeRequestGroups,getChangeRequest,assertChangeRequestAction,requestCondition};
}
module.exports = {create_changes};
