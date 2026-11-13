'use strict';
// Labeled synthetic private records in the measured 48-table storage schema.
// Authentication tables here are explicit external fixtures, not auth qualification.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const data=require('./retention-private-data-v1.json');
const storage=require('./retention-private-storage-seed-v1.cjs')(data.inventory);
const resourceNames=['eventActor','purgeWorkspace','RESTORE_DAYS','sessionMaxDays','testIdpEnabled','readDate','readProcessEnv'];
const metadata={retentionNow:0,formerMemberId:1,personName:2,workspacesNaming:2,noteDeparture:4,cancelDeparture:3,pseudonymise:5,deleteOrphanDirectives:1,runRetention:4,describeCounts:1};
const exportsInOrder=['RESTORE_DAYS','FORMER_MEMBER_DAYS','SESSION_MONTHS','AUDIT_MONTHS','INVITE_GRACE_DAYS','ACCESS_REQUEST_MONTHS','EVENT_MONTHS','CLOSED_ASK_MONTHS','VALUE_REPORT_MONTHS','REQUEST_MONTHS','DELETED_SESSION_MONTHS','RETENTION_INTERVAL_MS','retentionNow','formerMemberId','personName','PERSON_COLUMNS','workspacesNaming','noteDeparture','cancelDeparture','pseudonymise','deleteOrphanDirectives','runRetention','describeCounts'];
const DAY=86400000,NOW=Date.parse('2027-04-01T00:00:00.000Z');
const id=name=>'"'+name.replaceAll('"','""')+'"';
function normalize(value,seen=new Map()){
  if(value===undefined)return {$undefined:true};
  if(typeof value==='function')return {$function:true};
  if(typeof value==='symbol')return {$symbol:String(value)};
  if(typeof value==='bigint')return {$bigint:String(value)};
  if(typeof value==='number'&&!Number.isFinite(value))return {$number:String(value)};
  if(value===null||typeof value!=='object')return value;
  if(value instanceof Date)return {$date:Number.isNaN(value.getTime())?'Invalid Date':value.toISOString()};
  if(seen.has(value))return {$ref:seen.get(value)};
  seen.set(value,seen.size);
  if(Array.isArray(value))return Array.from(value,x=>normalize(x,seen));
  return Object.fromEntries(Object.keys(value).map(key=>[key,normalize(value[key],seen)]));
}
function fixture(settings={}){
  const temporary=settings.fileBacked?fs.mkdtempSync(path.join(os.tmpdir(),'align-retention-test-')):null;
  const filename=temporary?path.join(temporary,'private.sqlite'):':memory:';
  const db=new DatabaseSync(filename,{enableForeignKeyConstraints:true});
  db.exec('CREATE TABLE ba_user(id TEXT PRIMARY KEY,email TEXT,name TEXT); CREATE TABLE ba_passkey(id TEXT PRIMARY KEY); CREATE TABLE ba_verification(id TEXT PRIMARY KEY,expiresAt TEXT); CREATE TABLE ba_session(id TEXT PRIMARY KEY,expiresAt TEXT,createdAt TEXT);');
  const tables=data.inventory.snapshots['22'].tables;
  for(const table of tables)db.exec(table.sql);
  for(const table of tables){for(const index of table.indexes)if(index.sql)db.exec(index.sql);for(const trigger of table.triggers)db.exec(trigger.sql);}
  db.exec('PRAGMA user_version=22');
  if(!settings.empty)storage.seed(db,22);
  const nowMs=settings.now??NOW,nowIso=new Date(nowMs).toISOString(),secret='fixture-retention-actor-key';
  const actor=user=> 'ale.'+crypto.createHmac('sha256',secret).update(user).digest('base64url');
  const user=settings.user??'fixture-viewer-a',ws=settings.ws??'fixture-ws-a';
  const at=ms=>new Date(ms).toISOString();
  function insert(table,row){const keys=Object.keys(row);return db.prepare('INSERT INTO '+id(table)+' ('+keys.map(id).join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>row[k]));}
  if(!settings.empty){
    db.prepare('UPDATE ba_user SET email=id||?,name=id||?').run('@fixture.invalid',' private name');
    if(settings.noPending)db.prepare('DELETE FROM v2_former_members WHERE ws_id=? AND user_id=?').run(ws,user);
    if(settings.departureAgeDays!==undefined)db.prepare('UPDATE v2_former_members SET removed_at=? WHERE ws_id=? AND user_id=?').run(at(nowMs-settings.departureAgeDays*DAY+(settings.departureOffset??0)),ws,user);
    if(settings.removeMembership)db.prepare('DELETE FROM v2_members WHERE ws_id=? AND user_id=?').run(ws,user);
    if(settings.plantPerson){
      for(const [table,column]of data.personColumns)db.prepare('UPDATE '+id(table)+' SET '+id(column)+'=? WHERE ws_id=?').run(user,ws);
      db.prepare('UPDATE v2_workspaces SET created_by=? WHERE id=?').run(user,ws);
      db.prepare('UPDATE v2_alignment_revisions SET approvers_json=? WHERE ws_id=?').run(JSON.stringify({sets:[[user]],approved_by:[user],via:'sessions:'+user}),ws);
      db.prepare("UPDATE v2_directives SET goal_json=? WHERE ws_id=? AND kind='goal_version'").run(JSON.stringify({owner:{id:user,name:'private person'}}),ws);
      db.prepare("UPDATE v2_directives SET hold_json=? WHERE ws_id=? AND kind='hold'").run(JSON.stringify({by:user,reason:'private reason'}),ws);
      db.prepare('UPDATE v2_invites SET email=? WHERE ws_id=?').run(user+'@fixture.invalid',ws);
      insert('v2_events',{name:'device_paired',ws_id:ws,actor:actor(user),at:nowIso,props:'{}'});
      insert('v2_events',{name:'device_paired',ws_id:'fixture-ws-b',actor:actor(user),at:nowIso,props:'{}'});
    }
    if(settings.deletedAgeDays!==undefined)db.prepare('UPDATE v2_workspaces SET deleted_at=? WHERE id=?').run(at(nowMs-settings.deletedAgeDays*DAY+(settings.deletedOffset??0)),ws);
    if(settings.stoppedAt!==undefined)db.prepare('UPDATE v2_sessions SET stopped_at=? WHERE ws_id=?').run(settings.stoppedAt,ws);
    if(settings.lastActivityAt!==undefined){
      db.prepare('UPDATE v2_sessions SET updated_at=? WHERE ws_id=?').run(settings.lastActivityAt,ws);
      db.prepare('UPDATE v2_usage SET received_at=? WHERE ws_id=?').run(settings.lastActivityAt,ws);
      db.prepare('UPDATE v2_epochs SET created_at=? WHERE ws_id=?').run(settings.lastActivityAt,ws);
    }
    for(const state of ['open','accepted','done','declined','withdrawn']){
      const ask=db.prepare('SELECT * FROM v2_asks WHERE ws_id=? LIMIT 1').get(ws);
      if(ask){const clone={...ask,id:'retention-ask-'+state,state,updated_at:settings.contentAt??ask.updated_at};insert('v2_asks',clone);}
    }
    if(settings.contentAt!==undefined){
      db.prepare('UPDATE v2_events SET actor=actor WHERE ws_id=?').run(ws);
      db.prepare('UPDATE v2_value_reports SET updated_at=? WHERE ws_id=?').run(settings.contentAt,ws);
      db.prepare('UPDATE v2_asks SET updated_at=? WHERE ws_id=?').run(settings.contentAt,ws);
    }
  }
  if(!settings.missingVerification){
    for(const [key,offset]of [['expired',-1],['boundary',0],['future',1]])insert('ba_verification',{id:key,expiresAt:at(nowMs+offset)});
  }else db.exec('DROP TABLE ba_verification');
  if(!settings.missingSessions){
    const cap=(settings.sessionCapDays??30)*DAY;
    for(const [key,expiresAt,createdAt]of [['expired',nowMs-1,nowMs-DAY],['cap-past',nowMs+DAY,nowMs-cap-1],['cap-boundary',nowMs+DAY,nowMs-cap],['valid',nowMs+DAY,nowMs-1]])insert('ba_session',{id:key,expiresAt:at(expiresAt),createdAt:at(createdAt)});
  }else db.exec('DROP TABLE ba_session');
  if(settings.missingMarkers)db.exec('DROP TABLE v2_deleted_sessions');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'Private fixture must start with valid foreign keys');
  const tableNames=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  const snapshot=()=>{
    const rows=Object.fromEntries(tableNames.map(table=>[table,db.prepare('SELECT * FROM '+id(table)).all().map(row=>({...row})).sort((a,b)=>storage.stable(a).localeCompare(storage.stable(b)))]));
    rows.sqlite_sequence=db.prepare('SELECT * FROM sqlite_sequence ORDER BY name').all();return rows;
  };
  const initial=normalize(snapshot()),initialFile=temporary?crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'):null;
  let active=false,reads=0,effects=0,captures=0,transactions=0,purges=0;
  const trace=[],wrapped=new WeakMap(),known=new WeakSet(),fault=new Error('owned retention core fault');
  const quiet=fn=>{const old=active;active=false;try{return fn();}finally{active=old;}};
  function watch(value,label){
    if(!value||typeof value!=='object'||value instanceof Date)return value;
    if(known.has(value))return value;if(wrapped.has(value))return wrapped.get(value);
    const proxy=new Proxy(value,{
      get(target,key,receiver){if(active&&typeof key==='string'){trace.push(['get',label,key]);if(++reads===settings.propertyFault)throw fault;}return watch(Reflect.get(target,key,receiver),label+'.'+String(key));},
      ownKeys(target){if(active)trace.push(['keys',label]);return Reflect.ownKeys(target);},
    });wrapped.set(value,proxy);known.add(proxy);return proxy;
  }
  function effect(name,args,fn){if(active){trace.push(['service',name,quiet(()=>normalize(args))]);if(++effects===settings.effectFault)throw fault;}return quiet(fn);}
  const sqlPort={};
  for(const method of ['get','all','run'])sqlPort[method]=function(sql,...args){
    assert.equal(this,sqlPort);
    return effect('db.'+method,[sql,...args],()=>{const value=db.prepare(sql)[method](...args);return method==='run'?Number(value.changes):watch(value,method+'.'+sql);});
  };
  const tx=function(callback){
    assert.equal(this,undefined);
    const callbackActive=active;
    return effect('tx',[],()=>{
      transactions++;trace.push(['tx.begin',transactions]);db.exec('BEGIN IMMEDIATE');
      const invoke=()=>{const previous=active;active=callbackActive;try{return callback();}finally{active=previous;}};
      try{const value=invoke();assert.notEqual(Object.prototype.toString.call(value),'[object Promise]');db.exec('COMMIT');trace.push(['tx.commit',normalize(value)]);return settings.asyncTx?Promise.resolve(value):value;}
      catch(error){db.exec('ROLLBACK');trace.push(['tx.rollback',normalize(error),error===fault]);if(settings.asyncTx)return Promise.reject(error);throw error;}
    });
  };
  const processEnv=watch({...settings.env},'processEnv');
  class FixedDate extends Date{constructor(...args){super(...(args.length?args:[settings.clock??nowMs]));}static now(){return settings.clock??nowMs;}}
  const supplied={
    eventActor:function(key,who){assert.equal(this,undefined);return effect('eventActor',[key,who],()=> 'ale.'+crypto.createHmac('sha256',key).update(who).digest('base64url'));},
    purgeWorkspace:function(dbArg,workspace){
      assert.equal(this,undefined);assert.equal(dbArg,sqlPort);
      return effect('purgeWorkspace',[workspace],()=>{
        purges++;
        db.prepare('UPDATE v2_events SET ws_id=? WHERE ws_id=?').run('wsx-private-'+purges,workspace);
        db.prepare('UPDATE v2_creation_codes SET ws_id=NULL WHERE ws_id=?').run(workspace);
        db.prepare('DELETE FROM v2_workspaces WHERE id=?').run(workspace);
      });
    },
    RESTORE_DAYS:settings.restoreDays??30,
    sessionMaxDays:function(env){assert.equal(this,undefined);return effect('sessionMaxDays',[env],()=>settings.sessionCapDays??30);},
    testIdpEnabled:function(env){assert.equal(this,undefined);return effect('testIdpEnabled',[env],()=>Object.hasOwn(settings,'idpEnabled')?settings.idpEnabled:env.ALIGN_TEST_IDP==='1');},
    readDate:function(){assert.equal(this,undefined);return effect('readDate',[],()=>FixedDate);},
    readProcessEnv:function(){assert.equal(this,undefined);return effect('readProcessEnv',[],()=>processEnv);},
  };
  const resources=new Proxy(supplied,{get(target,key){trace.push(['capture',String(key)]);if(++captures===settings.captureFault)throw fault;return target[key];},ownKeys(){throw Error('Resource enumeration forbidden');}});
  async function run(factory,operation='run'){
    let value,caught,didThrow=false,returnedPromise,outerStarted=false;
    try{
      const api=factory(resources);assert.deepEqual(Object.keys(api),exportsInOrder);
      for(const [name,length]of Object.entries(metadata)){
        assert.equal(api[name].name,name);assert.equal(api[name].length,length);assert.equal(api[name].constructor.name,name==='runRetention'?'AsyncFunction':'Function');
      }
      for(const [key,value]of Object.entries(data.constants))assert.deepEqual(normalize(api[key]),key==='RESTORE_DAYS'?(settings.restoreDays??30):value);
      assert(!Object.isFrozen(api.PERSON_COLUMNS));assert.equal(api.PERSON_COLUMNS,api.PERSON_COLUMNS);
      active=true;
      if(settings.outerTx){db.exec('BEGIN IMMEDIATE');outerStarted=true;trace.push(['harness.outer.begin']);}
      if(operation==='run'){
        const options=watch({dryRun:settings.dryRun??false,...(settings.explicitEnv?{env:processEnv}:{}),secret},'options');
        const result=api.runRetention(sqlPort,tx,new Date(nowMs),options);
        returnedPromise=Object.prototype.toString.call(result)==='[object Promise]';assert(returnedPromise);value=await result;
        if(settings.repeat)value={first:value,second:await api.runRetention(sqlPort,tx,new Date(nowMs),options)};
      }else if(operation==='clock')value=settings.explicitEnv?api.retentionNow(processEnv):api.retentionNow();
      else if(operation==='name')value=api.personName(settings.personId??user,Object.hasOwn(settings,'personName')?settings.personName:null);
      else if(operation==='former-id')value=api.formerMemberId(settings.n??1);
      else if(operation==='naming')value=api.workspacesNaming(sqlPort,user);
      else if(operation==='departure'){
        const first=api.noteDeparture(sqlPort,ws,user,nowIso);const second=api.noteDeparture(sqlPort,ws,user,at(nowMs+DAY));value=[first,second];
      }else if(operation==='cancel')value=api.cancelDeparture(sqlPort,ws,user);
      else if(operation==='pseudonymise')value=api.pseudonymise(sqlPort,ws,user,nowIso,secret);
      else if(operation==='orphans')value=api.deleteOrphanDirectives(sqlPort);
      else if(operation==='describe'){
        const entries=['workspaces_purged','sessions_rolled_up','usage_rows_rolled_up','former_members_pseudonymised','audit_rows_deleted','codes_deleted','sign_in_sessions_deleted','activity_deleted','invites_deleted','access_requests_deleted','events_deleted','asks_deleted','value_reports_deleted','requests_deleted','deleted_session_markers_deleted'];
        if(settings.reverseCounts)entries.reverse();value=api.describeCounts(watch(Object.fromEntries(entries.map((key,i)=>[key,i])),'counts'));
      }else throw Error('Unknown retention operation');
      if(outerStarted){db.exec('COMMIT');outerStarted=false;trace.push(['harness.outer.commit']);}
    }catch(error){caught=error;didThrow=true;if(outerStarted){db.exec('ROLLBACK');outerStarted=false;trace.push(['harness.outer.rollback']);}}
    active=false;
    const final=normalize(snapshot()),finalFile=temporary?crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'):null;
    const output={result:normalize(value),error:didThrow?{name:caught?.name,message:caught?.message,code:normalize(caught?.code),sameFault:caught===fault}:null,
      returnedPromise:normalize(returnedPromise),trace,reads,effects,captures,transactions,purges,initial,final,
      foreignKeyViolations:db.prepare('PRAGMA foreign_key_check').all(),fileBytesUnchanged:temporary?initialFile===finalFile:null};
    db.close();if(temporary)fs.rmSync(temporary,{recursive:true});return output;
  }
  return {run};
}
module.exports={fixture,normalize,resourceNames,metadata,exportsInOrder,NOW,DAY};
