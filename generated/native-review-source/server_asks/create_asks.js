'use strict';
function create_asks(resources) {
  const {all,audit,get,run,tx,V2Error,badRequest,conflict,forbidden,notFound,event,newId,nowIso,sha256hex,take,cleanProse,isBlankText,goalObj,goalRow,canReadGoal,memberName,need,readDate}=resources;
  const ASK_STATES=['open','accepted','done','declined','withdrawn'];
  const ASK_ACTIONS=['accept','decline','done','reopen','withdraw','mention'];
  const ASK_TEXT_MAX=400,ASK_FROM_MAX=80,ASK_TITLE_MAX=120,MENTION_TEXT_MAX=300,MENTIONS_MAX=10,IMPORT_MAX=60,OPEN_ASKS_MAX=500,ASKS_PER_HOUR=60,ASK_ACTIONS_PER_MINUTE=30;
  const NO_ACTIONS={accept:false,decline:false,done:false,reopen:false,withdraw:false,mention:false};
  const FROM={accept:['open'],decline:['open'],done:['accepted'],reopen:['done','declined'],withdraw:['open','accepted'],mention:['open','accepted']};
  const NEXT={accept:'accepted',decline:'declined',done:'done',reopen:'open',withdraw:'withdrawn'};
  const AUDIT={accept:'ask.accepted',decline:'ask.declined',done:'ask.done',reopen:'ask.reopened',withdraw:'ask.withdrawn',mention:'ask.mentioned'};
  const rank={open:0,accepted:1,done:2,declined:2,withdrawn:2};
  function text(value,field,max,optional=false) {
    if(value===undefined || value===null || optional && value==='') {if(optional)return null;throw badRequest(`${field} is required`);}
    if(typeof value!=='string')throw badRequest(`${field} must be a string`);
    const out=cleanProse(value.replace(/[\u0000-\u001f\u007f-\u009f]/g,' '));
    if(isBlankText(out)){if(optional)return null;throw badRequest(`${field} is required`);}
    if(out.length>max)throw badRequest(`${field} is too long (max ${max} characters)`);
    return out;
  }
  function day(value,field){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw badRequest(`${field} must be a date like 2026-10-26`);
    const D=readDate();
    if(Number.isNaN(D.parse(`${value}T00:00:00Z`)))throw badRequest(`${field} must be a date like 2026-10-26`);
    const E=readDate();
    if(new E(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)throw badRequest(`${field} must be a date like 2026-10-26`);
    return value;
  }
  function object(b,field){if(!b||typeof b!=='object'||Array.isArray(b))throw badRequest(`${field} must be an object`);return b;}
  function teamInput(pp,b,prefix){
    if((b.team_id===undefined||b.team_id===null)&&typeof b.team==='string'){
      const name=text(b.team,`${prefix}team`,200);
      const ids=all('SELECT id FROM v2_pods WHERE ws_id = ? AND lower(name) = lower(?)',pp.wsId,name);
      if(ids.length!==1)throw badRequest(`${prefix}team: ${ids.length?'more than one team':'no team'} here is called "${name}"`);
      return ids[0].id;
    }
    if(b.team_id===undefined||b.team_id===null||b.team_id==='')throw badRequest(`${prefix}team_id (or ${prefix}team, a team's name) is required`);
    const teamId=text(b.team_id,`${prefix}team_id`,64);
    if(!get('SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?',pp.wsId,teamId))throw notFound();
    return teamId;
  }
  function askInput(pp,b,prefix=''){
    const teamId=teamInput(pp,b,prefix),goalId=text(b.goal_id,`${prefix}goal_id`,64,true);
    if(goalId){const g=goalRow(pp.wsId,goalId);if(!g||!canReadGoal(pp,goalObj(g)))throw notFound();if(g.pod_id!==teamId)throw badRequest(`${prefix}goal_id must be a goal of the team asked`);}
    const s=object(b.source,`${prefix}source`);
    const kind=s.kind==='meeting'||s.kind==='manual'?s.kind:null;
    if(!kind)throw badRequest(`${prefix}source.kind must be meeting or manual`);
    const title=text(s.title,`${prefix}source.title`,120,kind==='manual');
    return {teamId,goalId,text:text(b.text,`${prefix}text`,400),fromLabel:text(b.from_label,`${prefix}from_label`,80,true),source:{kind,title,date:day(s.date,`${prefix}source.date`)}};
  }
  function mentionInput(b,prefix=''){return {date:day(b.date,`${prefix}date`),text:text(b.text,`${prefix}text`,300),source_title:text(b.source_title,`${prefix}source_title`,120)};}
  const owner=pp=>pp.wsRole==='owner';
  const inTeam=(pp,a)=>pp.pods.has(a.team_id);
  const leads=(pp,a)=>pp.pods.get(a.team_id)==='lead';
  const writer=pp=>pp.wsRole==='owner'||pp.wsRole==='member';
  function canReadAsk(pp,a){return !!pp.wsRole&&(a.created_by===pp.userId||pp.pods.has(a.team_id)||pp.wsRole==='owner');}
  function flags(pp,a){
    if(!writer(pp))return {accept:false,decline:false,done:false,reopen:false,withdraw:false,mention:false};
    const decide=leads(pp,a)||owner(pp);
    return {accept:a.state==='open'&&decide,decline:a.state==='open'&&decide,done:a.state==='accepted'&&(inTeam(pp,a)||owner(pp)),reopen:(a.state==='done'||a.state==='declined')&&decide,withdraw:(a.state==='open'||a.state==='accepted')&&a.created_by===pp.userId,mention:a.state==='open'||a.state==='accepted'};
  }
  function waiting(pp,a,can){if(can.accept)return leads(pp,a)||!get("SELECT 1 AS x FROM v2_pod_members WHERE ws_id = ? AND pod_id = ? AND role = 'lead'",a.ws_id,a.team_id);if(can.done)return inTeam(pp,a)||!get('SELECT 1 AS x FROM v2_pod_members WHERE ws_id = ? AND pod_id = ?',a.ws_id,a.team_id);return false;}
  function visible(pp,id){need(pp,'workspace.read');const a=get('SELECT * FROM v2_asks WHERE ws_id = ? AND id = ?',pp.wsId,id);if(!a||!canReadAsk(pp,a))throw notFound();return a;}
  function viewer(pp){
    const people=new Map(),teams=new Map(),goals=new Map();
    function person(id){if(!people.has(id))people.set(id,{id,name:memberName(id)});return people.get(id);}
    function team(id){if(!teams.has(id))teams.set(id,{id,name:get('SELECT name FROM v2_pods WHERE ws_id = ? AND id = ?',pp.wsId,id)?.name??''});return teams.get(id);}
    function goal(id){if(!id)return null;if(!goals.has(id)){const g=goalRow(pp.wsId,id);goals.set(id,g&&canReadGoal(pp,goalObj(g))?{id:g.id,title:g.title}:null);}return goals.get(id);}
    return (a,mentions,via)=>{
      const can=via?NO_ACTIONS:flags(pp,a);
      return {id:a.id,state:a.state,team:team(a.team_id),goal:goal(a.goal_id),text:a.text,from_label:a.from_label,requester:person(a.created_by),source:{kind:a.source_kind,title:a.source_title,date:a.source_date},mentions:mentions.map(m=>({n:m.n,date:m.date,text:m.text,source_title:m.source_title,added_by:person(m.added_by)})),decided_by:a.decided_by?person(a.decided_by):null,decided_at:a.decided_at,created_at:a.created_at,updated_at:a.updated_at,waiting_on_me:via?false:waiting(pp,a,can),can,...(via?{via_alignment:{goal_id:via}}:{})};
    };
  }
  function alignedTeams(pp,deviceId){
    const rows=all("SELECT DISTINCT g.pod_id AS team_id, g.id AS goal_id FROM v2_sessions s\n       JOIN v2_alignments al ON al.ws_id = s.ws_id AND al.id = s.governing_alignment_id\n       JOIN v2_goals g ON g.ws_id = s.ws_id AND g.id = s.governing_goal_id\n     WHERE s.ws_id = ? AND s.user_id = ? AND s.device_id = ? AND s.state = 'shared'\n       AND al.state = 'approved' AND al.target_goal_id = s.governing_goal_id AND g.pod_id IS NOT NULL\n     ORDER BY g.id",pp.wsId,pp.userId,deviceId);
    const out=new Map();for(const r of rows)if(!out.has(r.team_id))out.set(r.team_id,r.goal_id);return out;
  }
  function getAsk(pp,id){const a=visible(pp,id),view=viewer(pp);return view(a,all('SELECT * FROM v2_ask_mentions WHERE ask_id = ? ORDER BY n',a.id));}
  function listAsks(pp,o={}){
    need(pp,'workspace.read');const where=['ws_id = ?'],params=[pp.wsId];
    if(o.states?.length){where.push(`state IN (${o.states.map(()=>'?').join(', ')})`);params.push(...o.states);}
    if(o.teamId){where.push('team_id = ?');params.push(o.teamId);}
    const mine=a=>pp.pods.has(a.team_id)||a.created_by===pp.userId?0:1;
    const via=a=>(!canReadAsk(pp,a)&&a.state==='accepted')?o.followed?.get(a.team_id):undefined;
    const rows=all('SELECT * FROM v2_asks WHERE '+where.join(' AND '),...params).filter(a=>canReadAsk(pp,a)||!!via(a)).sort((a,b)=>mine(a)-mine(b)||rank[a.state]-rank[b.state]||b.source_date.localeCompare(a.source_date)||b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id)).slice(0,o.limit??Infinity);
    const byAsk=new Map();if(rows.length)for(const m of all('SELECT * FROM v2_ask_mentions WHERE ws_id = ? ORDER BY ask_id, n',pp.wsId)){if(!byAsk.has(m.ask_id))byAsk.set(m.ask_id,[]);byAsk.get(m.ask_id).push(m);}
    const view=viewer(pp);return rows.map(a=>view(a,byAsk.get(a.id)??[],via(a)));
  }
  function readableAsks(pp,o={}){return listAsks(pp,{states:o.state?[o.state]:undefined,teamId:o.teamId,limit:o.limit});}
  function asksFeed(pp,q,deviceId=null){
    const states=q.state?q.state.split(',').map(s=>s.trim()):[];
    if(states.some(s=>!ASK_STATES.includes(s)))throw badRequest(`state must be one or more of ${ASK_STATES.join(', ')}`);
    if(q.teamId&&!/^pod_[A-Za-z0-9_-]{8,64}$/.test(q.teamId))throw badRequest('team_id must be a team id');
    const limit=q.limit?Number(q.limit):500;if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw badRequest('limit must be 1 to 500');
    const followed=deviceId?alignedTeams(pp,deviceId):undefined;
    const asks=listAsks(pp,{states,teamId:q.teamId??undefined,limit,followed});return {version:sha256hex(JSON.stringify(asks)).slice(0,16),asks};
  }
  function asksForBrief(pp){const list=listAsks(pp,{states:['open','accepted']}).filter(a=>pp.pods.has(a.team.id)).sort((a,b)=>rank[a.state]-rank[b.state]||b.mentions.length-a.mentions.length||b.source.date.localeCompare(a.source.date)||b.created_at.localeCompare(a.created_at));return {asks:list.slice(0,5),more:Math.max(0,list.length-5)};}
  function requireWriter(pp){need(pp,'workspace.read');if(!writer(pp))throw forbidden('read_only','Viewers can look but not change anything.');}
  function openCount(ws){return get("SELECT COUNT(*) AS n FROM v2_asks WHERE ws_id = ? AND state IN ('open','accepted')",ws)?.n??0;}
  function createdLastHour(ws){const D=readDate(),E=readDate();const cutoff=new D(E.now()-3600000).toISOString();return get('SELECT COUNT(*) AS n FROM v2_asks WHERE ws_id = ? AND created_at > ?',ws,cutoff)?.n??0;}
  function rateError(){return new V2Error(429,'rate_limited','Too many asks were recorded in the last hour; try again later.');}
  function checkCaps(ws,adding){if(openCount(ws)+adding>500)throw conflict('too_many_asks','A workspace can have at most 500 open or accepted asks; close some first.');if(createdLastHour(ws)+adding>60)throw rateError();}
  function insert(pp,f,state,at){const id=newId('ask'),decided=state==='open'?null:pp.userId;run('INSERT INTO v2_asks (id, ws_id, team_id, goal_id, text, from_label, created_by, source_kind, source_title, source_date, state, decided_by, decided_at, created_at, updated_at)\n     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',id,pp.wsId,f.teamId,f.goalId,f.text,f.fromLabel,pp.userId,f.source.kind,f.source.title,f.source.date,state,decided,decided?at:null,at,at);return id;}
  function addMention(pp,a,m,at){const n=(get('SELECT MAX(n) AS n FROM v2_ask_mentions WHERE ask_id = ?',a.id)?.n??0)+1;if(n>10)throw conflict('too_many_mentions',"An ask keeps at most 10 mentions, so this one isn't recorded.");run('INSERT INTO v2_ask_mentions (ws_id, ask_id, n, date, text, source_title, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',a.ws_id,a.id,n,m.date,m.text,m.source_title,pp.userId,at);run('UPDATE v2_asks SET updated_at = ? WHERE id = ?',at,a.id);}
  async function createAsk(pp,b){requireWriter(pp);const f=askInput(pp,b),at=nowIso();const id=await tx(()=>{checkCaps(pp.wsId,1);const id=insert(pp,f,'open',at);audit(pp.wsId,pp.userId,'ask.created',id,at);event('first_ask',{ws:pp.wsId,user:pp.userId,at});return id;});return getAsk(pp,id);}
  async function importAsks(pp,b){
    need(pp,'workspace.manage');take(`ask-import:${pp.wsId}`,10,60000);
    if(!Array.isArray(b.asks))throw badRequest('Send {asks: [...]}');if(b.asks.length>60)throw badRequest('asks: at most 60 per import');
    const items=b.asks.map((raw,i)=>{const prefix=`asks[${i}].`,it=object(raw,`asks[${i}]`);const state=it.state===undefined||it.state===null?'open':it.state;if(!['open','accepted','done','declined'].includes(state))throw badRequest(`${prefix}state must be open, accepted, done or declined`);const ms=it.mentions??[];if(!Array.isArray(ms))throw badRequest(`${prefix}mentions must be a list`);if(ms.length>10)throw badRequest(`${prefix}mentions: at most 10`);return {ask:askInput(pp,it,prefix),state,mentions:ms.map((m,j)=>mentionInput(object(m,`${prefix}mentions[${j}]`),`${prefix}mentions[${j}].`))};});
    const at=nowIso();return tx(()=>{let created=0,merged=0,unchanged=0;for(const it of items){const same=all('SELECT * FROM v2_asks WHERE ws_id = ? AND team_id = ?',pp.wsId,it.ask.teamId).filter(a=>a.text.toLowerCase().replace(/\s+/g,' ').trim()===it.ask.text.toLowerCase().replace(/\s+/g,' ').trim());if(same.some(a=>a.source_date===it.ask.source.date)){unchanged++;continue;}const live=same.find(a=>a.state==='open'||a.state==='accepted');if(live){const title=it.ask.source.title??'Recorded by hand';const ms=all('SELECT * FROM v2_ask_mentions WHERE ask_id = ? ORDER BY n',live.id);if(ms.length>=10||ms.some(m=>m.date===it.ask.source.date&&m.source_title===title))unchanged++;else{addMention(pp,live,{date:it.ask.source.date,text:it.ask.text,source_title:title},at);merged++;}continue;}const id=insert(pp,it.ask,it.state,at),a=get('SELECT * FROM v2_asks WHERE ws_id = ? AND id = ?',pp.wsId,id);for(const m of it.mentions)addMention(pp,a,m,at);created++;}checkCaps(pp.wsId,0);if(createdLastHour(pp.wsId)>60)throw rateError();audit(pp.wsId,pp.userId,'ask.imported',String(created+merged),at);if(created)event('first_ask',{ws:pp.wsId,user:pp.userId,at});return {created,merged,unchanged};});
  }
  function stateRefusal(a,reader){const who=a.decided_by,self=who===reader,by=who?' by '+memberName(who):'';switch(a.state){case 'open':return who?`${self?'You':memberName(who)} reopened this ask, so it waits for the team asked to accept it again.`:'This ask waits for the team asked to accept it.';case 'accepted':return self?'You already accepted this ask.':`This ask was already accepted${by}.`;case 'done':return self?'You marked this ask done.':`This ask was marked done${by}.`;case 'declined':return self?'You declined this ask, so nothing changes.':`This ask was declined${by}, so nothing changes.`;case 'withdrawn':return a.created_by===reader?'You withdrew this ask, so nothing changes.':`This ask was withdrawn by ${memberName(a.created_by)}, so nothing changes.`;}}
  async function actOnAsk(pp,id,action,b){visible(pp,id);requireWriter(pp);take(`ask-action:${pp.userId}`,30,60000);const mention=action==='mention'?mentionInput(b):null,at=nowIso();await tx(()=>{const a=get('SELECT * FROM v2_asks WHERE ws_id = ? AND id = ?',pp.wsId,id);if((action==='accept'||action==='decline'||action==='reopen')&&!leads(pp,a)&&!owner(pp))throw forbidden('not_team_lead','Only a lead of the team asked, or a workspace owner, can do this.');if(action==='done'&&!inTeam(pp,a)&&!owner(pp))throw forbidden('not_in_team','Only the team asked, or a workspace owner, can mark it done.');if(action==='withdraw'&&a.created_by!==pp.userId)throw forbidden('not_requester','Only the person who recorded this ask can withdraw it.');if(!FROM[action].includes(a.state))throw conflict('wrong_state',stateRefusal(a,pp.userId));if(mention)addMention(pp,a,mention,at);else run('UPDATE v2_asks SET state = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?',NEXT[action],pp.userId,at,at,a.id);audit(pp.wsId,pp.userId,AUDIT[action],a.id,at);});return getAsk(pp,id);}
  function assertAskAction(a){if(!ASK_ACTIONS.includes(a))throw notFound();return a;}
  return {ASK_STATES,ASK_ACTIONS,ASK_TEXT_MAX,ASK_FROM_MAX,ASK_TITLE_MAX,MENTION_TEXT_MAX,MENTIONS_MAX,IMPORT_MAX,OPEN_ASKS_MAX,ASKS_PER_HOUR,ASK_ACTIONS_PER_MINUTE,canReadAsk,alignedTeams,getAsk,listAsks,readableAsks,asksFeed,asksForBrief,createAsk,importAsks,actOnAsk,assertAskAction};
}
module.exports={create_asks};
