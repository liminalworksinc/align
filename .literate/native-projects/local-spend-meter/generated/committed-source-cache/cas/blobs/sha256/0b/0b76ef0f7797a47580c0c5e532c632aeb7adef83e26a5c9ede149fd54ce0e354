'use strict';
const {object,str,iso} = require('./helpers.js');
const {claude_counts} = require('./claude_counts.js');
function parse_claude_lines(file, lines) {
  const parts = file.split('/'), i = parts.lastIndexOf('subagents');
  const subagent = i > 0;
  let session_id = subagent ? parts[i-1] : parts[parts.length-1];
  if (!subagent && session_id !== '.jsonl') session_id = session_id.replace(/\.jsonl$/, '');
  let prompt_id = null, cwd = null;
  const other_cwds = [], events = [];
  const session = (c, ts) => ({kind:'session',harness:'claude-code',native_session_id:session_id,cwd:c,ts});
  for (const line of lines) {
    if (!line.trim()) continue;
    if ((cwd || subagent) && !line.includes('"usage"') && !line.includes('"promptId"')) continue;
    let row;
    try { row = JSON.parse(line); if (!object(row)) throw new Error(); }
    catch { events.push({kind:'gap',reason:'malformed_line'}); continue; }
    if (!subagent) {
      if (str(row.sessionId)) session_id = row.sessionId;
      const c = str(row.cwd);
      if (c) {
        if (!cwd) { cwd = c; if (session_id) events.push(session(c,iso(row.timestamp))); }
        else if (c !== cwd && !other_cwds.includes(c) && other_cwds.length < 8) {
          other_cwds.push(c); if (session_id) events.push(session(c,iso(row.timestamp)));
        }
      }
    }
    if (!session_id) continue;
    if (row.type === 'user') {
      const p = str(row.promptId);
      if (p && !subagent && p !== prompt_id && row.isSidechain !== true) {
        prompt_id = p;
        const ts = iso(row.timestamp);
        if (ts !== null) events.push({kind:'root_turn',harness:'claude-code',native_session_id:session_id,root_turn:p,ts});
      }
      continue;
    }
    if (row.type !== 'assistant' || !object(row.message)) continue;
    const m = row.message, model = str(m.model);
    if (!m.usage || !model || model === '<synthetic>') continue;
    const provider_id = str(row.requestId) || str(row.request_id) || (str(m.id) ? 'msg:'+m.id : null) || (str(row.uuid) ? 'uuid:'+row.uuid : null);
    if (!provider_id) { events.push({kind:'gap',reason:'unkeyed_request'}); continue; }
    const is_sub = subagent || row.isSidechain === true;
    events.push({kind:'request',harness:'claude-code',provider:'anthropic',provider_id,native_session_id:session_id,ts:iso(row.timestamp),model,query_source:is_sub?'subagent':'main',counts:claude_counts(m.usage),finalized:!!str(m.stop_reason),root_turn:is_sub?str(row.promptId):prompt_id,source:'transcript'});
  }
  return events;
}
module.exports = {parse_claude_lines};
