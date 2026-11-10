"use strict";
// Synthetic records for isolated storage acceptance only.
const assert = require("node:assert/strict");
module.exports = function storageFixtures(inventory) {
const T="2026-01-01T00:00:00.000Z", LATER="2026-02-01T00:00:00.000Z";
const identifier=n=>'"'+n.replaceAll('"','""')+'"';
const stable=value=>JSON.stringify(value,(_key,x)=>x&&typeof x==="object"&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
function rows(db,table,columns) {
  return db.prepare(`SELECT ${columns.map(identifier).join(",")} FROM ${identifier(table)}`).all().map(r=>JSON.parse(JSON.stringify(r))).sort((a,b)=>stable(a).localeCompare(stable(b)));
}
function seed(db,version) {
  const tables=new Map(inventory.snapshots[version].tables.map(t=>[t.name,t]));
  const added=new Map();
  function add(name,data) {
    const table=tables.get(name);if(!table)return;
    const keys=table.columns.map(c=>c.name).filter(k=>Object.hasOwn(data,k)&&data[k]!==undefined);
    for(const c of table.columns)if(c.notnull&&c.dflt_value===null&&!keys.includes(c.name))throw new Error("Missing explicit fixture field "+name+"."+c.name);
    db.prepare(`INSERT INTO ${identifier(name)} (${keys.map(identifier).join(",")}) VALUES (${keys.map(()=>"?").join(",")})`).run(...keys.map(k=>data[k]));
    added.set(name,(added.get(name)||0)+1);
  }
  for(const s of ["a","b"]) {
    const ws="fixture-ws-"+s,owner="fixture-owner-"+s,member="fixture-member-"+s,viewer="fixture-viewer-"+s;
    const pod="fixture-pod-"+s,goal="fixture-goal-"+s,other="fixture-other-goal-"+s,source="fixture-source-goal-"+s;
    const device="fixture-device-"+s,session="fixture-session-"+s,alignment="fixture-alignment-"+s;
    const directive="fixture-directive-"+s,requestDirective="fixture-request-directive-"+s,holdDirective="fixture-hold-directive-"+s;
    const epoch="fixture-epoch-"+s,grant="fixture-grant-"+s,request="fixture-request-"+s,reallocation="fixture-reallocation-"+s;
    const approvedCR="fixture-change-approved-"+s,ask="fixture-ask-"+s,seq=(s==="a"?10:20);
    for(const user of [owner,member,viewer])db.prepare("INSERT INTO ba_user(id) VALUES(?)").run(user);
    db.prepare("INSERT INTO ba_passkey(id) VALUES(?)").run("fixture-passkey-"+s);
    add("v2_workspaces",{id:ws,name:"Fixture workspace "+s,created_by:owner,created_at:T,deleted_at:null,steering:"on"});
    for(const [user,role] of [[owner,"owner"],[member,"member"],[viewer,"viewer"]])add("v2_members",{ws_id:ws,user_id:user,role,created_at:T});
    add("v2_pods",{id:pod,ws_id:ws,name:"Fixture team "+s,created_at:T});
    add("v2_pod_members",{ws_id:ws,pod_id:pod,user_id:owner,role:"lead",created_at:T});
    add("v2_pod_members",{ws_id:ws,pod_id:pod,user_id:member,role:"member",created_at:T});
    add("v2_invites",{id:"fixture-invite-"+s,ws_id:ws,token_hash:"fixture-invite-hash-"+s,email:"invite-"+s+"@fixture.invalid",role:"member",created_by:owner,created_at:T,expires_at:LATER,accepted_at:null,accepted_by:null,team_id:pod,team_role:"member"});
    for(const [id,user] of [[goal,owner],[other,owner],[source,member]]) {
      add("v2_goals",{id,ws_id:ws,owner_id:user,pod_id:pod,visibility:"workspace",version:1,title:"Fixture café "+id,measures_json:'[{"id":"fixture-measure","text":"Keep bytes"}]',anchors_json:'["fixture-anchor"]',status:"active",created_at:T,updated_at:LATER,depends_on_json:"[]",level:"team",limits_json:'[{"id":"fixture-limit","value":5}]',target_share:40});
      add("v2_goal_versions",{ws_id:ws,goal_id:id,version:1,title:"Fixture café "+id,measures_json:'[{"id":"fixture-measure","text":"Keep bytes"}]',anchors_json:'["fixture-anchor"]',status:"active",content_hash:"fixture-content-hash-"+id,created_by:user,created_at:T,depends_on_json:"[]",limits_json:'[{"id":"fixture-limit","value":5}]',target_share:40});
    }
    add("v2_goal_acks",{ws_id:ws,goal_id:source,parent_id:goal,parent_version:1,at:T});
    add("v2_audit",{seq:seq+1,ws_id:ws,actor_id:owner,action:"fixture.action",object_id:goal,at:T});
    add("v2_devices",{id:device,user_id:member,name:"Fixture machine "+s,public_key:"fixture-public-key-"+s,created_at:T,last_seen_at:LATER,revoked_at:null,revoked_reason:null,replaces:"fixture-prior-device-"+s});
    add("v2_device_requests",{id:"fixture-device-request-"+s,device_code_hash:"fixture-device-code-hash-"+s,user_code:"FIXTURE-"+s.toUpperCase(),device_name:"Fixture machine "+s,public_key:"fixture-public-key-"+s,created_at:T,expires_at:LATER,interval_s:5,last_poll_at:T,state:"approved",user_id:member,ws_ids_json:JSON.stringify([ws]),device_id:device,approved_name:"Fixture approved machine "+s});
    add("v2_device_grants",{device_id:device,ws_id:ws});
    for(const kind of ["access","refresh"])add("v2_device_tokens",{token_hash:"fixture-token-hash-"+kind+"-"+s,device_id:device,kind,created_at:T,expires_at:LATER,rotated_at:null});
    add("v2_alignments",{id:alignment,ws_id:ws,requester_id:member,target_goal_id:goal,source_goal_id:source,state:"approved",revision:1,created_at:T,updated_at:LATER,decided_at:LATER,revoked_at:null,revoked_by:null});
    add("v2_alignment_revisions",{ws_id:ws,alignment_id:alignment,revision:1,choice:"contribution",effects_json:'{"fixture":"effect"}',approvers_json:JSON.stringify([owner]),note:"Fixture note 東京",author_id:member,created_at:T});
    add("v2_alignment_approvals",{ws_id:ws,alignment_id:alignment,revision:1,user_id:owner,at:LATER});
    add("v2_sessions",{ws_id:ws,session_key:session,user_id:member,device_id:device,harness:"codex",repo_key:"fixture-repo-key-"+s,repo_alias:"Fixture repository",title:"Fixture session café",started_at:T,state:"shared",stopped_at:null,governing_goal_id:goal,governing_alignment_id:alignment,agent_stopped:0,conflicts:1,created_at:T,updated_at:LATER,ended_reason:null});
    add("v2_alignment_sessions",{ws_id:ws,alignment_id:alignment,revision:1,session_key:session});
    add("v2_epochs",{ws_id:ws,session_key:session,epoch_id:epoch,goal_id:goal,goal_version_at_start:1,starts_at:T,ends_at:null,root_turn:"fixture-root-turn",cause:"fixture-cause",authority:"alignment",alignment_id:alignment,created_at:T});
    add("v2_usage",{ws_id:ws,session_key:session,request_key:"fixture-request-key-"+s,epoch_id:epoch,ts:T,model:"fixture-model",query_source:"fixture-query",input:123,output:45,cache_read:67,cache_write_5m:8,cache_write_1h:9,cache_write_unsplit:10,basis:"fixture-basis",est_list_usd_micros:1234567,price_table_version:"fixture-prices",source:"fixture-source",received_at:LATER});
    add("v2_directives",{seq:seq+1,id:directive,ws_id:ws,kind:"goal_version",goal_id:goal,goal_json:'{"fixture":"goal"}',binding_json:'{"fixture":"binding"}',created_at:T,request_json:null,hold_json:null});
    if(version>=12) {
      add("v2_directives",{seq:seq+2,id:requestDirective,ws_id:ws,kind:"request",goal_id:goal,goal_json:null,binding_json:null,created_at:T,request_json:'{"fixture":"request"}',hold_json:null});
      add("v2_directives",{seq:seq+3,id:holdDirective,ws_id:ws,kind:"hold",goal_id:goal,goal_json:null,binding_json:null,created_at:T,request_json:null,hold_json:'{"fixture":"hold"}'});
    }
    add("v2_directive_targets",{ws_id:ws,directive_id:directive,session_key:session});
    add("v2_receipts",{ws_id:ws,directive_id:directive,session_key:session,state:"applied",at:T,recorded_at:LATER,auto_accepted:0});
    add("v2_activity",{seq:seq+1,ws_id:ws,session_key:session,user_id:member,goal_id:goal,repo_id:"fixture-repo-"+s,kind:"edit",path_hash:"fixture-path-hash-"+s,path:"fixture/file.ts",text:null,at:T,expires_at:LATER});
    add("v2_oauth_grants",{id:grant,ws_id:ws,user_id:member,client_id:"https://fixture.invalid/client/"+s,client_name:"Fixture app "+s,redirect_host:"fixture.invalid",created_at:T,last_used_at:LATER,refresh_hash:"fixture-refresh-hash-"+s,prev_refresh_hash:"fixture-prior-refresh-hash-"+s,refresh_exp:1900000000,kid:"fixture-key-"+s,scope:"goals:read changes:evidence",last_read_at:LATER});
    for(const state of ["pending","countered","approved","rejected","withdrawn","superseded"]) {
      const id="fixture-change-"+state+"-"+s;
      add("v2_change_requests",{id,ws_id:ws,goal_id:state==="countered"?other:goal,requester_id:member,state,revision:1,base_version:1,changes_json:'{"title":"Fixture changed café"}',reason:"Fixture reason "+state,approved_by:state==="approved"?owner:null,rejected_by:state==="rejected"?owner:null,decision_note:"Fixture decision",version:state==="approved"?2:null,created_at:T,updated_at:LATER,decided_at:state==="pending"||state==="countered"?null:LATER,approved_without_evidence:state==="approved"?1:null,launch:state==="approved"?"not_yet":null,approved_json:state==="approved"?'{"title":"Fixture approved"}':null,launch_by:state==="approved"?owner:null,launch_at:state==="approved"?LATER:null});
      add("v2_change_request_revisions",{ws_id:ws,change_request_id:id,revision:1,base_version:1,changes_json:'{"title":"Fixture changed café"}',note:"Fixture revision 東京",author_id:member,created_at:T,snapshot_json:'{"fixture":"snapshot"}',condition:"Fixture condition",acknowledged_by:member,acknowledged_at:LATER});
    }
    add("v2_spend_rollups",{ws_id:ws,goal_id:goal,day:"2026-01-01",model:"fixture-model",basis:"fixture-basis",requests:2,input:123,output:45,cache_read:67,cache_write_5m:8,cache_write_1h:9,cache_write_unsplit:10,est_list_usd_micros:1234567,unpriced_requests:1});
    add("v2_former_members",{ws_id:ws,user_id:viewer,n:null,removed_at:T,pseudonymised_at:null});
    add("v2_former_members",{ws_id:ws,user_id:null,n:17,removed_at:T,pseudonymised_at:LATER});
    add("v2_passkey_use",{passkey_id:"fixture-passkey-"+s,last_used_at:LATER});
    add("v2_passkey_prompt_dismissed",{user_id:owner,dismissed_at:T});
    add("v2_creation_codes",{id:"fixture-code-"+s,code_hash:"fixture-code-hash-"+s,email:"owner-"+s+"@fixture.invalid",request_id:"fixture-access-"+s,created_at:T,expires_at:LATER,revoked_at:null,redeemed_at:LATER,redeemed_by:owner,ws_id:ws});
    add("v2_access_requests",{id:"fixture-access-"+s,email:"owner-"+s+"@fixture.invalid",name:"Fixture owner "+s,company:"Fixture company",team_size:"2-5",use_case:"Fixture use case",interest:"evaluate",status:"approved",created_at:T,decided_at:LATER,code_id:"fixture-code-"+s});
    add("v2_rate_hits",{key:"fixture-rate-"+s,at:1767225600000});
    add("v2_change_request_evidence",{id:"fixture-evidence-"+s,ws_id:ws,change_request_id:approvedCR,revision:1,kind:"doc",url:"https://fixture.invalid/doc/"+s,label:"Fixture evidence",source:"person",added_by:owner,added_at:T});
    add("v2_events",{id:seq+1,name:"workspace_created",ws_id:ws,actor:"fixture-actor-hash-"+s,at:T,props:'{"kind":"blank"}'});
    add("v2_asks",{id:ask,ws_id:ws,team_id:pod,goal_id:goal,text:"Fixture ask 東京",from_label:"Fixture meeting",created_by:member,source_kind:"meeting",source_title:"Fixture source",source_date:"2026-01-01",state:"accepted",decided_by:owner,decided_at:LATER,created_at:T,updated_at:LATER});
    add("v2_ask_mentions",{ws_id:ws,ask_id:ask,n:1,date:"2026-01-01",text:"Fixture mention",source_title:"Fixture source",added_by:member,added_at:T});
    add("v2_value_reports",{id:"fixture-value-report-"+s,ws_id:ws,change_request_id:approvedCR,person_id:member,estimate:"about_a_week",note:"Fixture value note",created_at:T,updated_at:LATER});
    add("v2_requests",{id:request,ws_id:ws,goal_id:goal,type:"checkpoint",target_goal_id:null,goal_version:1,note:"Fixture request",sender_id:owner,sender_role:"owner",directive_id:requestDirective,created_at:T,cancelled_at:null,cancelled_by:null});
    add("v2_request_targets",{ws_id:ws,request_id:request,session_key:session,state:"accepted",auto_accepted:1,updated_at:LATER,ended_reason:null});
    add("v2_goal_holds",{ws_id:ws,goal_id:goal,held_by:owner,reason:"Fixture hold",held_at:T,directive_id:holdDirective});
    add("v2_steering_events",{ws_id:ws,session_key:session,goal_id:goal,suggested_goal_id:other,share:20,target:40,at:T,recorded_at:LATER});
    add("v2_reallocations",{id:reallocation,ws_id:ws,requester_id:member,state:"approved",revision:1,launch:"pending",launch_by:owner,launch_at:LATER,decided_by:owner,decision_note:"Fixture decision",created_at:T,updated_at:LATER,decided_at:LATER});
    add("v2_reallocation_revisions",{ws_id:ws,reallocation_id:reallocation,revision:1,targets_json:JSON.stringify([{goal_id:goal,target_share:40},{goal_id:other,target_share:60}]),note:"Fixture revision",author_id:member,created_at:T});
    add("v2_reallocation_approvals",{ws_id:ws,reallocation_id:reallocation,revision:1,goal_id:goal,user_id:owner,at:LATER});
    add("v2_deleted_sessions",{ws_id:ws,key_hash:"fixture-deleted-key-hash-"+s,deleted_at:T});
    add("v2_oauth_goal_sends",{grant_id:grant,ws_id:ws,goal_id:goal,version:1,sent_at:LATER});
  }
  for(const [name,table] of tables) {
    assert((added.get(name)||0)>0,"Every table present must contain fixture data: "+name);
    if(/AUTOINCREMENT/i.test(table.sql)) {
      const first=db.prepare(`SELECT * FROM ${identifier(name)} LIMIT 1`).get();
      const primary=table.columns.find(c=>c.pk===1&&c.type==="INTEGER").name;
      const clone={...first,[primary]:9000000};
      if(name==="v2_directives")clone.id="fixture-deleted-high-directive";
      if(name==="v2_events"){clone.name="value_card_viewed";clone.actor="fixture-deleted-high-actor";}
      add(name,clone);db.prepare(`DELETE FROM ${identifier(name)} WHERE ${identifier(primary)}=?`).run(9000000);
    }
  }
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0,"Populated fixture must be valid before migration");
  return tables;
}

return {seed,rows,stable,identifier,T,LATER};
};
