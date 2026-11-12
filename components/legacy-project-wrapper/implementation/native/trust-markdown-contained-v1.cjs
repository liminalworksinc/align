'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"fa4291f0861e41e5a2a523770aad97f91f4d04f441ffdf3d69ca3f24206bf22a","package":"trust_markdown","package_files":["package.json","parse_inline.js","parse_markdown.js","plain.js","safe_href.js","slug.js"],"maximum_cases":21,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {// Independent structural observations for the trust-document Markdown reader.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {pathToFileURL}=require("node:url"),{createHash}=require("node:crypto");
const FUNCTIONS=["slug","safeHref","parseInline","plain","parseMarkdown"];
const SYMBOL=Object.fromEntries(FUNCTIONS.map(n=>[n,n.replace(/[A-Z]/g,c=>"_"+c.toLowerCase())]));
const CAPABILITY=Object.fromEntries(Object.entries(SYMBOL).map(([n,s])=>[n,"trust-markdown."+s.replace(/_/g,"-")]));
// Cached real trust-document fixtures, with original content identities.
const DOCUMENTS=JSON.parse(require("node:zlib").inflateSync(Buffer.from("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","base64")).toString());
const TEXTS=["","a","A","hello world","a--b","a_b","__proto__","constructor","東京","é","e\u0301","İ","K","👩‍💻",
  " \t\n","\r\n","\u0000","\u007f","\u0085","\u00a0","\u200b","\u2028","\ufeff","\ud800","<script>x</script>",
  "[TOKEN]","[TOKEN] [MAIL]","[TOKEN][T] TOKEN","10 2 1","a.b*+?^$()[]{}|\\","a#b#c","*word*","`code`","[x](doc.md#hello)"];
const URLS=["","#","#A B","#a-b","#東京","#a#b","http://example.com","HTTPS://example.com/a?b#c","https:///x",
  "http://","https://?x","https://#x","mailto:person@example.com","MAILTO:a:b@example.com","mailto:bad","mailto:@x",
  "javascript:alert(1)","data:text/html,x","file:a","a+b:x","1a:x","//example.com","/trust","doc.md","./doc.md",
  "././doc.md","../RETENTION.md","../RETENTION.md#A B","doc.md#one#two","unknown.md","[TOKEN]",...TEXTS];
const OPTIONS=[
  {prefix:"doc",resolve:"omitted",fill:"none"},
  {prefix:"",resolve:"undefined",fill:"empty"},
  {prefix:"__proto__",resolve:"null",fill:"tokens"},
  {prefix:"東京",resolve:"map",fill:"tokens"},
  {prefix:"doc",resolve:"always",fill:"overlap"},
  {prefix:"a-b",resolve:"map",fill:"null-prototype"},
  {prefix:"doc",resolve:"throw-error",fill:"tokens"},
  {prefix:"",resolve:"throw-object",fill:"overlap"},
  {prefix:"constructor",resolve:"map",fill:"empty-key"},
  {prefix:"doc",resolve:"always",fill:"null"},
  {prefix:"doc",resolve:"map",fill:"undefined"},
  {prefix:"doc",resolve:"always",fill:"html"},
  {prefix:"doc",resolve:"map",fill:"overlap-reversed"},
  {prefix:"doc",resolve:"map",fill:"numeric"},
  {prefix:"",resolve:"place",page:"",fill:"tokens"},
  {prefix:"__proto__",resolve:"place",page:"http://example.com",fill:"tokens"},
  {prefix:"東京",resolve:"place",page:"javascript:opaque",fill:"tokens"},
  {prefix:"a b",resolve:"place",page:"../relative",fill:"tokens"},
];
const EXTRA_OPTIONS=[{prefix:"doc",resolve:"map",fill:"regex"},{prefix:"doc",resolve:"map",fill:"inherited"}];
function options(description,calls,errors){
  const o={prefix:description.prefix};
  const maps={tokens:{"[TOKEN]":"Example","[MAIL]":"person@example.com"},overlap:{"[":"one","[TOKEN]":"two","TOKEN":"three"},
    "overlap-reversed":{"[TOKEN]":"two","[":"one","TOKEN":"three"},numeric:{"10":"ten","2":"two","1":"one"},
    "empty-key":{"":"blank","[TOKEN]":"visible"},html:{"[TOKEN]":"<b>text</b>","[MAIL]":"bad @example.com"},
    regex:{"a.b*+?^$()[]{}|\\":"literal replacement"}};
  if(description.fill==="empty")o.fill={};
  else if(description.fill==="null")o.fill=null;
  else if(description.fill==="undefined")o.fill=undefined;
  else if(description.fill==="null-prototype")o.fill=Object.assign(Object.create(null),{"[TOKEN]":"Example","constructor":"person+tag@example.com",["__proto__"]:"ordinary"});
  else if(description.fill==="inherited")o.fill=Object.assign(Object.create({"[TOKEN]":"inherited"}),{"[MAIL]":"person@example.com"});
  else if(Object.hasOwn(maps,description.fill))o.fill=maps[description.fill];
  const places=new Map([["doc.md",{page:"/privacy",prefix:"policy"}],["../RETENTION.md",{page:"/trust",prefix:"retention"}]]);
  const error=description.resolve==="throw-object"?{name:"FixtureResolverError",message:"resolver fixture"}:new Error("resolver fixture");
  if(description.resolve==="undefined")o.resolve=undefined;
  else if(description.resolve==="null")o.resolve=null;
  else if(description.resolve!=="omitted")o.resolve=value=>{
    if(description.resolve.startsWith("throw")){calls.push(["resolve",value,"throw"]);errors.push(error);throw error;}
    const result=description.resolve==="place"?{page:description.page,prefix:description.prefix}:description.resolve==="always"?{page:"/trust",prefix:description.prefix}:places.get(value)??null;
    calls.push(["resolve",value,result]);return result;
  };
  return o;
}
function* inlineTexts(){
  for(const value of TEXTS)for(const wrap of [v=>v,v=>"`"+v+"`",v=>"**"+v+"**",v=>"*"+v+"*",v=>"["+v+"](doc.md#Heading)",
    v=>"["+v+"](javascript:bad)",v=>"<https://example.com/"+v+">",v=>"\\["+v+"\\]",v=>"before "+v+" after"])yield wrap(value);
  for(const href of URLS)yield "[**label**]("+href+") <"+href+">";
  for(const text of ["*","**","***","****","`","``","[x]","[x](a(b)c)","[a[b]](doc.md)","*a *","* a*","**a*b**","\\*x\\*","a\\","a\n b","[TOKEN][MAIL]"])
    yield text;
  let state=0x18372645;const alphabet="abc *`[]()<>!#|_\\\n\t-";
  for(let i=0;i<400;i++){let text="";for(let j=0;j<(i%97);j++){state=(Math.imul(state,1664525)+1013904223)>>>0;text+=alphabet[state%alphabet.length];}yield text;}
}
function* markdownTexts(){
  for(const value of TEXTS){
    yield value;yield "# "+value+"\n\n"+value;yield "# "+value+"\n# "+value+"\n> # "+value;
    yield "paragraph "+value+"\ncontinued\n\nnext";yield "<!-- note -->\n"+value+" <!-- hidden --> end";
    yield "```lang\n"+value+"\n```\n";yield "```\n"+value;
    yield "> "+value+"\n>> nested\n> tail";yield "| "+value+" | b |\n| :--- | ---: |\n| c\\|d | e |";
  }
  for(const indent of [0,1,2,3,4,8])for(const nested of [0,1,2,4])for(const marker of ["-","*","+","1.","2)"]){
    const pad=" ".repeat(indent),sub=" ".repeat(indent+nested);
    yield pad+marker+" first\n"+sub+marker+" nested\n"+pad+marker+" second";
    yield pad+marker+" first\n\n"+pad+marker+" second\n  continuation";
  }
  for(let level=1;level<=8;level++)for(const tail of [""," #"," ###","###"]){yield "#".repeat(level)+" heading"+tail;}
  for(const separator of ["---","***","___","- - -","| --- |","| :---: | --- |","| -- |"])
    yield "| a | b |\n"+separator+"\n| c | d |\n\n"+separator;
  for(const text of ["a\r\nb\rc","a<!-- inline\ncomment -->b","<!-- unclosed","<!--x--><!--y-->","a\n\n> quote\n\n- list","- a\n1. b\n- c","##\n####### x","| a |\n| --- |\nnot a row"])
    yield text;
  let n=0;for(const text of inlineTexts()){if(n++===150)break;yield "# Heading\n"+text+"\n\n> "+text+"\n\n- "+text;}
  for(const document of DOCUMENTS)yield document.text;
}
function* vectors(op){
  assert(Object.hasOwn(CAPABILITY,op),"unknown Markdown operation");
  if(op==="slug"){
    for(let code=0;code<0x110000;code++)yield [String.fromCodePoint(code)];
    for(const text of TEXTS)for(const prefix of [""," A ","--","\t"])yield [prefix+text+prefix];
  }else if(op==="safeHref"){
    for(const href of URLS)for(const o of OPTIONS)for(const padding of [""," ","\t","\u00a0"])yield [padding+href+padding,o];
    for(let code=0;code<256;code++)for(const base of ["https://example.com/a","mailto:p@example.com","doc.md#part","#part"])
      for(const o of [OPTIONS[3],OPTIONS[6]])for(const at of [0,3,base.length])yield [base.slice(0,at)+String.fromCharCode(code)+base.slice(at),o];
  }else if(op==="plain"){
    yield [[]];
    for(const text of TEXTS){
      const leaf={t:"text",v:text};yield [[leaf]];yield [[{t:"code",v:text}]];yield [[leaf,leaf]];
      for(const t of ["strong","em","link","custom"])yield [[{t,href:"opaque",c:[leaf,{t:"code",v:" tail"}]}]];
      let tree=[leaf];for(let depth=0;depth<8;depth++){tree=[{t:depth%2?"em":"strong",c:tree}];yield [tree];}
    }
  }else{
    const texts=op==="parseInline"?inlineTexts():markdownTexts();
    for(const text of texts)for(const o of OPTIONS)yield [text,o];
    for(const text of ["","[TOKEN]","**hello** [x](doc.md#Part)","# Heading\n\n- first\n  - nested"])
      for(const o of [OPTIONS[0],OPTIONS[3]])yield {probe:"fresh",arguments:[text,o]};
  }
  // Supplemental cases follow the complete original matrix without reordering it.
  if(op==="safeHref")for(const href of URLS)for(const o of EXTRA_OPTIONS)yield [href,o];
  if(op==="parseInline")for(const text of TEXTS)for(const o of EXTRA_OPTIONS)yield [text,o];
  if(op==="parseMarkdown")for(const text of [...TEXTS,...DOCUMENTS.map(d=>d.text)])for(const o of EXTRA_OPTIONS)yield [text,o];
  if(op==="plain"){
    yield [new Array(3)];
    const sparse=[{t:"text",v:"first"}];sparse.length=3;sparse[2]={t:"code",v:"last"};yield [sparse];
  }
}
function prepare(op,vector){
  const args=structuredClone(vector),calls=[],errors=[];
  if(["safeHref","parseInline","parseMarkdown"].includes(op))args[1]=options(args[1],calls,errors);
  return {args,calls,errors};
}
function encode(value,seen=new Map()){
  if(value===null)return ["null"];
  const type=typeof value;
  if(type==="undefined")return ["undefined"];
  if(type==="string"||type==="boolean")return [type,value];
  if(type!=="object"&&type!=="function")return [type,Object.is(value,-0)?"-0":String(value)];
  if(seen.has(value))return ["ref",seen.get(value)];
  const id=seen.size;seen.set(value,id);const keys=Object.keys(value).sort().map(k=>[k,encode(value[k],seen)]);
  if(type==="function")return ["function",id,keys];
  return Array.isArray(value)?["array",id,value.length,keys]:["object",id,Object.getPrototypeOf(value)===Object.prototype?"plain":Object.getPrototypeOf(value)===null?"null":"other",keys];
}
function anchors(value,seen=new Set(),result=[]){
  if(value===null||!["object","function"].includes(typeof value)||seen.has(value))return result;
  seen.add(value);result.push(value);for(const key of Object.keys(value))anchors(value[key],seen,result);return result;
}
function observeOne(methods,op,vector,pure){
  const {args,calls,errors}=prepare(op,vector),refs=anchors(args),before=encode({arguments:args,anchors:refs});let outcome;
  try{outcome=["return",methods[op](...args)];}catch(e){outcome=["throw",e?.name,e?.message,errors.includes(e)];}
  if(pure)assert.deepEqual(encode({arguments:args,anchors:refs}),before,"baseline mutates Markdown arguments");
  return {arguments:args,anchors:refs,calls,outcome};
}
function observe(methods,op,vector,pure=false){
  if(vector?.probe==="fresh")return {first:observeOne(methods,op,vector.arguments,pure),second:observeOne(methods,op,vector.arguments,pure)};
  return observeOne(methods,op,vector,pure);
}
function runBatch(methods,op,start,limit,pure=false){
  assert(Number.isSafeInteger(start)&&start>=0&&Number.isSafeInteger(limit)&&limit>0,"invalid Markdown range");
  const hash=createHash("sha256");let index=0,count=0;
  for(const vector of vectors(op)){if(index++<start)continue;if(count===limit)break;hash.update(JSON.stringify(encode(observe(methods,op,vector,pure)))+"\n");count++;}
  assert.equal(count,limit,"Markdown range exceeds matrix");return {observations:count,sha256:hash.digest("hex")};
}
async function loadBaseline(root){
  const loaded=await import(pathToFileURL(path.join(root,"markdown.mts")).href);
  assert.deepEqual(Object.keys(loaded).sort(),[...FUNCTIONS].sort(),"unobserved Markdown runtime export");return loaded;
}
async function loadGenerated(root,surface){
  const files=[],methods={};
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith(".")||e.name==="node_modules")continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&[".js",".mjs",".cjs"].includes(path.extname(p)))files.push(p);}}
  walk(root);
  for(const op of FUNCTIONS){
    const binding=surface?.capabilities.find(c=>c.capability===CAPABILITY[op]);
    if(surface&&(!binding||!binding.symbols.includes(SYMBOL[op])))throw new Error("missing Markdown capability");
    const modulePath=binding?.module||"trust_markdown/"+SYMBOL[op];
    const hits=files.filter(file=>{const relative=path.relative(root,file).split(path.sep).join("/");return [".js",".mjs",".cjs"].some(ext=>relative===modulePath+ext||relative.endsWith("/"+modulePath+ext));});
    assert.equal(hits.length,1,"expected one Markdown module");const loaded=await import(pathToFileURL(hits[0]).href);methods[op]=loaded[SYMBOL[op]]??loaded.default?.[SYMBOL[op]]??loaded.default;assert.equal(typeof methods[op],"function","missing Markdown callable");
  }return methods;
}
const countVectors=op=>{let count=0;for(const ignored of vectors(op)){void ignored;count++;}return count;};
async function main(){
  if(["--baseline","--generated"].includes(process.argv[1])){
    const [mode,raw]=process.argv.slice(1),[op,start,limit]=JSON.parse(raw),methods=mode==="--baseline"?await loadBaseline(process.cwd()):await loadGenerated(process.cwd());
    process.stdout.write(JSON.stringify(runBatch(methods,op,start,limit,mode==="--baseline"))+"\n");
  }else{
    const [root,surfaceRaw,casesRaw]=process.argv.slice(2),surface=JSON.parse(surfaceRaw),methods=await loadGenerated(root,surface),cases=[];
    for(const c of JSON.parse(casesRaw)){const [op,start,limit]=c.arguments;assert.equal(CAPABILITY[op],c.capability,"mixed Markdown capability batch");cases.push({case_id:c.case_id,capability:c.capability,result:runBatch(methods,op,start,limit)});}
    process.stdout.write(JSON.stringify({schema:"literate-ai/library-acceptance-results@1",cases})+"\n");
  }
}
module.exports={FUNCTIONS,SYMBOL,CAPABILITY,TEXTS,URLS,OPTIONS,EXTRA_OPTIONS,DOCUMENTS,vectors,countVectors,encode,anchors,prepare,observe,runBatch,loadBaseline,loadGenerated};
if(require.main===module||["--baseline","--generated"].includes(process.argv[1]))main().catch(e=>{console.error(e.stack||e);process.exit(1);});
}

function verifierBytes() {
  const text = historicalVerifier.toString();
  const bytes = Buffer.from(text.slice(text.indexOf('{') + 1, -1));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), SETTINGS.inner_sha256,
    'Historical verifier bytes changed');
  return bytes;
}

function directFile(directory, name) {
  assert(/^[a-zA-Z0-9_.-]+$/.test(name) && name !== '.' && name !== '..');
  const file = path.join(directory, name);
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(descriptor);
    assert(stat.isFile() && stat.size <= 8 * 1024 * 1024, 'Unsafe candidate member');
    return fs.readFileSync(descriptor);
  } finally { fs.closeSync(descriptor); }
}

async function runSelected(root, surface, selected) {
  assert(Array.isArray(selected) && selected.length > 0 && selected.length <= SETTINGS.maximum_cases);
  const input = JSON.stringify({surface, selected});
  assert(Buffer.byteLength(input) <= 256 * 1024, 'Oversized oracle request');
  assert(Buffer.byteLength(JSON.stringify(surface)) <= 64 * 1024 &&
    Buffer.byteLength(JSON.stringify(selected)) <= 64 * 1024, 'Oracle argument exceeds portable CLI bound');
  const source = fs.realpathSync(root);
  const candidates = [path.join(source, SETTINGS.package), path.join(source, 'source', SETTINGS.package)]
    .filter(file => fs.existsSync(file));
  assert.equal(candidates.length, 1, 'Expected one candidate package');
  const candidate = candidates[0];
  // Reject symlinks below the resolved caller root, including an intermediate source directory.
  let at = source;
  for (const part of path.relative(source, candidate).split(path.sep)) {
    at = path.join(at, part);
    assert(fs.lstatSync(at).isDirectory() && !fs.lstatSync(at).isSymbolicLink());
  }
  assert.deepEqual(fs.readdirSync(candidate).sort(), [...SETTINGS.package_files].sort());
  // Desktop Docker shares the home directory. Its VM need not share the OS temporary directory.
  const cache = path.join(os.homedir(), '.cache', 'align-native-oracles');
  fs.mkdirSync(cache, {recursive: true, mode: 0o700});
  const snapshot = fs.mkdtempSync(path.join(fs.realpathSync(cache), 'evaluation-'));
  const name = 'align-oracle-' + crypto.randomUUID();
  assert(!/[\r\n,]/.test(snapshot), 'Unsupported mount path');
  let started = false;
  const dockerEnvironment = {...process.env};
  // Host-side executable configuration must not load application-supplied Node preload hooks.
  delete dockerEnvironment.NODE_OPTIONS;
  delete dockerEnvironment.NODE_PATH;
  try {
    const packageRoot = path.join(snapshot, 'source', SETTINGS.package);
    fs.mkdirSync(packageRoot, {recursive: true, mode: 0o755});
    fs.chmodSync(path.join(snapshot, 'source'), 0o755);
    fs.chmodSync(packageRoot, 0o755);
    for (const file of SETTINGS.package_files) {
      fs.writeFileSync(path.join(packageRoot, file), directFile(candidate, file), {mode: 0o444});
    }
    fs.writeFileSync(path.join(snapshot, 'oracle.cjs'), verifierBytes(), {mode: 0o444});
    fs.writeFileSync(path.join(snapshot, 'request.json'), input, {mode: 0o444});
    fs.writeFileSync(path.join(snapshot, 'execute.cjs'), [
      "'use strict';",
      "const input=require('./request.json');",
      "const cp=require('node:child_process');",
      "const result=cp.spawnSync(process.execPath,['--no-warnings','--experimental-vm-modules','--max-old-space-size=512','/inputs/oracle.cjs','/inputs/source',JSON.stringify(input.surface),JSON.stringify(input.selected)],{encoding:'utf8',timeout:130000,maxBuffer:4*1024*1024});",
      "if(result.error||result.status!==0){console.error(result.error?.code||result.status,result.stderr);process.exitCode=1;}else process.stdout.write(result.stdout);",
    ].join('\n'), {mode: 0o444});
    // Do not depend on the caller's umask for container readability.
    for (const file of SETTINGS.package_files) fs.chmodSync(path.join(packageRoot, file), 0o444);
    for (const file of ['oracle.cjs', 'request.json', 'execute.cjs']) {
      fs.chmodSync(path.join(snapshot, file), 0o444);
    }
    fs.chmodSync(snapshot, 0o755);
    const info=cp.spawnSync('docker',['info','--format','{{.NCPU}}'],{env:dockerEnvironment,encoding:'utf8',timeout:10000});
    if(info.error||info.status!==0)throw Error('Docker runtime unavailable: '+(info.error?.code||info.status));
    const available=Number(info.stdout.trim());
    assert(Number.isInteger(available)&&available>=1&&available<=512,'Invalid Docker CPU capacity');
    const cpus=Math.min(SETTINGS.cpus,available);
    const argv = ['run', '--rm', '--name', name, '--pull=never', '--network=none', '--read-only',
      '--user=65532:65532', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--pids-limit=64', '--memory=' + SETTINGS.memory_mib + 'm', '--cpus=' + cpus,
      '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=128m', '--env=HOME=/tmp',
      '--mount', `type=bind,source=${snapshot},target=/inputs,readonly`,
      '--workdir=/inputs', '--entrypoint=/usr/bin/timeout', SETTINGS.image,
      '--signal=KILL', SETTINGS.worker_seconds + 's', 'node', '--no-warnings', '--max-old-space-size=512', '/inputs/execute.cjs'];
    started = true;
    const result = cp.spawnSync('docker', argv, {env: dockerEnvironment, encoding: 'utf8',
      timeout: 150000, maxBuffer: 4 * 1024 * 1024});
    if (result.error || result.status !== 0) {
      throw Error('Contained oracle failed: ' + (result.error?.code || result.status) + '\n' +
        String(result.stderr || '').slice(0, 1600));
    }
    const value = JSON.parse(result.stdout);
    assert.equal(value.schema, 'literate-ai/library-acceptance-results@1');
    assert(Array.isArray(value.cases) && value.cases.length === selected.length);
    assert.deepEqual(value.cases.map(item => [item.case_id, item.capability]),
      selected.map(item => [item.case_id, item.capability]));
    return value.cases;
  } finally {
    if (started) cp.spawnSync('docker', ['rm', '--force', name], {
      env: dockerEnvironment, stdio: 'ignore', timeout: 10000});
    fs.rmSync(snapshot, {recursive: true, force: true});
  }
}

module.exports = {runSelected};
if (require.main === module) {
  assert.equal(process.argv.length, 5);
  runSelected(process.argv[2], JSON.parse(process.argv[3]), JSON.parse(process.argv[4]))
    .then(cases => process.stdout.write(JSON.stringify({schema: 'literate-ai/library-acceptance-results@1', cases}) + '\n'))
    .catch(error => {console.error(error.stack); process.exitCode = 1;});
}
