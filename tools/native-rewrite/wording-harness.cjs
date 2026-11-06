// Independent wording observations. Callback descriptors are harness inputs only.
const fs = require("node:fs");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {createHash} = require("node:crypto");
const assert = require("node:assert/strict");
const MODULES = {
  "text-core.mts": ["dropControls", "dropInvisible", "cleanProse", "isBlankText"],
  "plural.mts": ["plural", "count"], "money.mts": ["usd"], "launch-words.ts": ["launchWords"],
  "change-words.mts": ["dependsOnFull", "hiddenGoals", "withHidden", "changeWords", "diffWords", "counterNoChange", "counterSameAsBase", "counterSameAsRequest"],
};
const DATA = {"text-core.mts": ["BLANK_FILLERS"], "change-words.mts": ["DEPENDS_ON_MAX", "COUNTER_SAME_AS_PROPOSAL"]};
const SYMBOL = Object.fromEntries([...Object.values(MODULES).flat(), "wordingData"].map(n => [n,n.replace(/[A-Z]/g,c => "_"+c.toLowerCase())]));
const CAPABILITY = Object.fromEntries(Object.entries(SYMBOL).map(([n,s]) => [n,"wording."+s.replace(/_/g,"-")]));
const TEXTS = ["", "a", "one", "two words", "__proto__", "constructor", "東京", "e\u0301", "\ud800", "\udfff", "\u0000", "a\r\nb\rc\nd\te", " \t\n ", "\u0085\u009f", "\u200b\u2060", "\u115f\u1160\u3164\uffa0\u2800", "\ufe0f\u034f\u0301", "👩‍💻", "👩🏿‍💻", "👩‍👩‍👧‍👧", "🏴\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}", "a\u200db", "\u200d👩", "👩\u200d", 'a"b', "a/b/c", "[Align] x", "a".repeat(400)];
const NUMBERS = [-Infinity,-Number.MAX_VALUE,-Number.MAX_SAFE_INTEGER,-2,-1,-0,0,Number.MIN_VALUE,0.1,0.5,0.999,1,1.001,1.5,2,4,5,6,49,50,99,100,9999,10000,Number.MAX_SAFE_INTEGER,Number.MAX_VALUE,Infinity,NaN];
const CALLBACKS = ["omitted","undefined","identity","wrap","indexed","throw"];
const EXTRA_OPTIONS = [{},{q:undefined,title:undefined,arrow:undefined},{q:null,title:null,arrow:null},
  {q:"wrap"},{title:"indexed"},{q:"indexed",title:"throw",arrow:" / "},
  {q:"identity",title:"wrap",arrow:"__proto__"},{q:"wrap",title:"identity",arrow:""}];
function* textVectors() {
  // Every code point, including each lone surrogate code unit.
  for(let cp=0;cp<=0x10ffff;cp++) yield [String.fromCodePoint(cp)];
  for(const text of TEXTS) for(const a of ["", "a", "👩", "\r", "\u200b"])
    for(const b of ["", "b", "💻", "\n", "\u0301"]) yield [a+text+b];
}
function measure(id,text,target){return{id,text,target};}
function limit(id,type,text){return{id,type,text};}
function* diffs() {
  for(const before of [undefined,null,"",...TEXTS.slice(1,12),0,1,false])
    for(const after of [undefined,null,"",...TEXTS.slice(1,12),0,1,false])
      for(const field of ["title","status","other","__proto__"]) yield [field,{before,after}];
  const rows = [[],[measure("a","A",null)],[measure("a","A","")],[measure("a","A","10")],
    [measure("a","B","20")],[measure("b","A",undefined)],
    [measure("a","A",null),measure("b","B","0")],
    [measure("b","B","0"),measure("a","A",null)],
    [measure("a","A",null),measure("a","duplicate","2")]];
  for(const before of rows) for(const after of rows) yield ["measures",{before,after}];
  for(const text of TEXTS) for(const target of [null,undefined,"",...TEXTS.slice(0,8)]) {
    yield ["measures",{before:[measure("x",text,target)],after:[measure("x",target ?? "",text)]}];
    yield ["measures",{before:[],after:[measure("x",text,target)]}];
  }
  const limits=[[],...["must","must_not","out_of_scope","other","__proto__","constructor"].flatMap(t=>
    [[limit("a",t,"A")],[limit("a",t,"B"),limit("b",t,"C")],[limit("b",t,"C"),limit("a",t,"B")]])];
  for(const before of limits) for(const after of limits) yield ["limits",{before,after}];
  const names=[[],["a"],["b"],["a","b"],["b","a"],["a","a"],["__proto__","constructor"]];
  for(const before of names) for(const after of names) for(const hidden of [undefined,null,{before:0,after:0},{before:0,after:2},{before:3,after:1},{before:1,after:1}])
    yield ["depends_on",{before,after,hidden}];
  for(const field of ["measures","limits","depends_on"]) for(const before of [null,undefined,"old",{}])
    for(const after of [null,undefined,"new",{}]) yield [field,{before,after}];
}
function* vectors(op) {
  assert(Object.hasOwn(CAPABILITY,op),"unknown wording operation");
  if(MODULES["text-core.mts"].includes(op)) {yield* textVectors();return;}
  if(op==="wordingData") {yield [];yield ["wrapper-mutation"];return;}
  if(op==="usd") {
    for(const n of NUMBERS) yield [n];
    for(let n=-202;n<=202;n++) for(const center of [0,50,100,9950,10000,995000,1000000]) yield [center+n];
    for(const n of [49.499,49.5,49.999,50,50.001,9949.499,9949.5,9949.999,9950,9950.001,9999,10000]) yield [n];
  } else if(op==="plural" || op==="count") {
    for(const n of NUMBERS) for(const one of TEXTS) {
      yield [n,one]; yield [n,one,undefined];
      for(const many of ["","people","__proto__","二人"]) {
        if(op==="plural") yield [n,one,many];
        else for(const fmt of CALLBACKS) yield [n,one,many,fmt];
      }
    }
  } else if(op==="launchWords") {
    for(const state of [null,undefined,"pending","not_yet","launched","superseded","other",...TEXTS.slice(0,8)])
      for(const base of NUMBERS) for(const version of [null,undefined,...NUMBERS]) yield [state,base,version];
  } else if(op==="dependsOnFull") {
    for(const a of NUMBERS) for(const b of NUMBERS) yield [a,b];
  } else if(op==="hiddenGoals") {
    for(const n of NUMBERS) yield [n];
  } else if(op==="withHidden") {
    for(const hidden of NUMBERS) for(const a of TEXTS) {
      yield [[],hidden]; yield [[a],hidden]; yield [[a,a],hidden];
      for(const b of TEXTS) yield [[a,b],hidden];
    }
  } else if(["counterNoChange","counterSameAsBase"].includes(op)) {
    for(const base of NUMBERS) for(const version of NUMBERS) yield [base,version];
  } else if(op==="counterSameAsRequest") {
    for(const text of TEXTS) for(const base of [-1,0,1,2,100]) for(const version of [-1,0,1,2,100]) yield [text,base,version];
  } else if(op==="changeWords") {
    for(const [field,diff] of diffs()) for(const mode of CALLBACKS) yield [field,diff,mode];
    for(const [field,diff] of diffs()) for(const option of EXTRA_OPTIONS) yield [field,diff,option];
  } else if(op==="diffWords") {
    for(const mode of CALLBACKS) {
      yield [{},mode];
      yield [{title:undefined,measures:null,status:false,other:{before:"a",after:"b"}},mode];
      for(const [field,diff] of diffs()) yield [{[field]:diff},mode];
      for(const text of TEXTS) yield [{depends_on:{before:["a"],after:["b"],hidden:{before:2,after:1}},status:{before:"active",after:"paused"},limits:{before:[],after:[limit("l","must",text)]},measures:{before:[],after:[measure("m",text,"1")]},title:{before:"Before",after:text}},mode];
    }
    for(const [field,diff] of diffs()) for(const option of EXTRA_OPTIONS) yield [{[field]:diff},option];
  }
}
function encode(value,seen=new Map()) {
  if(value===null)return["null"];
  const type=typeof value;
  if(type==="undefined")return["undefined"];
  if(type==="number")return["number",Object.is(value,-0)?"-0":String(value)];
  if(type==="string"||type==="boolean")return[type,value];
  if(type!=="object"&&type!=="function")return[type,String(value)];
  if(seen.has(value))return["ref",seen.get(value)];
  const id=seen.size;seen.set(value,id);
  const keys=Object.keys(value).sort().map(k=>[k,encode(value[k],seen)]);
  if(type==="function")return["function",id,value.name,value.length,keys];
  return Array.isArray(value)?["array",id,value.length,keys]:["object",id,Object.getPrototypeOf(value)===Object.prototype?"plain":Object.getPrototypeOf(value)===null?"null":"other",keys];
}
function prepare(op,vector) {
  const args=structuredClone(vector),calls=[],errors=[];
  function callback(mode,label) {
    const refused=mode==="throw"?new Error("callback "+label+" refused"):null;
    if(refused)errors.push(refused);
    return function observed(value) {
      calls.push([label,encode(value)]);
      if(refused) throw refused;
      if(mode==="identity")return value;
      if(mode==="indexed")return label+calls.length+":"+String(value);
      return "["+label+":"+String(value)+"]";
    };
  }
  if(op==="count"&&args.length===4) {
    const mode=args.pop();
    if(mode!=="omitted")args.push(mode==="undefined"?undefined:callback(mode,"fmt"));
  } else if(op==="changeWords"||op==="diffWords") {
    const mode=args.pop();
    if(mode&&typeof mode==="object") {
      const options={};
      for(const [key,value] of Object.entries(mode))options[key]=["q","title"].includes(key)&&value!=null?callback(value,key):value;
      args.push(options);
    } else if(mode!=="omitted")args.push(mode==="undefined"?undefined:{q:callback(mode,"q"),title:callback(mode,"title"),arrow:mode==="indexed"?" => ":mode==="identity"?"":"→"});
  }
  return {args,calls,errors};
}
function referenceAnchors(value,seen=new Set(),result=[]) {
  if(value===null||!["object","function"].includes(typeof value)||seen.has(value))return result;
  seen.add(value);result.push(value);
  for(const key of Object.keys(value))referenceAnchors(value[key],seen,result);
  return result;
}
function dataProbe(methods) {
  const first=methods.wordingData(),second=methods.wordingData(),saved={...first};
  try {
    first.BLANK_FILLERS="changed";first.DEPENDS_ON_MAX=-1;first.COUNTER_SAME_AS_PROPOSAL="changed";
    return {shared_wrapper:first===second,original:saved,after:methods.wordingData()};
  } finally {Object.assign(first,saved);}
}
function runBatch(methods,op,start,limit,pureBaseline=false) {
  assert(Number.isSafeInteger(start)&&start>=0&&Number.isSafeInteger(limit)&&limit>0,"invalid wording range");
  const hash=createHash("sha256");let index=0,count=0;
  for(const vector of vectors(op)) {
    if(index++<start)continue;if(count===limit)break;
    const {args,calls,errors}=prepare(op,vector),anchors=referenceAnchors(args),before=encode({arguments:args,anchors});let outcome;
    try {outcome=["return",op==="wordingData"&&args.length?dataProbe(methods):methods[op](...args)];}catch(e){outcome=["throw",e?.name,e?.message,errors.includes(e)];}
    if(pureBaseline)assert.deepEqual(encode({arguments:args,anchors}),before,"baseline mutates wording arguments");
    hash.update(JSON.stringify(encode({arguments:args,anchors,calls,outcome}))+"\n");count++;
  }
  assert.equal(count,limit,"wording range exceeds matrix");
  return {observations:count,sha256:hash.digest("hex")};
}
async function loadBaseline(root) {
  const methods={},data={};
  for(const [file,names] of Object.entries(MODULES)) {
    const m=await import(pathToFileURL(path.join(root,file)).href);
    assert.deepEqual(Object.keys(m).filter(k=>typeof m[k]==="function").sort(),[...names].sort(),"unobserved wording functions");
    assert.deepEqual(Object.keys(m).filter(k=>typeof m[k]!=="function").sort(),[...(DATA[file]||[])].sort(),"unobserved wording data");
    for(const name of names)methods[name]=m[name];
    for(const key of DATA[file]||[])data[key]=m[key];
  }
  methods.wordingData=()=>({...data});return methods;
}
async function loadGenerated(root,surface) {
  const files=[],methods={};
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
    if(e.name.startsWith(".")||e.name==="node_modules")continue;
    const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&[".js",".mjs",".cjs"].includes(path.extname(p)))files.push(p);
  }}walk(root);
  for(const op of Object.keys(CAPABILITY)) {
    const binding=surface?.capabilities.find(c=>c.capability===CAPABILITY[op]);
    if(surface&&(!binding||!binding.symbols.includes(SYMBOL[op])))throw new Error("missing wording capability");
    const modulePath=binding?.module||"wording/"+SYMBOL[op];
    const hits=files.filter(f=>{const r=path.relative(root,f).split(path.sep).join("/");return [".js",".mjs",".cjs"].some(ext=>r===modulePath+ext||r.endsWith("/"+modulePath+ext));});
    assert.equal(hits.length,1,"expected one wording module");
    const m=await import(pathToFileURL(hits[0]).href);methods[op]=m[SYMBOL[op]]??m.default?.[SYMBOL[op]]??m.default;
    assert.equal(typeof methods[op],"function","missing wording callable");
  }return methods;
}
const countVectors=op=>{let n=0;for(const ignored of vectors(op)){void ignored;n++;}return n;};
async function main() {
  if(["--baseline","--generated"].includes(process.argv[1])) {
    const [mode,raw]=process.argv.slice(1),[op,start,limit]=JSON.parse(raw);
    const methods=mode==="--baseline"?await loadBaseline(process.cwd()):await loadGenerated(process.cwd());
    process.stdout.write(JSON.stringify(runBatch(methods,op,start,limit,mode==="--baseline"))+"\n");
  } else {
    const [root,surfaceRaw,casesRaw]=process.argv.slice(2),surface=JSON.parse(surfaceRaw),cases=[];
    const methods=await loadGenerated(root,surface);
    for(const c of JSON.parse(casesRaw)) {
      const [op,start,limit]=c.arguments;assert.equal(CAPABILITY[op],c.capability,"mixed wording batch");
      cases.push({case_id:c.case_id,capability:c.capability,result:runBatch(methods,op,start,limit)});
    }process.stdout.write(JSON.stringify({schema:"literate-ai/library-acceptance-results@1",cases})+"\n");
  }
}
module.exports={MODULES,DATA,SYMBOL,CAPABILITY,TEXTS,NUMBERS,vectors,countVectors,encode,prepare,referenceAnchors,runBatch,loadBaseline,loadGenerated};
if(require.main===module||["--baseline","--generated"].includes(process.argv[1]))main().catch(e=>{console.error(e.stack||e);process.exit(1);});
