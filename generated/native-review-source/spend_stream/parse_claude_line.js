'use strict';
const {iso_or_null: iso} = require('./iso_or_null.js');
const {object, str, claude_counts, append_cwd} = require('./helpers.js');
function parse_claude_line(line, state) {
  if (!line.trim()) return [];
  if ((state.cwd || state.subagent) && !line.includes('"usage"') && !line.includes('"promptId"')) return [];
  let row;
  try { row = JSON.parse(line); } catch { return [{kind: 'gap', reason: 'malformed_line'}]; }
  if (!object(row)) return [{kind: 'gap', reason: 'malformed_line'}];
  const events = [];
  if (!state.subagent) {
    if (str(row.sessionId)) state.session_id = row.sessionId;
    const c = str(row.cwd);
    if (c) {
      let announce = false;
      if (!state.cwd) { state.cwd = c; announce = true; }
      else if (c !== state.cwd) announce = append_cwd(state, c);
      if (announce && state.session_id) events.push({kind: 'session', harness: 'claude-code', native_session_id: state.session_id, cwd: c, ts: iso(row.timestamp)});
    }
  }
  if (!state.session_id) return events;
  if (row.type === 'user') {
    const p = str(row.promptId);
    if (p && !state.subagent && p !== state.prompt_id && row.isSidechain !== true) {
      state.prompt_id = p;
      const ts = iso(row.timestamp);
      if (ts !== null) events.push({kind: 'root_turn', harness: 'claude-code', native_session_id: state.session_id, root_turn: p, ts});
    }
    return events;
  }
  if (row.type !== 'assistant' || !object(row.message)) return events;
  const m = row.message;
  if (!m.usage) return events;
  const model = str(m.model);
  if (!model || model === '<synthetic>') return events;
  const provider_id = str(row.requestId) || str(row.request_id) || (str(m.id) ? 'msg:' + m.id : null) || (str(row.uuid) ? 'uuid:' + row.uuid : null);
  if (!provider_id) { events.push({kind: 'gap', reason: 'unkeyed_request'}); return events; }
  const is_sub = state.subagent || row.isSidechain === true;
  events.push({kind: 'request', harness: 'claude-code', provider: 'anthropic', provider_id, native_session_id: state.session_id, ts: iso(row.timestamp), model, query_source: is_sub ? 'subagent' : 'main', counts: claude_counts(m.usage), finalized: str(m.stop_reason) !== null, root_turn: is_sub ? str(row.promptId) : state.prompt_id, source: 'transcript'});
  return events;
}
module.exports = {parse_claude_line};
