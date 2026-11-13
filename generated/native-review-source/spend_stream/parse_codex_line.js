'use strict';
const {iso_or_null: iso} = require('./iso_or_null.js');
const {codex_counts} = require('./codex_counts.js');
const {object, str, totals, append_cwd} = require('./helpers.js');
function parse_codex_line(line, state) {
  if (!line.trim() || !['session_meta', 'turn_context', 'token_usage_record', 'token_count', 'task_started'].some(s => line.includes(s))) return [];
  let rec;
  try { rec = JSON.parse(line); } catch { return [{kind: 'gap', reason: 'malformed_line'}]; }
  if (!object(rec)) return [{kind: 'gap', reason: 'malformed_line'}];
  const p = object(rec.payload) ? rec.payload : {};
  const ts = iso(rec.timestamp), events = [];
  const session = c => ({kind: 'session', harness: 'codex', native_session_id: state.native, cwd: c, ts});
  const usage = (provider_id, t, root, grp, override) => ({kind: 'request', harness: 'codex', provider: 'openai', provider_id, native_session_id: state.native, ts, model: state.auto_review ? 'codex-auto-review' : str(override) || state.model || 'unknown', query_source: state.query_source, counts: codex_counts(t), total_input: t !== null ? t.input : undefined, finalized: true, root_turn: root, source: 'rollout', retract_group: grp});
  if (rec.type === 'session_meta') {
    state.thread = str(p.id);
    const sid = str(p.session_id), parent = str(p.parent_thread_id);
    state.native = sid && (sid !== state.thread || parent === null) ? sid : parent || sid || state.thread;
    const sub = object(p.source) ? p.source.subagent : null;
    if (str(p.thread_source) === 'guardian_review' || (object(sub) && sub.other === 'guardian')) {
      state.query_source = 'auxiliary'; state.auto_review = true;
    } else if (str(p.thread_source) === 'subagent' || object(sub) || parent) {
      state.query_source = 'subagent'; state.auto_review = false;
    } else { state.query_source = 'main'; state.auto_review = false; }
    if (str(p.model)) state.model = p.model;
    if (state.native && state.query_source === 'main') events.push(session(str(p.cwd)));
    state.cwd = str(p.cwd);
  } else if (rec.type === 'turn_context') {
    if (str(p.model)) state.model = p.model;
    const c = str(p.cwd);
    if (c && state.native && state.query_source === 'main' && state.cwd && c !== state.cwd && append_cwd(state, c)) events.push(session(c));
    state.root_turn = str(p.root_turn_id) || str(p.turn_id) || state.root_turn;
  } else if (rec.type === 'token_usage_record') {
    if (state.native === null) return [{kind: 'gap', reason: 'no_session_meta'}];
    if (!state.has_tur) {
      state.has_tur = true;
      if (state.emitted_tc) events.push({kind: 'retract', group: state.group});
    }
    const rid = str(p.response_id);
    if (!rid) events.push({kind: 'gap', reason: 'unkeyed_request'});
    else events.push(usage('resp:' + rid, totals(p.usage), str(p.root_turn_id) || state.root_turn, null, str(p.model)));
  } else if (rec.type === 'event_msg' && p.type === 'task_started') {
    const turn = str(p.turn_id), root = str(p.root_turn_id) || turn;
    if (root) state.root_turn = root;
    if (state.native && state.query_source === 'main' && turn && root === turn && ts !== null) events.push({kind: 'root_turn', harness: 'codex', native_session_id: state.native, root_turn: turn, ts});
  } else if (rec.type === 'event_msg' && p.type === 'token_count') {
    if (state.has_tur || state.native === null || !object(p.info)) return [];
    const total = totals(p.info.total_token_usage);
    let counted = totals(p.info.last_token_usage);
    if (total !== null) {
      const prev = state.prev_total, fields = ['input', 'cached', 'cache_write', 'output'];
      if (prev && fields.every(k => total[k] === prev[k])) return [];
      if (prev && fields.some(k => total[k] < prev[k])) {
        state.prev_total = total;
        return [{kind: 'gap', reason: 'cumulative_regression'}];
      }
      if (counted === null) counted = prev ? Object.fromEntries(fields.map(k => [k, total[k] - prev[k]])) : total;
      state.prev_total = total;
    }
    if (counted === null || (counted.input === 0 && counted.output === 0)) return [];
    const key = total ? `tc:${state.thread}:${total.input}:${total.cached}:${total.output}` : `tc:${state.thread}:${ts}:${counted.input}:${counted.cached}:${counted.output}`;
    state.emitted_tc = true;
    events.push(usage(key, counted, state.root_turn, state.group, null));
  }
  return events;
}
module.exports = {parse_codex_line};
