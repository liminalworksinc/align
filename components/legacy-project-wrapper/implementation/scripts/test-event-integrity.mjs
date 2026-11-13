import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
const application=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

const temporary=fs.mkdtempSync(path.join(os.homedir(),'.align-event-integrity-'));
const data=path.join(temporary,'data'),file=path.join(data,'v2','align.sqlite');
fs.mkdirSync(path.dirname(file),{recursive:true});
process.env.ALIGN_DATA_DIR=data;process.env.ALIGN_SECRET='owned-ephemeral-control-secret';process.env.HOSTED='0';
const core=await import('../lib/v2/core.mts');
const {changePrograms}=await import('../lib/storage-schema.mts');
const database=new DatabaseSync(file,{enableForeignKeyConstraints:true,timeout:5000});
const NOW='2026-11-12T00:00:00.000Z',records=[];
const sql={run(statement,...args){return Number(database.prepare(statement).run(...args).changes);},get(statement,...args){return database.prepare(statement).get(...args);},all(statement,...args){return database.prepare(statement).all(...args);}};
const quoted=name=>'"'+name.replaceAll('"','""')+'"';
const snapshot=()=>Object.fromEntries(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,database.prepare('SELECT * FROM '+quoted(name)+' ORDER BY rowid').all()]));
function admin(args){
 const result=spawnSync(process.execPath,['--disable-warning=ExperimentalWarning',path.join(application,'scripts/align-admin.mjs'),...args],{cwd:temporary,env:{PATH:process.env.PATH,HOME:temporary,TMPDIR:temporary,TZ:'UTC',LANG:'C',ALIGN_DATA_DIR:data,ALIGN_SECRET:'owned-ephemeral-control-secret',HOSTED:'0'},encoding:'utf8',timeout:25000});
 assert.equal(result.error,undefined);assert.equal(result.signal,null);return {status:result.status,stdout:result.stdout,stderr:result.stderr};
}
function workspace(id,deleted=null){database.prepare('INSERT INTO v2_workspaces(id,name,created_by,created_at,deleted_at) VALUES(?,?,?,?,?)').run(id,'Owned control workspace','owned-person',NOW,deleted);}
function malformedRequest(id){database.prepare('INSERT INTO v2_device_requests(id,device_code_hash,user_code,device_name,public_key,created_at,expires_at,interval_s,state,ws_ids_json) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,id+'-hash',id+'-code','Owned device','owned-public-fixture',NOW,'2030-01-01T00:00:00Z',5,'pending','invalid');}
try{
 database.exec('CREATE TABLE ba_user(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL)');
 database.prepare('INSERT INTO ba_user VALUES(?,?,?)').run('owned-person','Owned person','owned@example.invalid');
 const programs=changePrograms();database.exec('PRAGMA foreign_keys=OFF');
 for(const program of programs)database.exec(program);
 database.exec('PRAGMA foreign_keys=ON;PRAGMA user_version='+programs.length);
 assert.equal(core.SCHEMA_VERSION,programs.length);
 workspace('ws_owned_one');workspace('ws_owned_two');
 core.recordEvent(sql,'workspace_created',{ws:'ws_owned_one',actor:'owned-actor',props:{kind:'blank'},at:NOW});
 database.prepare('INSERT INTO v2_audit(ws_id,actor_id,action,object_id,at) VALUES(?,?,?,?,?)').run('ws_owned_one','owned-person','owned.test','owned-object',NOW);
 malformedRequest('owned-malformed');
 const beforeDirect=snapshot();let writes=0,directError;
 const watched={...sql,run(...args){writes++;return sql.run(...args);}};
 try{core.purgeWorkspace(watched,'ws_owned_one');}catch(error){directError=error;}
 assert(directError instanceof SyntaxError);assert.equal(writes,0);assert.deepEqual(snapshot(),beforeDirect);
 records.push({name:'direct purge validates every device JSON value before its first write',satisfied:true,writes});
 let before=snapshot(),result=admin(['workspaces','delete','ws_owned_one','--purge','--yes']);
 assert.equal(result.status,1,result.stderr);assert.match(result.stderr,/JSON|Unexpected token/);
 assert.deepEqual(snapshot(),before,'Actual operator caller must roll back every table');
 records.push({name:'actual operator purge rolls back malformed device JSON',satisfied:true,actual_Node_command:true,all_tables_unchanged:true,status:result.status});
 database.prepare('UPDATE v2_workspaces SET deleted_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z','ws_owned_one');
 before=snapshot();result=admin(['retention','run']);
 assert.equal(result.status,1,result.stderr);assert.match(result.stderr,/JSON|Unexpected token/);assert.deepEqual(snapshot(),before,'Actual retention caller must roll back its failed purge step');
 records.push({name:'actual retention command rolls back malformed device JSON',satisfied:true,actual_Node_command:true,all_tables_unchanged:true,status:result.status});
 database.prepare('UPDATE v2_device_requests SET ws_ids_json=? WHERE id=?').run(JSON.stringify(['ws_owned_one','ws_owned_two']),'owned-malformed');
 result=admin(['workspaces','delete','ws_owned_one','--purge','--yes']);assert.equal(result.status,0,result.stderr);
 assert.equal(database.prepare('SELECT COUNT(*) AS n FROM v2_workspaces WHERE id=?').get('ws_owned_one').n,0);
 const event=database.prepare('SELECT ws_id,actor FROM v2_events WHERE name=?').get('workspace_created');
 assert.match(event.ws_id,/^wsx_[a-z2-7]{24}$/);assert.equal(event.actor,'owned-actor');
 assert.deepEqual(JSON.parse(database.prepare('SELECT ws_ids_json FROM v2_device_requests WHERE id=?').get('owned-malformed').ws_ids_json),['ws_owned_two']);
 records.push({name:'ordinary purge retains privacy redaction and unrelated device workspace',satisfied:true,actual_Node_command:true});
 const accepted=[];
 for(const name of ['toString','__proto__','constructor']){try{core.recordEvent(sql,name,{props:{},at:NOW});accepted.push(name);}catch{}}
 records.push({name:'event names restricted to the declared own keys',satisfied:accepted.length===0,accepted_inherited_names:accepted,scope:'Direct current production core API. No claim of an HTTP exploit.'});
 const eventId=database.prepare("SELECT id FROM v2_events WHERE name='workspace_created'").get().id;
 let workspaceReassigned=false,actorReassigned=false;
 try{database.prepare('UPDATE v2_events SET ws_id=? WHERE id=?').run('ws_owned_two',eventId);workspaceReassigned=true;}catch{}
 try{database.prepare('UPDATE v2_events SET actor=? WHERE id=?').run('different-owned-actor',eventId);actorReassigned=true;}catch{}
 records.push({name:'event attribution rejects arbitrary reassignment while allowing privacy redaction',satisfied:!workspaceReassigned&&!actorReassigned,workspace_reassigned:workspaceReassigned,actor_reassigned:actorReassigned,scope:'Owned direct SQLite integrity probe. Privacy redaction remains required.'});
 const unsatisfied=records.filter(row=>!row.satisfied).length;
 console.log(JSON.stringify({schema:'align/event-integrity-caller-controls@2',execution_completed:true,security_controls_satisfied:records.length-unsatisfied,security_controls_unsatisfied:unsatisfied,records,network:'none',actual_SQLite:true,owned_temporary_database_only:true,finding_dispositions_changed:false,independent_or_operator_security_acceptance:false}));
 console.log(`test-event-integrity: ${records.length-unsatisfied} passed, ${unsatisfied} failed`);
 process.exitCode=unsatisfied?2:0;
}finally{database.close();fs.rmSync(temporary,{recursive:true,force:true});}
