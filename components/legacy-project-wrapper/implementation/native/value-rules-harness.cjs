// Independent observations of the value-card API. Environment records are test inputs.
const fs = require("node:fs");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {createHash} = require("node:crypto");
const assert = require("node:assert/strict");
const FUNCTIONS = ["estimateSaid", "cleanValueText", "safeFollowUpUrl", "loiUrlOk", "followUpUrl", "followUpProblem", "spanWords"];
const DATA = ["ESTIMATE_WORDS", "VALUE_QUESTION", "VALUE_NOTE_MAX", "VALUE_EDIT_DAYS"];
const SYMBOL = Object.fromEntries([...FUNCTIONS, "valueData"].map(n => [n,n.replace(/[A-Z]/g,c => "_"+c.toLowerCase())]));
const CAPABILITY = Object.fromEntries(Object.entries(SYMBOL).map(([n,s]) => [n,"value."+s.replace(/_/g,"-")]));
const ENV_KEYS = ["ALIGN_FOLLOW_UP_URL", "HOSTED", "ALIGN_PUBLIC_ORIGIN"];
const TEXTS = ["", "a", "two words", "__proto__", "constructor", "東京", "e\u0301", "\ud800", "\udfff", "\u0000", "a\r\nb\rc\nd\te", " \t\n ", "\u0085\u009f", "\u200b\u2060", "\u115f\u1160\u3164\uffa0\u2800", "\ufe0f\u034f\u0301", "👩‍💻", "👩🏿‍💻", "👩‍👩‍👧‍👧", "🏴\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}", "a\u200db", "\u200d👩", "👩\u200d", 'a"b', "a/b/c", "a".repeat(501)];
function* urls() {
  yield undefined; yield null; yield "";
  for (const scheme of ["https", "HTTPS", "http", "mailto", "javascript", "ftp", "file", "data", "other"])
    for (const host of ["example.test", "EXAMPLE.TEST", "localhost", "127.0.0.1", "[::1]", "", "例え.テスト", "bad host", "a..b", "a%2fb.test"])
      for (const tail of ["", "/a/../b?q=1#f", ":443/path", ":444/path", ":0", ":65536", "\\a", "/%zz", "/a b"])
        for (const user of ["", "user@", "user:pass@", ":@"])
          yield scheme+"://"+user+host+tail;
  for (const address of ["a@example.test", "A+tag@EXAMPLE.TEST", "a@localhost", "a@b.c", "a,b@example.test", "a;b@example.test", '"a"@example.test', "a b@example.test", "a%40b.test", "a@b%2etest", "a@b.test%0a", "%", "%ff", "a@b.test@c.test", "<a@b.test>", "a&b@c.test"])
    for (const query of ["", "?subject=Hello", "?SUBJECT=Hi", "?subject=a&subject=b", "?Subject=a&SUBJECT=b", "?body=x", "?cc=x", "?bcc=x", "?to=x", "?s%75bject=x", "?subject=x&", "?subject=x&other=y", "?=x", "?", "#fragment"])
      yield "mailto:"+address+query;
  for (const value of ["https:example.test", "https:///example.test", "//example.test", "https://example.test:0443", "https://example.test.", "mailto://a@example.test", ...TEXTS])
    for (const padding of ["", " ", "\t\r\n", "\u00a0", "\u200b"]) yield padding+value+padding;
}
function* vectors(op) {
  assert(Object.hasOwn(CAPABILITY,op),"unknown value operation");
  if(op==="cleanValueText") {
    for(let cp=0;cp<=0x10ffff;cp++)yield [String.fromCodePoint(cp)];
    for(const text of TEXTS)for(const a of ["", "a", "👩", "\r", "\u200b"])for(const b of ["", "b", "💻", "\n", "\u0301"])yield [a+text+b];
  } else if(op==="estimateSaid") {
    for(const id of ["same_day", "two_to_three_days", "about_a_week", "longer", "would_not_be_decided", ...TEXTS])yield [id];
  } else if(op==="safeFollowUpUrl"||op==="loiUrlOk") {
    for(const url of urls())if(op==="safeFollowUpUrl"||typeof url==="string")yield [url];
  } else if(op==="followUpUrl"||op==="followUpProblem") {
    for(const url of urls())if(typeof url==="string"||url===undefined)yield ["explicit",{ALIGN_FOLLOW_UP_URL:url,HOSTED:"1",ALIGN_PUBLIC_ORIGIN:"https://origin.test/a"}];
    for(const follow of [undefined,""," ","https://follow.test/a","http://bad.test","mailto:a@b.test?subject=x"])
      for(const hosted of [undefined,"","0","1","true"," 1 "])
        for(const origin of [undefined,"","https://origin.test/a","https://user:pass@origin.test:8443/a?b#c","http://origin.test","https://[::1]:443/a","https://例え.テスト/a","bad"])
          for(const mode of ["explicit","omitted","undefined"])yield [mode,{ALIGN_FOLLOW_UP_URL:follow,HOSTED:hosted,ALIGN_PUBLIC_ORIGIN:origin}];
  } else if(op==="spanWords") {
    for(const value of [-Infinity,-Number.MAX_VALUE,-1,-0,0,Number.MIN_VALUE,NaN,Infinity,Number.MAX_VALUE,Number.MAX_SAFE_INTEGER])yield [value];
    for(const center of [0,1000,59000,60000,61000,3599000,3600000,3660000,86399000,86400000,90000000,172800000])
      for(let offset=-1501;offset<=1501;offset++)yield [center+offset];
    for(let seconds=0;seconds<200000;seconds+=137)yield [seconds*1000+499.5];
  } else if(op==="valueData") {yield [];yield ["mutations"];}
}
function encode(value,seen=new Map()) {
  if(value===null)return["null"];
  const type=typeof value;
  if(type==="undefined")return["undefined"];
  if(type==="number")return["number",Object.is(value,-0)?"-0":String(value)];
  if(type==="string"||type==="boolean")return[type,value];
  if(seen.has(value))return["ref",seen.get(value)];
  const id=seen.size;seen.set(value,id);
  const keys=Object.keys(value).sort().map(k=>[k,encode(value[k],seen)]);
  return Array.isArray(value)?["array",id,value.length,keys]:[type,id,Object.getPrototypeOf(value)===Object.prototype?"plain":Object.getPrototypeOf(value)===null?"null":"other",keys];
}
function withEnvironment(env,call) {
  // Saved operator values remain local and never enter output or fingerprints.
  const saved=ENV_KEYS.map(key=>[key,process.env[key]]);
  try {
    for(const key of ENV_KEYS)if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];
    return call();
  } finally {for(const [key,value] of saved)if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
function dataProbe(methods) {
  const first=methods.valueData(),second=methods.valueData(),array=first.ESTIMATE_WORDS;
  const saved=[...array],row={...array[0]},initial=encode(first);
  try {
    first.VALUE_NOTE_MAX=-1;first.VALUE_EDIT_DAYS=-1;first.VALUE_QUESTION="changed";first.ESTIMATE_WORDS=[];
    const wrapper=encode(methods.valueData());
    array[0].said="changed said";
    array.push({id:"new_id",label:"New label",said:"new said"});
    return {initial,wrapper,same_wrapper:first===second,same_array:second.ESTIMATE_WORDS===methods.valueData().ESTIMATE_WORDS,
      mutable:!Object.isFrozen(array)&&!Object.isFrozen(array[0]),
      changed:methods.estimateSaid(row.id),added:methods.estimateSaid("new_id"),after:encode(methods.valueData())};
  } finally {Object.assign(saved[0],row);array.splice(0,array.length,...saved);}
}
function runBatch(methods,op,start,limit,pureBaseline=false) {
  assert(Number.isSafeInteger(start)&&start>=0&&Number.isSafeInteger(limit)&&limit>0,"invalid value range");
  const hash=createHash("sha256");let index=0,count=0;
  for(const vector of vectors(op)) {
    if(index++<start)continue;if(count===limit)break;
    const args=structuredClone(vector),before=encode(args);let outcome;
    try {
      let result;
      if(op==="valueData"&&args.length)result=dataProbe(methods);
      else if(op==="followUpUrl"||op==="followUpProblem") {
        const [mode,env]=args;
        result=mode==="explicit"?methods[op](env):withEnvironment(env,()=>mode==="omitted"?methods[op]():methods[op](undefined));
      } else result=methods[op](...args);
      outcome=["return",result];
    } catch(e){outcome=["throw",e?.name,e?.message];}
    if(pureBaseline)assert.deepEqual(encode(args),before,"baseline mutates value arguments");
    hash.update(JSON.stringify(encode({arguments:args,outcome}))+"\n");count++;
  }
  assert.equal(count,limit,"value range exceeds matrix");return{observations:count,sha256:hash.digest("hex")};
}
async function loadBaseline(root) {
  const loaded=await import(pathToFileURL(path.join(root,"value-core.mts")).href),methods={};
  assert.deepEqual(Object.keys(loaded).filter(k=>typeof loaded[k]==="function").sort(),[...FUNCTIONS].sort(),"unobserved value functions");
  assert.deepEqual(Object.keys(loaded).filter(k=>typeof loaded[k]!=="function").sort(),[...DATA].sort(),"unobserved value data");
  for(const name of FUNCTIONS)methods[name]=loaded[name];
  methods.valueData=()=>Object.fromEntries(DATA.map(name=>[name,loaded[name]]));return methods;
}
async function loadGenerated(root,surface) {
  const files=[],methods={};
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(e.name.startsWith(".")||e.name==="node_modules")continue;
    const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&[".js",".mjs",".cjs"].includes(path.extname(p)))files.push(p);
  }}walk(root);
  for(const op of Object.keys(CAPABILITY)) {
    const binding=surface?.capabilities.find(c=>c.capability===CAPABILITY[op]);
    if(surface&&(!binding||!binding.symbols.includes(SYMBOL[op])))throw new Error("missing value capability");
    const modulePath=binding?.module||"value_rules/"+SYMBOL[op];
    const hits=files.filter(f=>{const r=path.relative(root,f).split(path.sep).join("/");return[".js",".mjs",".cjs"].some(ext=>r===modulePath+ext||r.endsWith("/"+modulePath+ext));});
    assert.equal(hits.length,1,"expected one value module");
    const loaded=await import(pathToFileURL(hits[0]).href);methods[op]=loaded[SYMBOL[op]]??loaded.default?.[SYMBOL[op]]??loaded.default;
    assert.equal(typeof methods[op],"function","missing value callable");
  }return methods;
}
function countVectors(op){let count=0;for(const value of vectors(op)){void value;count++;}return count;}
async function main() {
  if(["--baseline","--generated"].includes(process.argv[1])) {
    const [mode,raw]=process.argv.slice(1),[op,start,limit]=JSON.parse(raw);
    const methods=mode==="--baseline"?await loadBaseline(process.cwd()):await loadGenerated(process.cwd());
    process.stdout.write(JSON.stringify(runBatch(methods,op,start,limit,mode==="--baseline"))+"\n");
  } else {
    const [root,surfaceRaw,casesRaw]=process.argv.slice(2),surface=JSON.parse(surfaceRaw),cases=[];
    const methods=await loadGenerated(root,surface);
    for(const c of JSON.parse(casesRaw)) {
      const [op,start,limit]=c.arguments;assert.equal(CAPABILITY[op],c.capability,"mixed value batch");
      cases.push({case_id:c.case_id,capability:c.capability,result:runBatch(methods,op,start,limit)});
    }process.stdout.write(JSON.stringify({schema:"literate-ai/library-acceptance-results@1",cases})+"\n");
  }
}
module.exports={FUNCTIONS,DATA,SYMBOL,CAPABILITY,ENV_KEYS,TEXTS,urls,vectors,encode,withEnvironment,dataProbe,runBatch,loadBaseline,loadGenerated,countVectors};
if(require.main===module||["--baseline","--generated"].includes(process.argv[1]))main().catch(e=>{console.error(e.stack||e);process.exit(1);});
