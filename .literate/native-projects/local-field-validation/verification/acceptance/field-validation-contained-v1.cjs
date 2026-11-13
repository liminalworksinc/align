'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"05ba968d693365a329a3b25d9154a1d936896b3a0019448150b215d297f7abfd","package":"field_validation","package_files":["create_validators.js","package.json"],"maximum_cases":50,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":4,"memory_mib":1536,"worker_seconds":120};

function historicalVerifier() {const FIELD_VALIDATION_DEPENDENCIES={"schema":"align/validation-observer-dependencies@1","files":{"http_errors/bad_request.js":{"sha256":"81da6da2aefbfefad917d26cfd0b072b3d81b269e09a9e741b59c2e70688e370","source":"'use strict';\nconst { V2Error } = require('./data.js').data();\nfunction bad_request(message, code = 'bad_request') {\n  return new V2Error(400, code, message);\n}\nmodule.exports = { bad_request };\n"},"http_errors/data.js":{"sha256":"f02c958beb09e81862df58081dea41847741e0f49ced3fc1f594e3a2a408e1c5","source":"'use strict';\n\nclass HttpError extends Error {\n  constructor(status, message, code) {\n    super(message);\n    this.status = status;\n    this.code = code;\n  }\n}\n\nclass V2Error extends Error {\n  constructor(status, code, message, extra) {\n    super(message ?? code);\n    this.status = status;\n    this.code = code;\n    this.extra = extra;\n  }\n}\n\nfunction data() {\n  return { HttpError, V2Error };\n}\n\nmodule.exports = { data };\n"},"wording/clean_prose.js":{"sha256":"9cc342154ede5f4a2a3429f20c2bdc3c678daf7192ebc75973f9a0ff78a4ff6f","source":"'use strict';\nconst {drop_invisible}=require('./drop_invisible.js');\nfunction clean_prose(v){return drop_invisible(v).replace(/[\\u115f\\u1160\\u3164\\uffa0\\u2800]/gu,' ').trim();}\nmodule.exports={clean_prose};\n"},"wording/drop_controls.js":{"sha256":"db961228707bd54f1d0b6d6dc1ae2e13eb153d0c3365a57c5fb5112937df5c2b","source":"'use strict';\nfunction drop_controls(v){return v.replace(/\\r\\n?/g,'\\n').replace(/[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f]/g,'');}\nmodule.exports={drop_controls};\n"},"wording/drop_invisible.js":{"sha256":"5f35145db763ffb3ca1b2ce6a21b1c3e3887c80dde6dd1508a9cefe030b35140","source":"'use strict';\nconst {drop_controls}=require('./drop_controls.js');\nconst pict=/\\p{Extended_Pictographic}/u, removed=/[\\p{Cf}\\p{Cs}]/u;\nfunction drop_invisible(v){const points=Array.from(drop_controls(v));const keep=new Set();\nfor(let i=0;i<points.length;i++){\n if(points[i]==='\\u200d'){\n  let p=i-1;const cp=p>=0?points[p].codePointAt(0):-1;\n  if(cp===0xfe0e||cp===0xfe0f||(cp>=0x1f3fb&&cp<=0x1f3ff))p--;\n  if(p>=0&&pict.test(points[p])&&i+1<points.length&&pict.test(points[i+1]))keep.add(i);\n }\n const cp=points[i].codePointAt(0);\n if(cp>=0xe0020&&cp<=0xe007e){let p=i-1;if(p>=0&&points[p]==='\\ufe0f')p--;let end=i;while(end<points.length){const c=points[end].codePointAt(0);if(c<0xe0020||c>0xe007e)break;end++;}if(p>=0&&pict.test(points[p])&&end<points.length&&points[end].codePointAt(0)===0xe007f){for(let j=i;j<=end;j++)keep.add(j);}i=end-1;}\n}\nreturn points.filter((c,i)=>keep.has(i)||!removed.test(c)).join('');}\nmodule.exports={drop_invisible};\n"},"wording/is_blank_text.js":{"sha256":"bb65a898c31ab43dc2b89d32487cd4df9031e27ec9ccc5978130e061a562b5b7","source":"'use strict';\nconst {clean_prose}=require('./clean_prose.js');\nfunction is_blank_text(v){return clean_prose(v).replace(/[\\p{M}\\s]/gu,'')==='';}\nmodule.exports={is_blank_text};\n"},"wording/wording_data.js":{"sha256":"bceef5531895b3bd9eada1404e9ced4d6318f57cb742d16c9607c597f35723a8","source":"'use strict';\nfunction wording_data(){return {BLANK_FILLERS:'\\u115f\\u1160\\u3164\\uffa0\\u2800',DEPENDS_ON_MAX:5,COUNTER_SAME_AS_PROPOSAL:\"That's what the proposal already asks for: approve it instead.\"};}\nmodule.exports={wording_data};\n"}},"providers":[{"component":"http-errors","entry":"704554be799bd2181d52074834b8ad976c9f3c92992bc8e86ac4220f735c6d41","qualified_projection":"sha256:d6e18ee61d9b2a34bd1034ad0a7f6d18092b84b6fb2633f3eeae671e3b275ecc","lock_identity":"sha256:bf5d133418a81b6768c92336725a5af1ea961436738ce74dd51e295f0214820d","source_tree":"85e1f348d64d9685bcf61543043c254780a2c4c44c91613bb641c2eb2fe7b756"},{"component":"wording","entry":"06ac5c43f41efbeb934b067e891672d4e92ea8eac6ce02c3374f81455cbfd519","qualified_projection":"sha256:ab1d16b729691c61c2ecbd803aff8636be0801be6747c07275a7de3d75232560","lock_identity":"sha256:4fa2091d8e25739749b904c7c54c6cf20f668b38d1296fadc5dbc736c6273fa4","source_tree":"5ba1d344e957a4c803553e1713c48bfc5cd81f30b80ed0952534ab58ad15874c"}]};
// Original-source observations with explicitly supplied qualified dependencies.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {stripTypeScriptTypes} = require('node:module');
const {pathToFileURL} = require('node:url');
const {Worker,isMainThread,parentPort,workerData} = require('node:worker_threads');
const FUNCTIONS = ['str','cleanName','charCount','oneLine','optStr','oneOf','optOneOf','nonNegInt','revisionRead','assertRevisionReached','optInt','iso','optIso','b64url','strList'];
const DATA = ['NAME_MARKS_PER_CHAR','NAME_PARTS_PER_CHAR','NO_REVISION','B64URL','ID_RE','SESSION_KEY_RE'];
const OPERATIONS = [...FUNCTIONS,'data','delegation'];
const CAPABILITY = 'validation.create-validators';
const GETTER_ERROR = Symbol('controlled getter error');
const TEXTS = ['', 'a', 'hello world', ' a  b ', '\r\na\tb\r\n', '__proto__', 'constructor', '東京', 'e\u0301', '\u0301\u034f', '\ud800', '\udfff', '\0\u007f\u0085', '\u200b\u2060', '\u115f\u1160\u3164\uffa0\u2800', '👩‍💻', '👩🏿‍💻', '👩‍👩‍👧‍👧', '🇨🇦', '🏴\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}', 'a\u200db', '\u2028\u2029', '\ufeff', '\u00a0', 'a'.repeat(301)];
const NUMBERS = [-Infinity,-Number.MAX_VALUE,-9007199254740992,-1,-0,0,Number.MIN_VALUE,0.5,1,1.5,2,49,50,51,299,300,301,9007199254740991,9007199254740992,Number.MAX_VALUE,Infinity,NaN];
const VALUES = [undefined,null,false,true,...NUMBERS,...TEXTS,[],['a'],{},Object.create(null),1n,Symbol.for('validation-fixture')];
const KEYS = ['value','', '__proto__','constructor','a.b',' field ', '東京'];
const bundle = typeof FIELD_VALIDATION_DEPENDENCIES === 'undefined' ? null : FIELD_VALIDATION_DEPENDENCIES;

function encode(value, seen = new Map()) {
  if (value === null) return ['null'];
  const type = typeof value;
  if (type === 'undefined') return ['undefined'];
  if (type === 'number') return ['number',Object.is(value,-0)?'-0':String(value)];
  if (type === 'string' || type === 'boolean') return [type,value];
  if (type === 'bigint') return ['bigint',String(value)];
  if (type === 'symbol') return ['symbol',Symbol.keyFor(value),value.description];
  if (type === 'function') return ['function'];
  if (seen.has(value)) return ['ref',seen.get(value)];
  const id = seen.size; seen.set(value,id);
  if (value instanceof RegExp) return ['regexp',id,value.source,value.flags,value.lastIndex];
  const fields = Object.getOwnPropertyDescriptors(value);
  const entries = Object.keys(fields).sort().map(key => {
    const d = fields[key];
    return [key,d.enumerable,d.configurable,'value' in d ? [d.writable,encode(d.value,seen)] : ['accessor',!!d.get,!!d.set]];
  });
  return [Array.isArray(value)?'array':'object',id,
    Object.getPrototypeOf(value)===null?'null':Object.getPrototypeOf(value)===Object.prototype?'plain':Array.isArray(value)?'array':'other',entries];
}

function dependencies(input = bundle, mode = 'real') {
  assert.equal(input?.schema,'align/validation-observer-dependencies@1');
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name).exports;
    const record = input.files[name]; assert(record,'unbound dependency '+name);
    assert.equal(createHash('sha256').update(record.source).digest('hex'),record.sha256);
    const m = {exports:{}}; cache.set(name,m);
    const requireBound = relative => {
      assert(relative.startsWith('./'),'external dependency import');
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name),relative));
      assert(!resolved.startsWith('../') && input.files[resolved],'unsafe dependency import');
      return load(resolved);
    };
    new Function('require','module','exports',record.source)(requireBound,m,m.exports);
    return m.exports;
  }
  const actual = {
    badRequest:load('http_errors/bad_request.js').bad_request,
    cleanProse:load('wording/clean_prose.js').clean_prose,
    dropInvisible:load('wording/drop_invisible.js').drop_invisible,
    isBlankText:load('wording/is_blank_text.js').is_blank_text,
    BLANK_FILLERS:load('wording/wording_data.js').wording_data().BLANK_FILLERS,
  };
  const ErrorType = load('http_errors/data.js').data().V2Error;
  const state = {calls:[],lastError:null};
  const context = {BLANK_FILLERS:actual.BLANK_FILLERS};
  for (const name of ['badRequest','cleanProse','dropInvisible','isBlankText']) {
    context[name] = (...args) => {
      state.calls.push([name,encode(args)]);
      let result;
      if (mode==='identity-text' && name!=='badRequest') result=name==='isBlankText'?args[0]==='':args[0];
      else result=actual[name](...args);
      if (name==='badRequest') state.lastError=result;
      return result;
    };
  }
  return {context,state,ErrorType,input};
}

function baselineFactory(root) {
  const file = path.join(root,'validate.ts');
  const source = fs.readFileSync(file,'utf8');
  let js = stripTypeScriptTypes(source,{mode:'strip'});
  const exported = [...js.matchAll(/^export (?:function|const) ([A-Za-z_$][\w$]*)/gm)].map(m=>m[1]);
  assert.deepEqual(exported.sort(),[...FUNCTIONS,...DATA].sort(),'unobserved validation export');
  const imports = [...js.matchAll(/^import[^\n]+;\s*$/gm)];
  assert.equal(imports.length,2,'baseline import boundary changed');
  assert(imports.some(m=>m[0].includes('"./errors"')));
  assert(imports.some(m=>m[0].includes('"./text-core.mts"')));
  js=js.replace(/^import[^\n]+;\s*$/gm,'').replace(/^export (?=function|const)/gm,'');
  assert(!/^\s*(?:import|export)\b/m.test(js),'unhandled source module syntax');
  return new Function('context',
    'const {badRequest,BLANK_FILLERS,cleanProse,dropInvisible,isBlankText}=context;\n'+js+
    '\nreturn {'+[...FUNCTIONS,...DATA].join(',')+'};');
}

function requireMethods(methods) {
  assert.deepEqual(Object.keys(methods).sort(),[...FUNCTIONS,...DATA].sort());
  assert.equal(Object.getPrototypeOf(methods),Object.prototype);
  for (const name of FUNCTIONS) assert.equal(typeof methods[name],'function',name);
  for (const name of ['B64URL','ID_RE','SESSION_KEY_RE']) assert(methods[name] instanceof RegExp,name);
}

async function generatedFactory(root,surface) {
  const binding = surface?.capabilities.find(c=>c.capability===CAPABILITY);
  if (surface) assert(binding?.symbols.includes('create_validators'),'missing factory surface');
  const modulePath = binding?.module || 'field_validation/create_validators';
  const files=[];
  function walk(dir) { for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
    if(e.name.startsWith('.')||e.name==='node_modules')continue;
    const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile())files.push(p);
  }}
  walk(root);
  const hits=files.filter(f=>['.js','.mjs','.cjs'].some(ext=>{
    const r=path.relative(root,f).split(path.sep).join('/');return r===modulePath+ext||r.endsWith('/'+modulePath+ext);
  }));
  assert.equal(hits.length,1,'expected one validation factory module');
  const m=await import(pathToFileURL(hits[0]).href);
  const factory=m.create_validators??m.default?.create_validators??m.default;
  assert.equal(typeof factory,'function');return factory;
}

function* vectors(op) {
  assert(OPERATIONS.includes(op),'unknown validation operation');
  if (['cleanName','charCount','oneLine'].includes(op)) {
    for(let cp=0;cp<=0x10ffff;cp++) {
      const s=String.fromCodePoint(cp);
      if(op==='cleanName'){yield {args:['a'+s+'b']};yield {args:['👩'+s+'💻']};}
      else if(op==='charCount')yield {args:['a'+s+'b']};
      else yield {field:'a'+s+'b',max:2};
    }
    for(const text of TEXTS)for(const a of ['','a','👩','\r','\u200b'])for(const b of ['','b','💻','\n','\u0301']) {
      if(op==='oneLine')for(const max of [0,1,2,3,16,300,NaN])yield {field:a+text+b,max};
      else yield {args:[a+text+b]};
    }
    for(let n=0;n<=40;n++)for(const text of ['a'+'\u0301'.repeat(n),'a'+'\uff9e'.repeat(n),'👩'+'🏿'.repeat(n),Array(n+1).fill('👩').join('\u200d')]) {
      if(op==='oneLine')for(const max of [1,2,3,16,300])yield {field:text,max};else yield {args:[text]};
    }
    if(op!=='oneLine')return;
  }
  if(['str','optStr','oneLine'].includes(op)) {
    for(const field of VALUES)for(const key of KEYS)for(const max of [-1,0,1,2,10,300,NaN,Infinity]) {
      if(op==='str')for(const min of [undefined,-1,0,1,2,NaN,Infinity])yield {field,key,max,min};
      else yield {field,key,max};
    }
    for(const sequence of [[undefined,'x'],[null,'x'],['x',null,'y'],['x','y','z'],['',undefined,null]])yield {getter:sequence,key:'value',max:300};
  } else if(['oneOf','optOneOf'].includes(op)) {
    for(const field of VALUES)for(const allowed of [[],['a'],['a','a','b'],['__proto__','constructor',''],['x, y','z']])yield {field,allowed};
    for(const sequence of [[undefined,'a'],[null,'a'],['a','b','a'],['a','a','b'],['a',undefined,'a']])yield {getter:sequence,allowed:['a','b']};
  } else if(['nonNegInt','optInt','revisionRead'].includes(op)) {
    for(const field of VALUES)for(const optional of [undefined,false,true])yield {field,optional};
    for(const sequence of [[undefined,1],[null,1],[0,1,2],[1,null,2],[1,1,-1]])yield {getter:sequence};
  } else if(op==='assertRevisionReached') {
    for(const what of ['request','proposal'])for(const sent of [undefined,...NUMBERS])for(const current of NUMBERS)yield {args:[what,sent,current]};
  } else if(['iso','optIso'].includes(op)) {
    for(const year of ['0000','0001','0099','1900','2000','2024','9999','+010000','20'])
      for(const date of ['01-01','02-28','02-29','02-30','04-31','12-31','00-01','13-01'])
        for(const time of ['00:00:00','23:59:59','24:00:00','24:00:01','23:59:60','9:00:00'])
          for(const fraction of ['','.1','.12','.123','.123456789','.1234567890'])
            for(const zone of ['Z','z','+00:00','-00:00','+23:59','-23:59','+24:00','+01:60',''])yield {field:year+'-'+date+'T'+time+fraction+zone};
    for(const field of VALUES)yield {field};
    for(const sequence of [[undefined,''],[null,''],['','x'],['x','x','x','2000-01-01T00:00:00Z']])yield {getter:sequence};
  } else if(op==='b64url') {
    for(const field of [...VALUES,...['a','A','0','_','-','+','/','=','a\n','a\r','a\r\n','a\0','a\u2028','a\u2029'].flatMap(c=>[c,c.repeat(43),c.repeat(65)])])
      for(const min of [-1,0,1,2,43,64,NaN])for(const max of [-1,0,1,2,43,64,NaN,Infinity])yield {field,min,max};
  } else if(op==='strList') {
    for(const field of [...VALUES,[],[''],['a','a','b'],[' a ','a',' b '],TEXTS,[null],['a',null],['a','__proto__','constructor'],Array(51).fill('a'),Array.from({length:51},(_,i)=>String(i))])
      for(const max of [-1,0,1,2,50,NaN])for(const itemMax of [-1,0,1,2,300,NaN])yield {field,max,itemMax};
  } else if(op==='data') {
    yield {probe:'initial'};yield {probe:'regex-state'};yield {probe:'factory-isolation'};
  } else if(op==='delegation') {
    for(const method of ['str','optStr','oneLine','cleanName'])for(const text of TEXTS)yield {method,text,mode:'identity-text'};
    yield {probe:'captured-references'};
  }
  if(!['cleanName','charCount','assertRevisionReached','data','delegation'].includes(op)) {
    const field=['nonNegInt','optInt','revisionRead'].includes(op)?1:
      ['iso','optIso'].includes(op)?'2000-01-01T00:00:00Z':op==='strList'?['a','b']:'a';
    for(const key of KEYS)yield {field,key,max:300,min:1,allowed:['a'],inherited:true};
    yield {key:'value',max:300,min:1,allowed:['a'],getterThrow:true};
  }
}

function bodyFor(vector,reads) {
  const key=vector.key??'value';const owner=Object.create(null);
  const body=vector.inherited?Object.create(owner):owner;
  if(vector.getterThrow)Object.defineProperty(owner,key,{enumerable:true,configurable:true,get(){
    const e=new Error('controlled getter failure');reads.push(['throw']);reads[GETTER_ERROR]=e;throw e;
  }});
  else if(vector.getter)Object.defineProperty(owner,key,{enumerable:true,configurable:true,get(){
    const index=reads.length;const result=vector.getter[Math.min(index,vector.getter.length-1)];reads.push(encode(result));return result;
  }});
  else Object.defineProperty(owner,key,{value:vector.field,writable:true,configurable:true,enumerable:true});
  return body;
}

function argumentsFor(op,vector,reads) {
  if(vector.args)return vector.args;
  const body=bodyFor(vector,reads),key=vector.key??'value';
  if(op==='str')return [body,key,vector.max,{min:vector.min}];
  if(op==='optStr'||op==='oneLine')return [body,key,vector.max];
  if(op==='oneOf'||op==='optOneOf')return [body,key,vector.allowed];
  if(op==='revisionRead'){
    const owner=vector.inherited?Object.getPrototypeOf(body):body;
    Object.defineProperty(owner,'revision',Object.getOwnPropertyDescriptor(owner,key));
    return [body,vector.optional];
  }
  if(op==='b64url')return [body,key,vector.min,vector.max];
  if(op==='strList')return [body,key,{max:vector.max,itemMax:vector.itemMax}];
  return [body,key];
}

function dataProbe(factory,methods,ctx,probe) {
  if(probe==='initial')return {values:Object.fromEntries(DATA.map(n=>[n,methods[n]])),
    descriptors:Object.entries(Object.getOwnPropertyDescriptors(methods)).map(([k,d])=>[k,d.enumerable,d.configurable,d.writable]).sort(),frozen:Object.isFrozen(methods)};
  if(probe==='factory-isolation') {
    const second=factory(ctx.context);requireMethods(second);
    return Object.fromEntries(['B64URL','ID_RE','SESSION_KEY_RE'].map(n=>[n,methods[n]===second[n]]));
  }
  const saved={source:methods.B64URL.source,flags:methods.B64URL.flags,lastIndex:methods.B64URL.lastIndex};
  const regex=methods.B64URL,results=[];
  try {
    regex.compile('a+','g');
    for(let i=0;i<4;i++){
      try{results.push(['return',methods.b64url({value:'aaaa'},'value',1,10),regex.lastIndex]);}
      catch(e){results.push(['throw',e.message,e.code,e===ctx.state.lastError,regex.lastIndex]);}
    }
    return results;
  } finally {regex.compile(saved.source,saved.flags);regex.lastIndex=saved.lastIndex;}
}

function evaluate(factory,methods,ctx,op,vector) {
  ctx.state.calls.length=0;ctx.state.lastError=null;
  if(op==='data')return {result:dataProbe(factory,methods,ctx,vector.probe),calls:ctx.state.calls};
  if(op==='delegation') {
    const alternate=dependencies(ctx.input,'identity-text'),api=factory(alternate.context);requireMethods(api);
    if(vector.probe==='captured-references') {
      for(const name of ['badRequest','cleanProse','dropInvisible','isBlankText'])alternate.context[name]=()=>{throw new Error('dependency reference was reread');};
      try{return {result:api.str({value:' a '},'value'),calls:alternate.state.calls};}
      catch(e){return {error:[e.name,e.message],calls:alternate.state.calls};}
    }
    const args=vector.method==='cleanName'?[vector.text]:[{value:vector.text},'value',300];
    try{return {result:api[vector.method](...args),calls:alternate.state.calls};}
    catch(e){return {error:[e.name,e.message,e.status,e.code,e===alternate.state.lastError],calls:alternate.state.calls};}
  }
  const reads=[],args=argumentsFor(op,vector,reads),before=encode(args);let outcome;
  try{outcome=['return',methods[op](...args)];}
  catch(e){outcome=['throw',e?.name,e?.message,e?.status,e?.code,e instanceof ctx.ErrorType,
    e!=null&&Object.getPrototypeOf(e)===ctx.ErrorType.prototype,e===ctx.state.lastError,
    e===reads[GETTER_ERROR],Object.keys(e??{}).sort()];}
  const after=encode(args);assert.deepEqual(after,before,'validator changed caller inputs');
  return {outcome,calls:ctx.state.calls,reads,arguments:args};
}

function countVectors(op){let n=0;for(const ignored of vectors(op)){void ignored;n++;}return n;}
function runBatch(factory,op,start,limit,input=bundle) {
  assert(Number.isSafeInteger(start)&&start>=0&&Number.isSafeInteger(limit)&&limit>0,'invalid observation range');
  const ctx=dependencies(input),methods=factory(ctx.context);requireMethods(methods);
  const hash=createHash('sha256');let i=0,count=0;
  for(const vector of vectors(op)){
    if(i++<start)continue;if(count===limit)break;
    hash.update(JSON.stringify(encode({vector,observed:evaluate(factory,methods,ctx,op,vector)}))+'\n');count++;
  }
  assert.equal(count,limit,'range exceeds validation matrix');
  return {observations:count,sha256:hash.digest('hex')};
}

async function runCases(root,surface,cases,mode='generated') {
  assert(Array.isArray(cases)&&cases.length>0&&cases.length<=64,'invalid observation case count');
  const results=new Array(cases.length);let next=0;
  const consume=async()=>{
    while(next<cases.length){
      const index=next++,item=cases[index];
      assert.equal(item.capability,CAPABILITY);
      results[index]=await new Promise((resolve,reject)=>{
        const worker=new Worker(__filename,{workerData:{schema:'align/validation-observer-worker@1',root,surface,item,mode}});
        let observed;
        worker.once('message',result=>{observed=result;});
        worker.once('error',reject);
        worker.once('exit',code=>{if(code!==0||!observed)reject(new Error('observation worker exited '+code));else resolve(observed);});
      });
    }
  };
  await Promise.all(Array.from({length:Math.min(8,cases.length)},consume));
  return results;
}

async function main() {
  if(['--baseline','--generated'].includes(process.argv[1])) {
    const [mode,raw]=process.argv.slice(1),[op,start,limit]=JSON.parse(raw);
    const factory=mode==='--baseline'?baselineFactory(process.cwd()):await generatedFactory(process.cwd());
    process.stdout.write(JSON.stringify(runBatch(factory,op,start,limit))+'\n');
  } else {
    const [root,surfaceRaw,casesRaw]=process.argv.slice(2),surface=JSON.parse(surfaceRaw);
    const cases=await runCases(root,surface,JSON.parse(casesRaw));
    process.stdout.write(JSON.stringify({schema:'literate-ai/library-acceptance-results@1',cases})+'\n');
  }
}
module.exports={FUNCTIONS,DATA,OPERATIONS,CAPABILITY,TEXTS,NUMBERS,VALUES,encode,dependencies,baselineFactory,generatedFactory,requireMethods,vectors,argumentsFor,dataProbe,evaluate,countVectors,runBatch,runCases};
if(!isMainThread&&workerData?.schema==='align/validation-observer-worker@1'){
  const {root,surface,item,mode}=workerData;
  Promise.resolve(mode==='baseline'?baselineFactory(root):generatedFactory(root,surface)).then(factory=>{
    assert.equal(item.capability,CAPABILITY);
    const [op,start,limit]=item.arguments;
    parentPort.postMessage({case_id:item.case_id,capability:CAPABILITY,result:runBatch(factory,op,start,limit)});
  }).catch(error=>{throw error;});
} else if(require.main===module||['--baseline','--generated'].includes(process.argv[1]))main().catch(e=>{console.error(e.stack||e);process.exit(1);});
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
