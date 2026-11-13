// Observe the remaining envelope API without reproducing its wording algorithms.
const fs = require("node:fs");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {createHash} = require("node:crypto");
const assert = require("node:assert/strict");
const ENVELOPE_METHODS = ["clean","endSentence","quoted","boundLimits","renderEnvelope","asksBlock","limitsSeen","limitChange","renderDelta","renderAsksDelta","renderAsksGone","renderFollowedAsksEnded","measureKey","renderContextDelta","personName","remotePath","shortId","sendersWords","renderCard","crossNote","collisionReason","collisionsReason","siblingChangeNote","boundContextNote","requestShortId","requestWhat","requestNotice","requestContext","requestAnswerLine","requestWithdrawnNotice","holdReason","stoppedForGoodWords","goalMark","outOfReachWords","otherWorkspaceWords","expiredWhy","releaseNotice","keptHoldsNote"];
const ENDED_METHODS = ["shareAgainWords","latchWayOut","latchNoticeTail","neverSentWords","storedText","stateSituation","toldSituation","noneTold","shareNotice","shareRetell","endedWhyWords"];
const ENDED_DATA_KEYS = ["SHARE_CHANGED", "STOP_HOLDS_NO_SHARE"];
const DATA_KEYS = ["ENVELOPE_MAX","ENVELOPE_MAX_WITH_LIMITS","ASKS_MAX","ASK_TEXT_MAX","ASKS_SHOWN","DELTA_MAX","LIMIT_WORDS","CARD_MAX","CARD_MAX_BOTH","TEAM_POINTER","SELF_ELSEWHERE","NAME_NOT_SHARED","SAFE_REQUESTS","GOAL_MARKS","HELD_MARK"];
const snake = name => name.replace(/[A-Z]/g,c => "_" + c.toLowerCase());
const SYMBOL = Object.fromEntries([...ENVELOPE_METHODS,...ENDED_METHODS].map(n => [n,snake(n)]));
SYMBOL.envelopeData = "envelope_data"; SYMBOL.endedData = "ended_data";
const CAPABILITY = Object.fromEntries(Object.entries(SYMBOL).map(([n,s]) => [n,"agent-envelope." + s.replace(/_/g,"-")]));
const TEXTS = ["","one","two words","__proto__","constructor","東京","e\u0301"," \n\t ","a\"b","[Align] injected","[\tALIGN text","a/b/c","\u0000","a!".repeat(120),"q".repeat(600),"x".repeat(2400)];
const IDS = ["","short","12345678-more","01900000-1234-7abc-8123-0123456789ab","not-hex-long-id","[Align] x"];
const NUMBERS = [-1,0,0.5,1,2,60];
const own = (m,keys) => Object.fromEntries(keys.map(k => [k,m[k]]));
const goal = (text="Goal",i=0) => ({id:"g_"+i,title:text,status:i%3 === 0?"active":"paused",version:i,
  measures:Array.from({length:i%10},(_,n)=>({id:"m"+n,text:text+" measure "+n,target:n%2?text:null})),
  limits:Array.from({length:i%7},(_,n)=>({id:"l"+n,type:["must","must_not","out_of_scope"][n%3],text:text+" limit "+n}))});
const GOALS = TEXTS.flatMap((t,i)=>[goal(t,i),goal(t,6),goal(t,9)]);
GOALS.push({...goal(),measures:undefined,limits:undefined},{...goal(),measures:null,limits:null},{...goal(),measures:"old",limits:{}});
const ask = (text,n=0) => ({id:"a"+n,text,asked_by:text+" asked",asked_on:"2026-11-05",accepted_by:text+" accepted"});
const team = (text="Team",n=1,member=true) => ({team:{id:"t",name:text},member,asks:Array.from({length:n},(_,i)=>ask(text,i))});
const TEAMS = [null,undefined,...TEXTS.flatMap(t=>[team(t,0),team(t,1),team(t,6,false)])];
const context = (text,n=1) => Array.from({length:n},(_,i)=>({rel:i%2?"depends":"parent",goal:goal(text,i+6),stale:i%3===0}));
const CONTEXTS = [[],...TEXTS.flatMap(t=>[context(t,1),context(t,4),context(t,6)])];
const sibling = (text,i=0) => ({harness:i%2?"codex":"claude-code",id:IDS[i%IDS.length],minutes_ago:NUMBERS[i%NUMBERS.length],
  files:[text,"src/valid.ts","bad/../path"],commits:[text],who:text,remote:!!(i%2),overlap:i%3?[]:["src/valid.ts"],
  task:text,goal:text,unnamed:i%3,sessions:i%4,claims:["src/claimed.ts"]});
const SIBLINGS = [[],...TEXTS.flatMap(t=>[Array.from({length:1},(_,i)=>sibling(t,i)),Array.from({length:2},(_,i)=>sibling(t,i+1)),Array.from({length:6},(_,i)=>sibling(t,i))])];
const REQUESTS = TEXTS.flatMap((t,i)=>["checkpoint","replan","switch_goal"].flatMap(type=>["owner","approver",undefined].map(role=>({
  id:IDS[i%IDS.length],type,sender:{name:t,role},goal:goal(t,i),target_goal:goal(t+" target",i+1),note:i%3?t:"",
  cancel_reason:i%2?"goal_closed":"withdrawn"}))));
const RELEASES = [null,{goals:[],stopped:false},{goals:["G"],stopped:false},{goals:["A","B"],stopped:true},{goals:TEXTS,stopped:true}];
const AGAIN = [{}, {unread:false,login:false},{unread:true},{login:true},{unread:true,login:true}];
const KEYS = ["","started:text","share_err:text","stopped:web","stopped:before_end","stopped:share_refused","stopped:refused",
  "changed:live","changed:other","out:signed_out","out:signed_out_unsent","out:signed_out_ended","reshare:signed_in",
  "reshare:relogin","reshare:workspace_back","reshare:removed","reshare:server_signed_out","noreach:signed_in_noreach",
  "noreach:relogin_noreach","noreach:signed_in_removed","noreach:relogin_removed","noreach:removed_again","noreach:reach_lost",
  "noreach:access_lost","noreach:access_lost_again","none:live","none:stopped","none:out","none:reshare","none:noreach","none:hold","no-colon"];
const TOLDS = [null,...KEYS.map((key,i)=>({id:i%2?"event":"older",key,tail:i%3?"":" tail"}))];
const EVENTS = ["started","share_err","signed_out","access_lost","removed","server_signed_out","stopped_on_web","stopped_before_end","share_stopped","upload_refused","changed"];
const FACTS = EVENTS.flatMap(e=>Array.from({length:8},(_,i)=>({e,ws:"Workspace",goal:i%2?"Goal":null,text:i%3?"stored text":"",
  before:i%2?"an earlier end":undefined,via:i&2?"login":undefined,out_since:i&4?true:undefined,unsent:i&1?true:undefined,g:i})));
function states() {
  const result=[];
  for (const ended of [null,"device_signed_out","access_lost","sharing_ended"]) for (const member of [undefined,false,true]) for(let bits=0;bits<64;bits++) {
    result.push({live:!!(bits&1),ended,signed_in:!!(bits&2),reaches:!!(bits&4),reshare:!!(bits&8),unread:!!(bits&16),latched:!!(bits&32),member,release:null});
  }
  for(const release of RELEASES.slice(1)) for(const login of [undefined,false,true]) for(const ended of ["device_signed_out","access_lost"]) {
    result.push({live:false,ended,signed_in:true,reaches:true,reshare:false,unread:false,latched:true,release,login});
  }
  return result;
}
const STATES = states();
function* baseVectors(op) {
  if(!Object.hasOwn(CAPABILITY,op)) throw new Error("unknown envelope operation");
  if(op==="envelopeData") {for(const mode of ["snapshot","changed-labels","changed-safe-requests","empty-safe-requests"])yield[mode];return;}
  if(op==="endedData") {yield [];return;}
  if(["clean","quoted"].includes(op)) {for(const t of [...TEXTS,null,undefined,0,false,{},["a","b"]]) for(const max of [-1,0,1,3,20,50,100,300]) yield [t,max];return;}
  if(["endSentence","personName","remotePath","requestShortId","renderFollowedAsksEnded","neverSentWords"].includes(op)) {
    for(const t of [...TEXTS,'end."',"end!)","end?)","../bad","/absolute","good/path.ts","You, on another machine","a file (name not shared)"]) yield [t];return;
  }
  if(op==="shortId") {for(const h of ["claude-code","codex"])for(const id of IDS)yield[h,id];return;}
  if(["boundLimits","limitsSeen","measureKey"].includes(op)) {for(const g of GOALS)yield[op==="measureKey"?{text:g.title,target:g.title}:g];if(op==="limitsSeen")yield[null];return;}
  if(op==="renderEnvelope"){for(const g of GOALS)for(const c of CONTEXTS)for(const a of [null,team("Team",1),team(TEXTS[15],6,false)])yield[g,c,a];return;}
  if(op==="asksBlock"){for(const a of TEAMS)yield[a];return;}
  if(op==="limitChange"){for(const g of GOALS)for(const seen of [undefined,[],(Array.isArray(g.limits)?g.limits:[]).map(l=>({id:l.id,text:l.text})),[{id:"l0",text:"old"}],[{id:"removed",text:"gone"}]])yield[g,seen];return;}
  if(op==="renderDelta"){for(const kind of ["bound","updated","unbound"])for(const g of [null,...GOALS])for(const changes of [null,{added:[],removed:[]},{added:goal(TEXTS[15],6).limits,removed:[]},{added:[],removed:[{id:"gone",text:TEXTS[15]}]}])yield[kind,g,changes];return;}
  if(op==="renderAsksDelta"){for(const ta of TEAMS.filter(Boolean))for(const added of [[],[ask("new")],Array.from({length:7},(_,n)=>ask(TEXTS[15],n))])for(const removed of [0,1,4])yield[ta,added,removed];return;}
  if(op==="renderAsksGone"){for(const ta of TEAMS.filter(Boolean))yield[ta];return;}
  if(op==="renderContextDelta"){for(const c of CONTEXTS.flat())for(const before of [undefined,[],["old"],[{text:c.goal.title}].map(x=>x.text)])yield[c,before];return;}
  if(op==="sendersWords" || op==="renderCard"){for(const s of SIBLINGS)if(op==="renderCard")yield[s];else for(const more of ["","more "])yield[s,more];return;}
  if(op==="boundContextNote"){for(const c of CONTEXTS)yield[c];return;}
  if(op==="crossNote"){for(const t of TEXTS)for(const n of NUMBERS)for(const opts of [{},{remote:true,task:"private task"},{goal:t,claimUntil:t,task:t},{remote:true,goal:t,claimUntil:t,task:t}])yield[t,t,n,opts];return;}
  if(op==="collisionReason" || op==="siblingChangeNote"){for(const t of TEXTS)for(const h of ["claude-code","codex"])for(const n of NUMBERS)yield[h,IDS[3],t,n];return;}
  if(op==="collisionsReason"){for(const t of TEXTS)for(const n of [0,1,2,4,6])yield[Array.from({length:n},(_,i)=>({harness:i%2?"codex":"claude-code",id:IDS[i%IDS.length],file:i%2?t:"same.ts",minutesAgo:NUMBERS[i%NUMBERS.length]}))];return;}
  if(["requestWhat","requestNotice","requestWithdrawnNotice","requestContext","requestAnswerLine"].includes(op)){
    for(const r of REQUESTS)if(op==="requestContext")for(const id of [null,r.goal.id,"other"])yield[r,id];
    else if(op==="requestAnswerLine")for(const answer of ["accepted","declined"])yield[r,answer];else yield[r];return;
  }
  if(op==="holdReason"){yield[null];yield[{}];yield[{holds:[]}];for(const t of TEXTS)for(const n of [1,3])for(const ended of [null,"device_signed_out"])for(const release of [false,true])yield[{holds:Array.from({length:n},()=>({by:t,goal_title:t,reason:t})),ended,release}];return;}
  if(op==="stoppedForGoodWords" || op==="otherWorkspaceWords" || op==="releaseNotice"){for(const t of TEXTS)for(const b of [t,"other"])yield[t,b];return;}
  if(op==="goalMark"){for(const bindable of [undefined,false,true])for(const allocation of [undefined,null,{}, {held:false},{held:true}])yield[{bindable,allocation}];return;}
  if(op==="outOfReachWords"){for(const t of TEXTS)for(const latched of [false,true])yield[t,IDS[3],latched];return;}
  if(op==="expiredWhy"){yield[];yield[undefined];yield[null];for(const reason of [undefined,"device_signed_out","receipt_refused","member_removed","sharing_stopped","other"])for(const answer of [undefined,"accepted","declined","other"])for(const error of [undefined,"",false,0,{},TEXTS[15]])yield[{expired_reason:reason,refused_answer:answer,refused_error:error}];return;}
  if(op==="keptHoldsNote"){yield[[]];for(const t of TEXTS)for(const n of [1,2,6])yield[Array(n).fill(t)];return;}
  if(op==="shareAgainWords"){for(const t of TEXTS)for(const unread of [false,true])for(const there of [false,true])for(const unsent of [false,true])yield[unread,t,there,unsent];yield[false,"here"];return;}
  if(op==="latchWayOut" || op==="latchNoticeTail"){for(const id of IDS)for(const reshare of [false,true])for(const release of RELEASES)for(const again of AGAIN) {
    if(op==="latchWayOut")for(const reader of ["model","user"])yield[id,reshare,reader,release,again];else yield[id,reshare,release,again];
  }yield op==="latchWayOut"?["id",false,"model"]:["id",false];return;}
  if(op==="storedText"){for(const f of FACTS)yield[f];for(const e of EVENTS)for(const text of TEXTS)yield[{e,ws:text,goal:text,text}];return;}
  if(op==="stateSituation" || op==="noneTold"){for(const n of STATES)yield op==="noneTold"?["event",n]:[n];return;}
  if(op==="toldSituation"){for(const k of [...KEYS,...TEXTS])yield[k];return;}
  if(op==="shareNotice"){
    const prior=[null,...["started:text","changed:live","out:signed_out","reshare:relogin","noreach:relogin_noreach","none:stopped"].map((key,i)=>({id:i%2?"event":"older",key,tail:i%3?" tail":""}))];
    for(const n of STATES)for(const f of FACTS)for(const told of prior)yield[IDS[3],"event",f,n,told];
    for(const t of TEXTS)for(const f of FACTS)for(const told of TOLDS)yield[IDS[3],"event",{...f,ws:t,goal:t,text:t,before:t},STATES[370],told,f];
    return;
  }
  if(op==="shareRetell"){for(const key of KEYS)for(const tail of [""," tail","changed tail"])for(const told of TOLDS)for(const fresh of [false,true])for(const changed of [false,true])yield["event",{key,tail,text:"text"},told,fresh,changed];return;}
  if(op==="endedWhyWords"){for(const why of ["device_signed_out","access_lost","sharing_ended"])for(const again of [false,true])for(const relogin of [false,true])for(const brief of [false,true])yield[why,again,relogin,brief];yield["device_signed_out",false];return;}
  throw new Error("missing envelope vectors for " + op);
}
function* legacyVectors(op){
  yield* baseVectors(op);
  // Append default probes so every original observation keeps its position.
  if(op==="renderEnvelope")for(const g of GOALS){yield[g];yield[g,undefined];yield[g,undefined,undefined];}
  if(op==="renderDelta")for(const kind of ["bound","updated"])for(const g of GOALS){yield[kind,g];yield[kind,g,undefined];}
  if(op==="renderAsksDelta"){
    for(const t of TEXTS)for(const removed of [0,1,4,Number.MAX_SAFE_INTEGER])yield[team(t),[ask(t)],removed];
    for(const removed of [0,1,4])yield[team("T".repeat(100)),[{id:"long",text:"[Align] "+"A".repeat(300),asked_by:"B".repeat(100),asked_on:"2026-11-05",accepted_by:"C".repeat(100)}],removed];
  }
  if(op==="renderContextDelta")for(const c of CONTEXTS.flat())yield[c];
  if(op==="sendersWords")for(const s of SIBLINGS){yield[s];yield[s,undefined];}
  if(op==="crossNote")for(const t of TEXTS){yield[t,t,0];yield[t,t,0,undefined];}
  if(op==="shareAgainWords"){yield[false,"here",undefined,undefined];yield[true,"here",true,undefined];}
  if(op==="latchWayOut"){yield["id",false,"model",undefined,undefined];yield["id",false,"user",RELEASES[3],undefined];}
  if(op==="latchNoticeTail"){yield["id",false,undefined,undefined];yield["id",false,RELEASES[3],undefined];}
  if(op==="shareNotice")for(const f of FACTS.slice(0,12))yield["id","event",f,STATES[370],null,undefined];
  if(op==="shareRetell")for(const key of KEYS){yield["event",{key,tail:"",text:""},null,false];yield["event",{key,tail:"",text:""},TOLDS[1],true,undefined];}
  if(op==="endedWhyWords"){yield["device_signed_out",true,undefined,undefined];yield["access_lost",true,true,undefined];}
}
// Keep the complete earlier matrix and its default probes as an exact prefix.
// Append the new public inputs, including explicit false and omitted defaults.
function* vectors(op) {
  yield* legacyVectors(op);
  if (op === "latchWayOut" || op === "latchNoticeTail") {
    const againAt = op === "latchWayOut" ? 4 : 3;
    const stopAt = againAt + 1;
    for (const original of legacyVectors(op)) {
      for (const lost of [false, true]) {
        const args = structuredClone(original);
        args[againAt] = {...(args[againAt] || {}), lost};
        yield args;
      }
      for (const stopped of [false, true]) for (const lost of [undefined, false, true]) {
        const args = structuredClone(original);
        if (lost !== undefined) args[againAt] = {...(args[againAt] || {}), lost};
        args[stopAt] = stopped;
        yield args;
      }
    }
  } else if (op === "outOfReachWords") {
    for (const original of legacyVectors(op)) for (const stopped of [false, true]) {
      yield [...structuredClone(original), stopped];
    }
  } else if (["shareNotice", "stateSituation", "noneTold"].includes(op)) {
    const stateAt = op === "shareNotice" ? 3 : op === "noneTold" ? 1 : 0;
    for (const original of legacyVectors(op)) for (const stopped of [false, true]) {
      const args = structuredClone(original);
      args[stateAt] = {...args[stateAt], stopped};
      yield args;
    }
  }
}
function encode(value,seen=new Map()) {
  if(value===null)return["null"];
  const type=typeof value;
  if(type==="undefined")return["undefined"];
  if(type==="number")return["number",Object.is(value,-0)?"-0":String(value)];
  if(type==="string" || type==="boolean")return[type,value];
  if(type!=="object")return[type,String(value)];
  if(seen.has(value))return["ref",seen.get(value)];
  const id=seen.size;seen.set(value,id);
  const keys=Object.keys(value).sort().map(k=>[k,encode(value[k],seen)]);
  if(value instanceof Set)return["set",id,[...value].map(v=>encode(v,seen)),keys];
  if(value instanceof Map)return["map",id,[...value].map(([k,v])=>[encode(k,seen),encode(v,seen)]),keys];
  return Array.isArray(value)?["array",id,value.length,keys]:["object",id,Object.getPrototypeOf(value)===Object.prototype?"plain":Object.getPrototypeOf(value)===null?"null":"other",keys];
}
const countVectors=op=>{let n=0;for(const ignored of vectors(op)){void ignored;n++;}return n;};
const publicState=methods=>({envelope:methods.envelopeData(),ended:methods.endedData()});
function dataProbe(methods,mode){
  const first=methods.envelopeData(),second=methods.envelopeData();
  const labels=first.LIMIT_WORDS,safe=first.SAFE_REQUESTS;
  const savedLabels={...labels},savedSafe=[...safe];
  try{
    if(mode==="changed-labels"){labels.must="Custom must";labels.must_not="Custom must not";labels.out_of_scope="Custom outside";}
    else if(mode==="changed-safe-requests"){safe.clear();safe.add("other");safe.add("__proto__");}
    else if(mode==="empty-safe-requests")safe.clear();else assert.equal(mode,"snapshot");
    return {shared_labels:labels===second.LIMIT_WORDS,shared_safe:safe===second.SAFE_REQUESTS,
      data:structuredClone(methods.envelopeData()),limit_words:methods.boundLimits(goal("Probe",3)),
      envelope:methods.renderEnvelope(goal("Probe",3)),safe_probes:["checkpoint","replan","other","__proto__"].map(k=>methods.envelopeData().SAFE_REQUESTS.has(k))};
  }finally{
    for(const k of Object.keys(labels))delete labels[k];Object.assign(labels,savedLabels);
    safe.clear();for(const k of savedSafe)safe.add(k);
  }
}
function runBatch(methods,op,start,limit,pureBaseline=false){
  assert(Number.isSafeInteger(start)&&start>=0&&Number.isSafeInteger(limit)&&limit>0,"invalid envelope range");
  const hash=createHash("sha256");let index=0,count=0;
  for(const vector of vectors(op)){
    if(index++<start)continue;if(count===limit)break;
    const args=structuredClone(vector),before=encode(args),publicBefore=encode(publicState(methods));let outcome;
    try{outcome=["return",op==="envelopeData"?dataProbe(methods,...args):methods[op](...args)];}catch(e){outcome=["throw",e?.name,e?.message];}
    if(pureBaseline){assert.equal(outcome[0],"return","baseline throws for a supported envelope input");assert.deepEqual(encode(args),before,"baseline mutates envelope arguments");assert.deepEqual(encode(publicState(methods)),publicBefore,"baseline mutates public envelope data");}
    hash.update(JSON.stringify(encode({arguments:args,outcome,public_state:publicState(methods)}))+"\n");count++;
  }
  assert.equal(count,limit,"envelope range exceeds matrix");return{observations:count,sha256:hash.digest("hex")};
}
async function loadBaseline(root){
  const env=await import(pathToFileURL(path.join(root,"envelope.ts")).href),ended=await import(pathToFileURL(path.join(root,"ended.ts")).href);
  const methods={...own(env,ENVELOPE_METHODS),...own(ended,ENDED_METHODS),envelopeData:()=>own(env,DATA_KEYS),endedData:()=>own(ended,ENDED_DATA_KEYS)};
  assert.deepEqual(Object.keys(env).filter(k=>typeof env[k]==="function").sort(),[...ENVELOPE_METHODS].sort(),"unobserved envelope functions");
  assert.deepEqual(Object.keys(ended).filter(k=>typeof ended[k]==="function").sort(),[...ENDED_METHODS].sort(),"unobserved ended functions");
  assert.deepEqual(Object.keys(env).filter(k=>typeof env[k]!=="function").sort(),[...DATA_KEYS].sort(),"unobserved envelope data");
  assert.deepEqual(Object.keys(ended).filter(k=>typeof ended[k]!=="function").sort(),[...ENDED_DATA_KEYS].sort(),"unobserved ended data");
  return methods;
}
async function loadGenerated(root,surface){
  const files=[],methods={};
  function walk(dir){
    for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      if(e.name.startsWith(".")||e.name==="node_modules")continue;
      const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(e.isFile()&&[".js",".mjs",".cjs"].includes(path.extname(f)))files.push(f);
    }
  }
  walk(root);
  for(const op of Object.keys(CAPABILITY)){
    const binding=surface?.capabilities.find(c=>c.capability===CAPABILITY[op]);
    if(surface&&(!binding||!binding.symbols.includes(SYMBOL[op])))throw new Error("missing envelope capability");
    const modulePath=binding?.module||"agent_envelope/"+SYMBOL[op];
    const hits=files.filter(f=>{
      const relative=path.relative(root,f).split(path.sep).join("/");
      return [".js",".mjs",".cjs"].some(ext=>relative===modulePath+ext||relative.endsWith("/"+modulePath+ext));
    });
    assert.equal(hits.length,1,"expected one envelope module for "+op);
    const m=await import(pathToFileURL(hits[0]).href);
    methods[op]=m[SYMBOL[op]]??m.default?.[SYMBOL[op]]??m.default;
    assert.equal(typeof methods[op],"function","missing envelope callable");
  }
  return methods;
}
async function main(){
  if(["--baseline","--generated"].includes(process.argv[1])){
    const [mode,raw]=process.argv.slice(1),[op,start,limit]=JSON.parse(raw);
    const methods=mode==="--baseline"?await loadBaseline(process.cwd()):await loadGenerated(process.cwd());
    process.stdout.write(JSON.stringify(runBatch(methods,op,start,limit,mode==="--baseline"))+"\n");
  }else{
    const [root,surfaceRaw,casesRaw]=process.argv.slice(2),surface=JSON.parse(surfaceRaw),cases=[];
    const methods=await loadGenerated(root,surface);
    for(const c of JSON.parse(casesRaw)){
      const [op,start,limit]=c.arguments;assert.equal(CAPABILITY[op],c.capability,"mixed envelope capability batch");
      cases.push({case_id:c.case_id,capability:c.capability,result:runBatch(methods,op,start,limit)});
    }
    process.stdout.write(JSON.stringify({schema:"literate-ai/library-acceptance-results@1",cases})+"\n");
  }
}
module.exports={ENVELOPE_METHODS,ENDED_METHODS,DATA_KEYS,CAPABILITY,SYMBOL,TEXTS,STATES,FACTS,legacyVectors,ENDED_DATA_KEYS,vectors,countVectors,encode,publicState,dataProbe,runBatch,loadBaseline,loadGenerated};
if(require.main===module||["--baseline","--generated"].includes(process.argv[1]))main().catch(e=>{console.error(e.stack||e);process.exit(1);});
