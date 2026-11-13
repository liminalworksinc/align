'use strict';
const {object,str,count,iso} = require('./helpers.js');
function totals(u) {
  if (!object(u)) return null;
  const t = {input:count(u.input_tokens ?? u.prompt_tokens),cached:count(u.cached_input_tokens ?? u.cache_read_input_tokens ?? u.cached_tokens) ?? 0,cache_write:count(u.cache_write_input_tokens) ?? 0,output:count(u.output_tokens ?? u.completion_tokens)};
  return Object.values(t).every(Number.isSafeInteger) ? t : null;
}
function codex_counts(t) {
  if (t === null) return null;
  const fresh = t.input-t.cached-t.cache_write;
  return fresh < 0 ? null : {input:fresh,output:t.output,cache_read:t.cached,cache_write_5m:0,cache_write_1h:0,cache_write_unsplit:t.cache_write};
}
function parse_codex_lines(group, lines) {
  let native=null,thread=null,query_source='main',auto_review=false,model=null,root_turn=null,has_tur=false,emitted_tc=false,prev_total=null,cwd=null;
  const other_cwds=[], events=[];
  const session = (c,ts) => ({kind:'session',harness:'codex',native_session_id:native,cwd:c,ts});
  function usage(provider_id,ts,t,root,grp,override) {
    const e = {kind:'request',harness:'codex',provider:'openai',provider_id,native_session_id:native,ts,model:auto_review?'codex-auto-review':str(override)||model||'unknown',query_source,counts:codex_counts(t)};
    if (t !== null) e.total_input=t.input;
    return Object.assign(e,{finalized:true,root_turn:root,source:'rollout',retract_group:grp});
  }
  for (const line of lines) {
    if (!line.trim() || !['session_meta','turn_context','token_usage_record','token_count','task_started'].some(s=>line.includes(s))) continue;
    let rec;
    try { rec=JSON.parse(line); if (!object(rec)) throw new Error(); }
    catch { events.push({kind:'gap',reason:'malformed_line'}); continue; }
    const p=object(rec.payload)?rec.payload:{}, ts=iso(rec.timestamp);
    if (rec.type === 'session_meta') {
      thread=str(p.id);
      const sid=str(p.session_id),parent=str(p.parent_thread_id),src=str(p.thread_source),sub=object(p.source)?p.source.subagent:null;
      native=sid && (sid!==thread || parent===null)?sid:parent||sid||thread;
      if (src==='guardian_review' || (object(sub) && sub.other==='guardian')) { query_source='auxiliary'; auto_review=true; }
      else if (src==='subagent' || object(sub) || parent) { query_source='subagent'; auto_review=false; }
      else { query_source='main'; auto_review=false; }
      if (str(p.model)) model=p.model;
      if (native && query_source==='main') events.push(session(str(p.cwd),ts));
      cwd=str(p.cwd);
    } else if (rec.type === 'turn_context') {
      if (str(p.model)) model=p.model;
      const c=str(p.cwd);
      if (c && native && query_source==='main' && cwd && c!==cwd && !other_cwds.includes(c) && other_cwds.length<8) { other_cwds.push(c); events.push(session(c,ts)); }
      root_turn=str(p.root_turn_id)||str(p.turn_id)||root_turn;
    } else if (rec.type === 'token_usage_record') {
      if (native===null) { events.push({kind:'gap',reason:'no_session_meta'}); continue; }
      if (!has_tur) { has_tur=true; if (emitted_tc) events.push({kind:'retract',group}); }
      const rid=str(p.response_id);
      if (!rid) { events.push({kind:'gap',reason:'unkeyed_request'}); continue; }
      events.push(usage('resp:'+rid,ts,totals(p.usage),str(p.root_turn_id)||root_turn,null,str(p.model)));
    } else if (rec.type === 'event_msg' && p.type === 'task_started') {
      const turn=str(p.turn_id),root=str(p.root_turn_id)||turn;
      if (root) root_turn=root;
      if (native && query_source==='main' && turn && root===turn && ts!==null) events.push({kind:'root_turn',harness:'codex',native_session_id:native,root_turn:turn,ts});
    } else if (rec.type === 'event_msg' && p.type === 'token_count') {
      if (has_tur || native===null || !object(p.info)) continue;
      const total=totals(p.info.total_token_usage);
      let counted=totals(p.info.last_token_usage);
      if (total) {
        const prev=prev_total, keys=['input','cached','cache_write','output'];
        if (prev && keys.every(k=>total[k]===prev[k])) continue;
        if (prev && keys.some(k=>total[k]<prev[k])) { prev_total=total; events.push({kind:'gap',reason:'cumulative_regression'}); continue; }
        if (counted===null) counted=prev?Object.fromEntries(keys.map(k=>[k,total[k]-prev[k]])):total;
        prev_total=total;
      }
      if (counted===null || (counted.input===0 && counted.output===0)) continue;
      const key=total?`tc:${thread}:${total.input}:${total.cached}:${total.output}`:`tc:${thread}:${ts}:${counted.input}:${counted.cached}:${counted.output}`;
      emitted_tc=true;
      events.push(usage(key,ts,counted,root_turn,group,null));
    }
  }
  return events;
}
module.exports = {parse_codex_lines};
