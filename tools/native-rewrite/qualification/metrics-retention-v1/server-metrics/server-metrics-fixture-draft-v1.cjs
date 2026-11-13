'use strict';
// Labeled synthetic private controls. No production analytics or outcomes.
const assert = require('node:assert/strict');
const {DatabaseSync} = require('node:sqlite');
const resourceNames = ['ESTIMATES','NOTE_REF_RE','recordEvent','readDate'];
const estimates = ['same_day','two_to_three_days','about_a_week','longer','would_not_be_decided'];
const metadata = {weekStart:1,percentile:2,recordLoi:4,buildReport:1,formatReport:1};
const exportsInOrder = ['weekStart','percentile','LOI_EVENTS','recordLoi','FUNNEL','WAW_WEEKS','buildReport','formatReport'];
const MONDAY = Date.parse('2026-11-09T00:00:00.000Z');
const DAY = 86400000, WEEK = 7 * DAY;
function normalize(value, seen = new Map()) {
  if (value === undefined) return {$undefined:true};
  if (typeof value === 'function') return {$function:true};
  if (typeof value === 'bigint') return {$bigint:String(value)};
  if (typeof value === 'number' && !Number.isFinite(value)) return {$number:String(value)};
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return {$ref:seen.get(value)};
  seen.set(value,seen.size);
  if (Array.isArray(value)) return Array.from(value,item => normalize(item,seen));
  return Object.fromEntries(Object.keys(value).map(key => [key,normalize(value[key],seen)]));
}
function fixture(settings = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE v2_workspaces(id TEXT PRIMARY KEY,private_name TEXT);
    CREATE TABLE v2_events(id TEXT PRIMARY KEY,name TEXT,ws_id TEXT,actor TEXT,at TEXT,props TEXT);
    CREATE TABLE v2_sessions(ws_id TEXT,session_key TEXT,created_at TEXT);
    CREATE TABLE v2_epochs(ws_id TEXT,session_key TEXT,epoch_id TEXT,goal_id TEXT,created_at TEXT);
    CREATE TABLE v2_usage(ws_id TEXT,session_key TEXT,epoch_id TEXT,received_at TEXT,ts TEXT,est_list_usd_micros INTEGER);
    CREATE TABLE v2_audit(ws_id TEXT,actor_id TEXT,at TEXT);
    CREATE TABLE v2_spend_rollups(ws_id TEXT,goal_id TEXT,day TEXT,requests INTEGER,est_list_usd_micros INTEGER);
    CREATE TABLE v2_change_requests(ws_id TEXT,state TEXT,decided_at TEXT);`);
  let serial = 0;
  const iso = ms => new Date(ms).toISOString();
  function insert(table,row) {
    const keys = Object.keys(row);
    db.prepare('INSERT INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map(() => '?').join(',')+')').run(...keys.map(k => row[k]));
  }
  function event(name,ws,at,props = {},actor = null) {
    insert('v2_events',{id:'event-'+(++serial),name,ws_id:ws,actor,at:iso(at),props:JSON.stringify(props)});
  }
  const secretNames = ['Private person Example','private-person@example.invalid','https://private.example.invalid/project'];
  if (!settings.empty) {
    const count = settings.workspaces ?? 4;
    for (let i=0;i<count;i++) {
      const ws = 'ws-'+i, sample = (settings.sampleOnly || (!settings.noSample && i===count-1));
      const created = MONDAY - (settings.cohortWeeks ?? (i+1))*WEEK + (settings.createdOffset ?? 0);
      insert('v2_workspaces',{id:ws,private_name:secretNames[i%secretNames.length]});
      event('workspace_created',ws,created,{kind:sample?'sample':'blank'},'ale.person-'+i);
      if (i%2===0) event('code_redeemed',ws,created-60000,{},'ale.person-'+i);
      const stages = ['device_paired','first_session_captured','first_session_bound','second_member_joined','first_change_request','first_approval','first_mcp_read'];
      for (let j=0;j<stages.length;j++) {
        if (j > (settings.stageLimit ?? 7) || (!settings.allStages && j > i+2)) continue;
        const delay = stages[j]==='first_session_bound' ? (settings.minutes ?? ((i+1)*90))*60000 : (j+1)*60000;
        event(stages[j],ws,created+delay,{},'ale.person-'+i);
      }
      if (settings.directiveOnly) {
        db.prepare("DELETE FROM v2_events WHERE name = 'first_approval' AND ws_id = ?").run(ws);
        event('first_directive',ws,created+7*60000,{kind:'stop'});
      }
      event('member_first_session_captured',ws,created+2*60000,{harness:'codex'},'ale.person-'+i);
      event('invite_sent',ws,created+3*60000,{role:'member'},'ale.person-'+i);
      event('invite_accepted',ws,created+4*60000,{role:'member'},'ale.person-'+i);
      for (const offset of settings.activeWeeks ?? [0,1,4]) {
        const at = created + offset*WEEK + 5*60000;
        const sk = 'session-'+i+'-'+offset, ep = 'epoch-'+i+'-'+offset;
        const source = settings.activitySource ?? 'all';
        if (source==='all'||source==='session') insert('v2_sessions',{ws_id:ws,session_key:sk,created_at:iso(at)});
        if (source==='all'||source==='epoch') insert('v2_epochs',{ws_id:ws,session_key:sk,epoch_id:ep,goal_id:i%2?'goal-'+i:null,created_at:iso(at)});
        if (source==='all'||source==='usage') insert('v2_usage',{ws_id:ws,session_key:sk,epoch_id:ep,received_at:iso(at),ts:iso(at),est_list_usd_micros:settings.cost === null?null:(settings.cost??(i+1)*1000000)});
        if (source==='all'||source==='audit'||source==='operator') insert('v2_audit',{ws_id:ws,actor_id:source==='operator'?null:'actor-'+i,at:iso(at)});
      }
      if (!settings.noRolled) insert('v2_spend_rollups',{ws_id:ws,goal_id:i%2?'goal-'+i:'',day:iso(created).slice(0,10),requests:i+2,est_list_usd_micros:(i+1)*2000000});
      for (const [j,estimate] of estimates.entries()) {
        if (j >= (settings.estimateCount ?? 5)) break;
        event('value_reported',ws,created+10000+j,{estimate},'ale.value-'+j);
      }
      event('value_card_viewed',ws,created+10001,{},'ale.value-1');
      event('value_card_viewed',ws,created+10002,{},null);
      event('follow_up_clicked',ws,created+10003,{},'ale.value-1');
      event('first_ask',ws,created+10004,{},'ale.value-1');
      event('first_limit',ws,created+10005,{},'ale.value-1');
      insert('v2_change_requests',{ws_id:ws,state:settings.requestState??'approved',decided_at:iso(created+10006)});
    }
    for (const interest of ['try','evaluate']) for (const via of ['form','value_card']) event('access_requested',null,MONDAY,{interest,via});
    event('access_approved',null,MONDAY);
    event('access_declined',null,MONDAY);
    event('code_created',null,MONDAY,{source:'request'});
    event('code_created',null,MONDAY,{source:'operator'});
    event('loi_sent','ws-0',MONDAY-1000,{note_ref:'LOI-7'});
    if (settings.priorSigned) event('loi_signed','ws-0',MONDAY-500,{verified_original:'yes'});
    if (settings.orphanEvents) {
      event('workspace_created','wsx-purged',MONDAY-2*WEEK,{kind:'blank'});
      event('first_session_bound','wsx-purged',MONDAY-WEEK);
    }
  }
  const tables = ['v2_workspaces','v2_events','v2_sessions','v2_epochs','v2_usage','v2_audit','v2_spend_rollups','v2_change_requests'];
  const snapshot = () => Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]));
  const initial = normalize(snapshot());
  let active=false, reads=0, effects=0, captures=0, dateReads=0;
  const trace=[],wrapped=new WeakMap(),fault=new Error('owned metrics fault');
  const quiet=fn=>{const old=active;active=false;try{return fn();}finally{active=old;}};
  function watch(value,label) {
    if (!value || typeof value!=='object' || value instanceof Date || value instanceof RegExp) return value;
    if (wrapped.has(value)) return wrapped.get(value);
    const proxy=new Proxy(value,{
      get(target,key,receiver) {
        if (active && typeof key==='string') {
          trace.push(['get',label,key]);
          if (++reads===settings.propertyFault) throw fault;
        }
        return watch(Reflect.get(target,key,receiver),label+'.'+String(key));
      },
      ownKeys(target){if(active)trace.push(['keys',label]);return Reflect.ownKeys(target);},
    });
    wrapped.set(value,proxy);return proxy;
  }
  function effect(name,args,fn) {
    if (active) {trace.push(['service',name,quiet(()=>normalize(args))]);if(++effects===settings.effectFault)throw fault;}
    return quiet(fn);
  }
  const sqlPort={};
  for(const method of ['get','all','run']) sqlPort[method]=function(sql,...args){
    assert.equal(this,sqlPort);
    return effect('db.'+method,[sql,...args],()=>{
      const statement=db.prepare(sql);
      const value=statement[method](...args);
      return method==='run'?Number(value.changes):watch(value,method+'.'+sql);
    });
  };
  class FixedDate extends Date {
    constructor(...args){super(...(args.length?args:[settings.clock??MONDAY+123456]));}
    static now(){return settings.clock??MONDAY+123456;}
  }
  const supplied={
    ESTIMATES:watch([...estimates],'ESTIMATES'),
    NOTE_REF_RE:/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/,
    recordEvent:function(dbArg,name,o){
      assert.equal(this,undefined);assert.equal(dbArg,sqlPort);
      return effect('recordEvent',[name,o],()=>event(name,o.ws,Date.parse(o.at),o.props,o.actor??null));
    },
    readDate:function(){assert.equal(this,undefined);dateReads++;return effect('readDate',[],()=>FixedDate);},
  };
  const resources=new Proxy(supplied,{get(target,key){trace.push(['capture',String(key)]);if(++captures===settings.captureFault)throw fault;return target[key];},ownKeys(){throw Error('Resource enumeration forbidden');}});
  async function run(factory,operation='report') {
    let value,caught,didThrow=false,percentileInput;
    try {
      const api=factory(resources);
      assert.deepEqual(Object.keys(api),exportsInOrder);
      for(const [name,length]of Object.entries(metadata)){
        assert.equal(api[name].name,name);assert.equal(api[name].length,length);assert.equal(api[name].constructor.name,'Function');
      }
      active=true;
      if(operation==='week') value=api.weekStart(settings.t??MONDAY);
      else if(operation==='percentile') {
        percentileInput=watch([...(settings.values??[])],'values');
        value=api.percentile(percentileInput,settings.p??0.5);
      } else if(operation==='loi') {
        const o=watch(Object.hasOwn(settings,'options')?settings.options:{noteRef:'LOI-8',verifiedOriginal:true},'options');
        const args=[sqlPort,settings.name??'loi_signed',settings.ws??'ws-0',o];
        if(Object.hasOwn(settings,'now')) args.push(settings.now);
        value=api.recordLoi(...args);
      } else if(operation==='report') {
        const options=watch({since:settings.since??null,now:new Date(settings.now??MONDAY+123456)},'options');
        const report=settings.omitOptions?api.buildReport(sqlPort):api.buildReport(sqlPort,options);
        value={report,text:api.formatReport(report)};
        const serialized=quiet(()=>JSON.stringify(value));
        assert(secretNames.every(secret=>!serialized.includes(secret)),'Private content leaked into report');
      } else throw Error('Unknown metrics operation');
    } catch(error) {caught=error;didThrow=true;}
    active=false;
    const output={result:normalize(value),error:didThrow?{name:caught?.name,message:caught?.message,code:normalize(caught?.code),sameFault:caught===fault}:null,
      input:normalize(percentileInput),trace,reads,effects,captures,dateReads,initial,final:normalize(snapshot())};
    db.close();return output;
  }
  return {run};
}
module.exports={fixture,normalize,resourceNames,metadata,exportsInOrder,MONDAY,DAY,WEEK};
