'use strict';

function create_alignments(resources) {
  const {all, audit, get, run, tx, badRequest, conflict, forbidden, notFound, newId, nowIso,
    effectiveSet, goalCore, goalObj, goalRow, parentIds, reviewParents, visibleGoal,
    canBind, canReadGoal, writeDirective, holdNewlyBound, openEpoch, sessionRow,
    memberName, nameTo, need, assertRevisionReached, oneOf, optStr, revisionRead,
    strList} = resources;
  const ACTIONS = ['approve', 'counter', 'accept_counter', 'reject', 'withdraw', 'revoke'];
  const effectsOf = choice => choice === 'contribution' ? ['contributes_to'] : ['contributes_to', 'governing_goal', 'allocation_transfer'];
  function revisionOf(id, revision) {
    return get('SELECT * FROM v2_alignment_revisions WHERE alignment_id = ? AND revision = ?', id, revision);
  }
  function approvalRows(id, revision) {
    return all('SELECT user_id FROM v2_alignment_approvals WHERE alignment_id = ? AND revision = ? ORDER BY at, rowid', id, revision);
  }
  function formatRequirements(revision, approvals) {
    const raw = JSON.parse(revision.approvers_json);
    const requirements = raw.map(r => typeof r === 'string' ? {for: null, set: [r], approved_by: null} : {...r, approved_by: r.approved_by ?? null});
    for (const r of requirements) {
      if (!r.approved_by) r.approved_by = approvals.find(a => r.set.includes(a.user_id))?.user_id ?? null;
    }
    return requirements;
  }
  function currentRequirements(id, revision) {
    const row = revisionOf(id, revision);
    const approvals = approvalRows(id, revision);
    return formatRequirements(row, approvals);
  }
  function approversOf(requirements) {
    return [...new Set(requirements.flatMap(r => r.set))].sort();
  }
  function keysOf(id, revision) {
    return all('SELECT session_key FROM v2_alignment_sessions WHERE alignment_id = ? AND revision = ? ORDER BY session_key', id, revision).map(r => r.session_key);
  }
  function approvalsOf(id, revision) {
    return new Set(all('SELECT user_id FROM v2_alignment_approvals WHERE alignment_id = ? AND revision = ?', id, revision).map(r => r.user_id));
  }
  function recordApproval(ws, id, revision, user, time) {
    run('INSERT OR IGNORE INTO v2_alignment_approvals (ws_id, alignment_id, revision, user_id, at) VALUES (?, ?, ?, ?, ?)', ws, id, revision, user, time);
    const requirements = currentRequirements(id, revision);
    run('UPDATE v2_alignment_revisions SET approvers_json = ? WHERE alignment_id = ? AND revision = ?', JSON.stringify(requirements), id, revision);
  }
  function requirementsFor(target, source, choice, sessions, requester) {
    const result = [];
    function add(forId, set) {
      if (!result.some(r => r.for === forId)) result.push({for: forId, set: [...new Set(set)].sort(), approved_by: null});
    }
    add(target.id, effectiveSet(target, requester));
    if (source) add(source.id, effectiveSet(source, requester));
    if (effectsOf(choice).includes('allocation_transfer')) {
      for (const s of sessions) add(`sessions:${s.user_id}`, [s.user_id]);
      for (const s of sessions) {
        const epoch = openEpoch(s.ws_id, s.session_key);
        const goal = epoch?.goal_id ? goalRow(s.ws_id, epoch.goal_id) : null;
        if (goal) add(goal.id, effectiveSet(goal, requester));
      }
    }
    return result;
  }
  function writeRevision(ref, revision, choice, keys, requirements, note, author, time) {
    run('INSERT INTO v2_alignment_revisions (ws_id, alignment_id, revision, choice, effects_json, approvers_json, note, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', ref.ws, ref.id, revision, choice, JSON.stringify(effectsOf(choice)), JSON.stringify(requirements), note, author, time);
    for (const key of keys) run('INSERT INTO v2_alignment_sessions (ws_id, alignment_id, revision, session_key) VALUES (?, ?, ?, ?)', ref.ws, ref.id, revision, key);
    if (approversOf(requirements).includes(author)) recordApproval(ref.ws, ref.id, revision, author, time);
  }
  function involved(a) {
    const ids = new Set([a.requester_id]);
    for (const r of all('SELECT approvers_json FROM v2_alignment_revisions WHERE alignment_id = ?', a.id)) {
      for (const id of approversOf(formatRequirements(r, []))) ids.add(id);
    }
    return [...ids];
  }
  function visibleAlignment(pp, id) {
    const a = get('SELECT * FROM v2_alignments WHERE ws_id = ? AND id = ?', pp.wsId, id);
    if (!a) throw notFound();
    need(pp, 'alignment.read', {kind: 'alignment', involved: involved(a)});
    return a;
  }
  function cycle(ws, source, target) {
    const stack = [target], seen = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (id === source) throw conflict('cycle', 'Approving this would make these goals contribute to each other in a loop.');
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...parentIds(ws, id));
    }
  }
  function refuseGoverned(ws, keys, exclude, target) {
    const governed = keys.map(k => sessionRow(ws, k)).filter(s => s?.governing_alignment_id && s.governing_alignment_id !== exclude);
    if (!governed.length) return;
    if (governed.every(s => s.governing_goal_id === target)) {
      throw conflict('already_governed', governed.length === keys.length && keys.length === 1
        ? 'This session already follows this goal through an alignment, so there is nothing to change.'
        : 'One of these sessions already follows this goal through an alignment; leave it out.');
    }
    throw conflict('already_governed', 'One of these sessions already follows another goal through an alignment; revoke that one first.');
  }
  function maybeApprove(a, actor, time) {
    const revision = revisionOf(a.id, a.revision);
    const requirements = currentRequirements(a.id, a.revision);
    if (!requirements.every(r => r.approved_by)) return false;
    if (a.source_goal_id) cycle(a.ws_id, a.source_goal_id, a.target_goal_id);
    const keys = keysOf(a.id, a.revision);
    if (revision.choice === 'work_toward') {
      refuseGoverned(a.ws_id, keys, a.id, a.target_goal_id);
      const target = goalRow(a.ws_id, a.target_goal_id);
      const core = goalCore(target);
      for (const key of keys) {
        const s = sessionRow(a.ws_id, key);
        if (!s || s.state === 'stopped') continue;
        run('UPDATE v2_sessions SET governing_goal_id = ?, governing_alignment_id = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?', target.id, a.id, time, a.ws_id, key);
        writeDirective(a.ws_id, 'binding_changed', [key], core, {goal_id: target.id, effective: 'next_root_turn', cause: `alignment:${a.id}`});
        holdNewlyBound(a.ws_id, target.id, key);
      }
    }
    run("UPDATE v2_alignments SET state = 'approved', decided_at = ?, updated_at = ? WHERE id = ?", time, time, a.id);
    if (a.source_goal_id) reviewParents(a.ws_id, a.source_goal_id, time, a.target_goal_id);
    audit(a.ws_id, actor, 'alignment.approved', a.id, time);
    return true;
  }
  function insertAlignment(pp, target, source, choice, sessions, note, time) {
    const id = newId('al');
    run("INSERT INTO v2_alignments (id, ws_id, requester_id, target_goal_id, source_goal_id, state, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', 1, ?, ?)", id, pp.wsId, pp.userId, target.id, source?.id ?? null, time, time);
    writeRevision({id, ws: pp.wsId}, 1, choice, sessions.map(s => s.session_key), requirementsFor(target, source, choice, sessions, pp.userId), note, pp.userId, time);
    audit(pp.wsId, pp.userId, 'alignment.requested', id, time);
    maybeApprove(get('SELECT * FROM v2_alignments WHERE ws_id = ? AND id = ?', pp.wsId, id), pp.userId, time);
    return id;
  }
  async function createAlignment(pp, body) {
    need(pp, 'alignment.create');
    const target = visibleGoal(pp, typeof body.target_goal_id === 'string' ? body.target_goal_id : '');
    if (target.status !== 'active') throw conflict('goal_not_active', 'That goal is achieved or dropped, so nothing can align with it.');
    const sourceId = optStr(body, 'source_goal_id', 64);
    const source = sourceId ? visibleGoal(pp, sourceId) : null;
    if (source) {
      if (source.id === target.id) throw badRequest("A goal can't align with itself");
      if (!canBind(pp, goalObj(source), false)) throw forbidden('source_not_yours', "The source goal must be yours or your team's.");
      if (source.status !== 'active') throw conflict('goal_not_active', "Your goal is achieved or dropped, so it can't contribute to another goal.");
      cycle(pp.wsId, source.id, target.id);
    }
    const choice = oneOf(body, 'choice', ['contribution', 'work_toward']);
    const keys = strList(body, 'session_keys', {max: 50, itemMax: 43});
    const owner = pp.userId;
    const sessions = keys.map(key => {
      const s = sessionRow(pp.wsId, key);
      if (!s || s.user_id !== owner) throw notFound();
      if (s.state === 'stopped') throw conflict('sharing_stopped', "One of these sessions is no longer shared, so it can't be part of an alignment.");
      return s;
    });
    if (choice === 'work_toward' && !sessions.length) throw badRequest('Pick at least one of your shared sessions to work toward this goal');
    if (choice === 'contribution' && !sessions.length && !source) throw badRequest('Pick a goal of yours or at least one session that contributes');
    if (choice === 'work_toward') refuseGoverned(pp.wsId, keys, null, target.id);
    const note = optStr(body, 'note', 1000);
    const time = nowIso();
    const id = await tx(() => insertAlignment(pp, target, source, choice, sessions, note, time));
    return view(pp, get('SELECT * FROM v2_alignments WHERE ws_id = ? AND id = ?', pp.wsId, id));
  }
  function counterAuthor(a) {
    return a.state === 'countered' ? revisionOf(a.id, a.revision).author_id : null;
  }
  function declinedBy(a) {
    return get('SELECT actor_id FROM v2_audit WHERE ws_id = ? AND object_id = ? AND action = ? ORDER BY at DESC LIMIT 1', a.ws_id, a.id, 'alignment.rejected')?.actor_id;
  }
  function stateMessage(a, me) {
    switch (a.state) {
      case 'pending': return 'This request is waiting for approval.';
      case 'countered': return `${counterAuthor(a) === me ? 'You countered this request' : 'An approver suggested a change to this request'}; it waits on ${nameTo(a.requester_id, me)} to accept it.`;
      case 'approved': return 'This request is already approved.';
      case 'rejected': {
        const actor = declinedBy(a);
        return actor === me ? 'You declined this request, so nothing changes.' : `This request was declined${actor ? ` by ${memberName(actor)}` : ''}, so nothing changes.`;
      }
      case 'withdrawn': return a.requester_id === me ? 'You withdrew this request, so nothing changes.' : `This request was withdrawn by ${memberName(a.requester_id)}, so nothing changes.`;
      case 'revoked': {
        const actor = get('SELECT revoked_by FROM v2_alignments WHERE id = ?', a.id)?.revoked_by;
        return actor === me ? 'You revoked this alignment.' : `This alignment was revoked${actor ? ` by ${memberName(actor)}` : ''}.`;
      }
    }
  }
  function checkState(a, states, seen, me) {
    if (!states.includes(a.state)) throw conflict('wrong_state', stateMessage(a, me));
    if (seen !== a.revision) {
      const author = counterAuthor(a);
      throw conflict('stale_revision', `This request changed after you read it: ${author ? `${nameTo(author, me)} countered it, and it is now` : 'it is now'} at revision ${a.revision}. Read it again and decide again.`);
    }
  }
  function refuseClosedGoals(pp, a) {
    for (const [id, why] of [[a.target_goal_id, 'so nothing can align with it'], [a.source_goal_id, "so it can't contribute to another goal"]]) {
      if (!id) continue;
      const g = goalRow(a.ws_id, id);
      if (g && g.status !== 'active') {
        const what = canReadGoal(pp, goalObj(g)) ? `"${g.title}"` : 'A goal in this request';
        throw conflict('goal_not_active', `${what} was ${g.status} after the request was made, ${why}. Decline or withdraw this request instead.`);
      }
    }
  }
  async function actOnAlignment(pp, id, action, body) {
    const before = visibleAlignment(pp, id);
    if (pp.wsRole === 'viewer') throw forbidden('read_only', 'Viewers can look but not change anything.');
    const seen = revisionRead(body);
    const me = pp.userId, time = nowIso();
    await tx(() => {
      const a = get('SELECT * FROM v2_alignments WHERE ws_id = ? AND id = ?', pp.wsId, id);
      assertRevisionReached('request', seen, a.revision);
      if (a.revision !== before.revision || a.state !== before.state) throw conflict('stale_revision', 'This request changed while your decision was being sent. Read it again and decide again.');
      const revision = revisionOf(a.id, a.revision);
      const requirements = currentRequirements(a.id, a.revision);
      const isRequester = a.requester_id === me;
      const isApprover = approversOf(requirements).includes(me);
      if (action === 'approve') {
        checkState(a, ['pending'], seen, me);
        if (!isApprover) throw forbidden('not_an_approver', 'Your approval is not needed on this request.');
        refuseClosedGoals(pp, a);
        recordApproval(a.ws_id, a.id, a.revision, me, time);
        run('UPDATE v2_alignments SET updated_at = ? WHERE id = ?', time, a.id);
        maybeApprove(a, me, time);
      } else if (action === 'counter') {
        checkState(a, ['pending'], seen, me);
        if (!isApprover || isRequester) throw forbidden('not_an_approver', 'Only an approver can suggest a change.');
        refuseClosedGoals(pp, a);
        const previous = keysOf(a.id, a.revision);
        const choice = body.choice === undefined ? revision.choice : oneOf(body, 'choice', ['contribution', 'work_toward']);
        let keys;
        if (Array.isArray(body.keep)) {
          if (!body.keep.every(i => Number.isInteger(i) && i >= 0 && i < previous.length)) throw badRequest('keep must list session refs from this revision');
          keys = previous.filter((k, i) => body.keep.includes(i));
        } else keys = body.session_keys === undefined ? previous : strList(body, 'session_keys', {max: 50, itemMax: 43});
        if (keys.some(k => !previous.includes(k))) throw badRequest('A counter can only keep or remove sessions from the request');
        if (choice === 'work_toward' && !keys.length) throw badRequest('Working toward a goal needs at least one session');
        const target = goalRow(a.ws_id, a.target_goal_id);
        const source = a.source_goal_id ? goalRow(a.ws_id, a.source_goal_id) : null;
        if (choice === 'contribution' && !keys.length && !source) throw badRequest('Keep at least one session or the source goal');
        const sessions = keys.map(k => sessionRow(a.ws_id, k)).filter(Boolean);
        const next = a.revision + 1;
        writeRevision({id: a.id, ws: a.ws_id}, next, choice, keys, requirementsFor(target, source, choice, sessions, a.requester_id), optStr(body, 'note', 1000), me, time);
        run("UPDATE v2_alignments SET state = 'countered', revision = ?, updated_at = ? WHERE id = ?", next, time, a.id);
        audit(a.ws_id, me, 'alignment.countered', a.id, time);
      } else if (action === 'accept_counter') {
        checkState(a, ['countered'], seen, me);
        if (!isRequester) throw forbidden('not_requester', 'Only the person who asked can accept a suggested change.');
        refuseClosedGoals(pp, a);
        if (isApprover) recordApproval(a.ws_id, a.id, a.revision, me, time);
        run("UPDATE v2_alignments SET state = 'pending', updated_at = ? WHERE id = ?", time, a.id);
        maybeApprove({...a, state: 'pending'}, me, time);
      } else if (action === 'reject') {
        checkState(a, ['pending', 'countered'], seen, me);
        if (!isApprover || isRequester) throw forbidden('not_an_approver', 'Only an approver can decline.');
        run("UPDATE v2_alignments SET state = 'rejected', decided_at = ?, updated_at = ? WHERE id = ?", time, time, a.id);
        audit(a.ws_id, me, 'alignment.rejected', a.id, time);
      } else if (action === 'withdraw') {
        checkState(a, ['pending', 'countered'], seen, me);
        if (!isRequester) throw forbidden('not_requester', 'Only the person who asked can withdraw.');
        run("UPDATE v2_alignments SET state = 'withdrawn', decided_at = ?, updated_at = ? WHERE id = ?", time, time, a.id);
        audit(a.ws_id, me, 'alignment.withdrawn', a.id, time);
      } else if (action === 'revoke') {
        checkState(a, ['approved'], seen, me);
        if (!isRequester && !isApprover) throw forbidden('not_an_approver', 'Only the person who asked or an approver can revoke.');
        run("UPDATE v2_alignments SET state = 'revoked', revoked_at = ?, revoked_by = ?, updated_at = ? WHERE id = ?", time, me, time, a.id);
        if (revision.choice === 'work_toward') endGovernance(a, time, `alignment:${a.id}`);
        audit(a.ws_id, me, 'alignment.revoked', a.id, time);
      }
    });
    return view(pp, get('SELECT * FROM v2_alignments WHERE ws_id = ? AND id = ?', pp.wsId, id));
  }
  function endGovernance(a, time, cause) {
    run('UPDATE v2_sessions SET governing_goal_id = NULL, governing_alignment_id = NULL, updated_at = ? WHERE ws_id = ? AND governing_alignment_id = ?', time, a.ws_id, a.id);
    const suspended = all("SELECT session_key FROM v2_epochs WHERE ws_id = ? AND ends_at IS NULL AND authority = 'alignment' AND alignment_id = ?", a.ws_id, a.id).map(r => r.session_key);
    for (const key of suspended) {
      run('UPDATE v2_epochs SET ends_at = ? WHERE ws_id = ? AND session_key = ? AND ends_at IS NULL', time, a.ws_id, key);
      run("UPDATE v2_sessions SET state = 'suspended', updated_at = ? WHERE ws_id = ? AND session_key = ? AND state = 'shared'", time, a.ws_id, key);
    }
    writeDirective(a.ws_id, 'binding_suspended', suspended, null, {goal_id: a.target_goal_id, effective: 'next_root_turn', cause});
  }
  function endAlignmentsToClosedGoal(ws, targetId, actor, time) {
    for (const a of all("SELECT * FROM v2_alignments WHERE ws_id = ? AND target_goal_id = ? AND state = 'approved'", ws, targetId)) {
      if (revisionOf(a.id, a.revision).choice !== 'work_toward') continue;
      endGovernance(a, time, `goal_closed:${a.id}`);
      audit(ws, actor, 'alignment.goal_closed', a.id, time);
    }
  }
  function goalLabel(pp, id) {
    if (!id) return null;
    const g = goalRow(pp.wsId, id);
    if (!g || !canReadGoal(pp, goalObj(g))) return {id: null, title: null, visible: false};
    return {id: g.id, title: g.title, visible: true};
  }
  const named = label => label?.visible ? `"${label.title}"` : "a goal you can't see";
  function view(pp, a) {
    const revision = revisionOf(a.id, a.revision);
    const requirements = currentRequirements(a.id, a.revision);
    const approvers = approversOf(requirements);
    const approved = approvalsOf(a.id, a.revision);
    const keys = keysOf(a.id, a.revision);
    const target = goalLabel(pp, a.target_goal_id), source = goalLabel(pp, a.source_goal_id);
    const sessions = keys.map((key, ref) => {
      const s = sessionRow(a.ws_id, key);
      if (!s) return null;
      const mine = s.user_id === pp.userId;
      const epoch = openEpoch(a.ws_id, key);
      return {ref, session_key: mine ? s.session_key : null,
        owner: {id: s.user_id, name: memberName(s.user_id)},
        label: mine ? s.title || s.repo_alias || `${s.harness} session` : s.repo_alias ? `${s.repo_alias} (${s.harness})` : `a ${s.harness} session`,
        started_at: s.started_at, key_end: s.session_key.slice(-6), current_goal: goalLabel(pp, epoch?.goal_id ?? null)};
    }).filter(Boolean);
    const n = sessions.length;
    const who = n === 1 ? 'this session' : `these ${n} sessions`;
    const kinds = JSON.parse(revision.effects_json);
    const following = a.state === 'approved' && kinds.includes('governing_goal') ? keys.filter(k => sessionRow(a.ws_id, k)?.governing_alignment_id === a.id).length : n;
    const gone = n - following;
    const currentTarget = goalRow(a.ws_id, a.target_goal_id);
    const closed = a.state === 'approved' && currentTarget && currentTarget.status !== 'active' ? currentTarget.status : null;
    const movesUsage = kinds.includes('allocation_transfer');
    const effects = kinds.map(kind => {
      let text;
      if (kind === 'contributes_to') {
        const subject = a.source_goal_id ? `${named(source)} contributes` : n === 1 ? 'this session contributes' : `these ${n} sessions contribute`;
        text = `Records that ${subject} to ${named(target)}.${movesUsage ? '' : ' No usage moves.'}`;
      } else if (kind === 'governing_goal') {
        if (closed) text = `${n === 1 ? 'This session no longer follows' : `These ${n} sessions no longer follow`} ${named(target)}: that goal was ${closed}.`;
        else if (!gone) text = n === 1 ? `This session follows ${named(target)}: its agent gets that goal and its changes.` : `These ${n} sessions follow ${named(target)}: their agents get that goal and its changes.`;
        else if (!following) text = n === 1 ? `This session no longer follows ${named(target)}: it moved to another goal or stopped sharing.` : `These ${n} sessions no longer follow ${named(target)}: they moved to another goal or stopped sharing.`;
        else text = following === 1 ? `1 of these ${n} sessions still follows ${named(target)}: its agent gets that goal and its changes. The other ${gone} moved to another goal or stopped sharing.` : `${following} of these ${n} sessions still follow ${named(target)}: their agents get that goal and its changes. The other ${gone} moved to another goal or stopped sharing.`;
      } else {
        if (closed) text = `Future usage from ${who} no longer counts under ${named(target)}: that goal was ${closed}. Past usage stays where it is.`;
        else if (!gone) text = `Future usage from ${who} counts under ${named(target)}. Past usage stays where it is.`;
        else if (!following) text = `Future usage from ${who} no longer counts under ${named(target)}. Past usage stays where it is.`;
        else text = `Future usage from the ${following} still following counts under ${named(target)}. Past usage stays where it is.`;
      }
      return {kind, text};
    });
    const me = pp.userId;
    const isRequester = a.requester_id === me, isApprover = approvers.includes(me);
    const goalsOpen = [a.target_goal_id, a.source_goal_id].every(id => !id || goalRow(a.ws_id, id)?.status === 'active');
    const can = {
      approve: a.state === 'pending' && isApprover && !approved.has(me) && goalsOpen,
      counter: a.state === 'pending' && isApprover && !isRequester && goalsOpen,
      reject: (a.state === 'pending' || a.state === 'countered') && isApprover && !isRequester,
      accept_counter: a.state === 'countered' && isRequester && goalsOpen,
      withdraw: (a.state === 'pending' || a.state === 'countered') && isRequester,
      revoke: a.state === 'approved' && (isRequester || isApprover)
    };
    if (pp.wsRole === 'viewer') for (const key of Object.keys(can)) can[key] = false;
    const closer = a.state === 'rejected' ? declinedBy(a) : a.state === 'withdrawn' ? a.requester_id : a.state === 'revoked' ? a.revoked_by : null;
    const history = all('SELECT * FROM v2_alignment_revisions WHERE alignment_id = ? ORDER BY revision', a.id).map(r => ({revision: r.revision, choice: r.choice, author: {id: r.author_id, name: memberName(r.author_id)}, note: r.note, created_at: r.created_at}));
    return {id: a.id, state: a.state, revision: a.revision, choice: revision.choice,
      requester: {id: a.requester_id, name: memberName(a.requester_id)}, target_goal: target, source_goal: source,
      sessions, effects,
      requirements: requirements.map(r => ({for: r.for && !r.for.startsWith('sessions:') ? goalLabel(pp, r.for)?.visible ? r.for : null : r.for,
        approvers: r.set.map(id => ({id, name: memberName(id)})), approved_by: r.approved_by ? {id: r.approved_by, name: memberName(r.approved_by)} : null})),
      approvers: approvers.map(id => ({id, name: memberName(id), approved: approved.has(id)})), note: revision.note, history,
      waiting_on_me: can.approve || can.accept_counter, can,
      closed_by: closer ? {id: closer, name: memberName(closer)} : null,
      closed_at: a.state === 'revoked' ? a.revoked_at : a.state === 'rejected' || a.state === 'withdrawn' ? a.decided_at : null,
      created_at: a.created_at, updated_at: a.updated_at};
  }
  function getAlignment(pp, id) { return view(pp, visibleAlignment(pp, id)); }
  function listAlignments(pp) {
    const views = all('SELECT * FROM v2_alignments WHERE ws_id = ? ORDER BY updated_at DESC', pp.wsId).filter(a => involved(a).includes(pp.userId)).map(a => view(pp, a));
    return {waiting_on_me: views.filter(a => a.waiting_on_me), mine: views.filter(a => a.requester.id === pp.userId && !a.waiting_on_me), others: views.filter(a => a.requester.id !== pp.userId && !a.waiting_on_me)};
  }
  function assertAction(action) {
    if (!ACTIONS.includes(action)) throw notFound();
    return action;
  }
  return {ACTIONS, createAlignment, insertAlignment, actOnAlignment, endAlignmentsToClosedGoal, getAlignment, listAlignments, assertAction};
}
module.exports = {create_alignments};
