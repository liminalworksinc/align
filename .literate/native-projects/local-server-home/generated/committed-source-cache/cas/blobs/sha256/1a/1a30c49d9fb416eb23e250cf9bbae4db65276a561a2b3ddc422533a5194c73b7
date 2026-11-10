'use strict';

function create_home(resources) {
  const { listGrants, config, listAlignments, listAsks, changeRequestGroups, all,
    goalRow, visibleGoals, alignmentWaits, appEvidence, changeWaits, launchWaits,
    memberName, readConsole } = resources;

  function section(read) {
    try { return read(); }
    catch (error) {
      if (config().hosted) readConsole().error('Home section error:', error?.name ?? 'unknown');
      else readConsole().error(error);
      return null;
    }
  }

  function workspaceHome(principal) {
    const me = principal.userId;
    const goals = section(() => visibleGoals(principal));
    const byId = new Map((goals ?? []).map(goal => [goal.id, goal]));
    function mine(id) {
      const goal = id && byId.get(id);
      return !!(goal && (goal.owner_id === me ||
        (goal.pod_id && principal.pods.has(goal.pod_id)) ||
        (principal.wsRole === 'owner' && goal.level === 'company')));
    }
    function teamName(id) {
      if (!id) return '';
      return all('SELECT name FROM v2_pods WHERE ws_id = ? AND id = ?', principal.wsId, id)[0]?.name ?? '';
    }
    function people(persons) {
      return [...new Map(persons.map(person => [person.id, person])).values()]
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    }
    const change_requests = section(() => {
      const groups = changeRequestGroups(principal);
      const views = [...groups.waiting_on_me, ...groups.mine, ...groups.others];
      const onMe = [], onOthers = [];
      for (const view of views) {
        function item(next, waiting_on) {
          return { id: view.id, goal: view.goal, state: view.state,
            requester: view.requester, reason: view.reason, next, waiting_on,
            updated_at: view.updated_at };
        }
        const launch = launchWaits(view);
        if (launch && view.dependency_loop) continue;
        if (launch) {
          if (launch.can_launch) onMe.push(item('launch', [{ id: me, name: memberName(me) }]));
          else if (view.requester.id === me || mine(view.goal.id)) {
            onOthers.push(item('launch', people(launch.launchers).filter(person => person.id !== me)));
          }
          continue;
        }
        const waiting = changeWaits(view);
        if (!waiting) continue;
        if (view.waiting_on_me || (waiting.next === 'rebase' && view.can.rebase)) {
          onMe.push(item(waiting.next, waiting.waiting_on));
        } else if (view.requester.id === me || mine(view.goal.id) || view.approvers.some(person => person.id === me)) {
          onOthers.push(item(waiting.next,
            waiting.next === 'decide' || waiting.next === 'resolve_loop'
              ? waiting.waiting_on.filter(person => person.id !== me) : waiting.waiting_on));
        }
      }
      const latest = new Map();
      for (const view of views) {
        if (view.requester.id !== me) continue;
        const previous = latest.get(view.goal.id);
        if (!previous || view.created_at > previous.created_at ||
          (view.created_at === previous.created_at && view.id > previous.id)) {
          latest.set(view.goal.id, view);
        }
      }
      const declined = [...latest.values()]
        .filter(view => view.state === 'rejected' && goalRow(principal.wsId, view.goal.id)?.status === 'active')
        .map(view => ({ id: view.id, goal: view.goal, reason: view.reason,
          rejected_by: view.rejected_by, rejection_reason: view.rejection_reason, decided_at: view.decided_at }))
        .sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? '') || a.id.localeCompare(b.id));
      return { waiting_on_me: onMe, waiting_on_others: onOthers, declined };
    });
    const asks = section(() => ({ waiting_on_me:
      listAsks(principal, { states: ['open', 'accepted'] })
        .filter(ask => ask.waiting_on_me)
        .map(ask => ({ id: ask.id, state: ask.state, team: ask.team, goal: ask.goal,
          text: ask.text, from_label: ask.from_label, requester: ask.requester,
          next: ask.state === 'open' ? 'accept' : 'done' })) }));
    const alignments = section(() => {
      const groups = listAlignments(principal);
      const onMe = [], onOthers = [];
      for (const alignment of [...groups.waiting_on_me, ...groups.mine, ...groups.others]) {
        const waiting = alignmentWaits(alignment);
        if (!waiting) continue;
        const item = { id: alignment.id, state: alignment.state, requester: alignment.requester,
          target_goal: alignment.target_goal, choice: alignment.choice, source_goal: alignment.source_goal,
          sessions: alignment.sessions.map(session => ({ label: session.label, started_at: session.started_at, key_end: session.key_end })),
          next: waiting.next, waiting_on: waiting.waiting_on, updated_at: alignment.updated_at };
        if (alignment.waiting_on_me) onMe.push(item); else onOthers.push(item);
      }
      return { waiting_on_me: onMe, waiting_on_others: onOthers };
    });
    const activeGoals = goals && section(() => goals.filter(goal => goal.status === 'active')
      .map(goal => ({ id: goal.id, title: goal.title, version: goal.version,
        level: goal.level === 'company' ? 'company' : 'team',
        team: goal.pod_id ? { id: goal.pod_id, name: teamName(goal.pod_id) } : null,
        owner: { id: goal.owner_id, name: memberName(goal.owner_id) }, mine: mine(goal.id) }))
      .sort((a, b) => Number(b.mine) - Number(a.mine)));
    const apps = section(() => {
      const everyone = principal.wsRole === 'owner';
      const items = listGrants(principal).map(grant => ({ id: grant.id, name: grant.name,
        connected_by: grant.user, approved_at: grant.approved_at,
        last_used_at: grant.last_used_at, last_read_at: grant.last_read_at,
        evidence_class: appEvidence(grant.last_read_at) }));
      return { everyone, items };
    });
    return { me, change_requests, asks, alignments, goals: activeGoals, apps };
  }
  return { workspaceHome };
}

exports.create_home = create_home;
