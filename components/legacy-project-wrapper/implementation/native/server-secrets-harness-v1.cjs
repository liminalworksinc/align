// Private independent acceptance verifier. Original helper implementation excluded.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const CAPABILITY = 'server-secrets.create-tools';
const CASE_IDS = ["public-functions", "configured-ordinary", "configured-spaces", "configured-zero", "configured-unicode", "configured-bypasses-invalid-path", "configured-property-read-count", "default-environment-per-call", "explicit-undefined-uses-default", "fallback-absent", "fallback-empty", "nested-directory-created", "persisted-key-reused", "independent-directories", "existing-file-trim", "existing-file-empty", "existing-file-whitespace", "existing-file-internal-space", "existing-mode-preserved", "file-reread-after-external-change", "owned-symlink-followed", "directory-at-secret-fails", "resource-failure-existsSync", "resource-failure-mkdirSync", "resource-failure-randomBytes", "resource-failure-writeFileSync", "resource-failure-readFileSync", "hmac-empty", "hmac-ascii", "hmac-unicode", "hmac-nul", "hmac-domain-actor", "hmac-domain-code", "hmac-long-key", "hmac-failure-identity", "captured-resources-and-current-environment"];

function candidateEntry(root, surface) {
  const binding = surface?.capabilities.find(item => item.capability === CAPABILITY);
  if (surface) assert(binding && binding.symbols.includes('create_tools'), 'Missing store import capability');
  const module = binding?.module || 'server_secrets/create_tools';
  assert(!module.startsWith('/') && !module.split('/').includes('..'));
  const hits = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      assert(!entry.isSymbolicLink(), 'Candidate source symlink');
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (['.js', '.mjs', '.cjs'].some(ext => {
        const relative = path.relative(root, file).split(path.sep).join('/');
        return relative === module + ext || relative.endsWith('/' + module + ext);
      })) hits.push(file);
    }
  }
  walk(root); assert.equal(hits.length, 1, 'Expected one advertised secret module');
  return hits[0];
}

function candidateLoader(root, entry, context, refused) {
  const common = new Map(), modules = new Map();
  function inside(file) {
    const relative = path.relative(root, file);
    assert(relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'Candidate import escapes root');
    let current = root;
    for (const part of relative.split(path.sep)) {
      current = path.join(current, part);
      assert(!fs.lstatSync(current).isSymbolicLink(), 'Candidate import symlink');
    }
    return file;
  }
  function resolve(specifier, parent) {
    if (!(specifier.startsWith('./') || specifier.startsWith('../'))) return refused('import ' + specifier);
    const stem = path.resolve(path.dirname(parent), specifier);
    const found = [stem, stem + '.js', stem + '.mjs', stem + '.cjs', path.join(stem, 'index.js')]
      .find(file => fs.existsSync(file) && fs.statSync(file).isFile());
    assert(found, 'Missing candidate module: ' + specifier); return inside(found);
  }
  function esm(file, code) {
    if (file.endsWith('.mjs')) return true;
    if (file.endsWith('.cjs')) return false;
    for (let directory = path.dirname(file); directory.startsWith(root); directory = path.dirname(directory)) {
      const manifest = path.join(directory, 'package.json');
      if (fs.existsSync(manifest)) {
        const type = JSON.parse(fs.readFileSync(manifest, 'utf8')).type;
        if (type === 'module') return true;
        if (type === 'commonjs') return false;
      }
      if (directory === root) break;
    }
    return /^\s*(?:import|export)\b/m.test(code);
  }
  function loadCommon(file) {
    if (common.has(file)) return common.get(file).exports;
    const code = fs.readFileSync(inside(file), 'utf8');
    assert(!esm(file, code), 'Synchronous require of ESM is outside this portable verifier');
    const module = {exports: {}}; common.set(file, module);
    const wrapper = new vm.Script('(function(module,exports,require,__filename,__dirname){\n' + code + '\n})', {filename: file}).runInContext(context);
    wrapper(module, module.exports, name => loadCommon(resolve(name, file)), file, path.dirname(file));
    return module.exports;
  }
  function asModule(file) {
    if (modules.has(file)) return modules.get(file);
    const code = fs.readFileSync(inside(file), 'utf8');
    let module;
    if (esm(file, code)) module = new vm.SourceTextModule(code, {
      context, identifier: file,
      importModuleDynamically: () => refused('dynamic import'),
    });
    else {
      const values = loadCommon(file), names = [...new Set([...Object.keys(values), 'default'])];
      module = new vm.SyntheticModule(names, function () {
        for (const key of names) this.setExport(key, key === 'default' ? values : values[key]);
      }, {context, identifier: file});
    }
    modules.set(file, module); return module;
  }
  return async () => {
    const module = asModule(entry);
    if (module.status === 'unlinked') await module.link((name, parent) => asModule(resolve(name, parent.identifier)));
    if (module.status === 'linked') await module.evaluate();
    const values = module.namespace;
    const factory = values.create_tools ?? values.default?.create_tools ?? values.default;
    assert.equal(typeof factory, 'function', 'Missing secret factory');
    assert.equal(factory.name, 'create_tools'); assert.equal(factory.length, 1);
    return factory;
  };
}

function generatedFixtureBuilder(root, surface) {
  const entry = candidateEntry(root, surface);
  return async function fixture() {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'align-secret-reference-'));
  const state={directory,dataDir:path.join(directory,'data'),calls:[],entropy:[],env:{},envReads:0,fault:null};
  const relative=value=>typeof value==='string'&&value.startsWith(directory)
    ?path.relative(directory,value).split(path.sep).join('/'):value;
  const resource=(name,operation)=>(...args)=>{
    state.calls.push({name,args:args.map(relative).map(value=>value!==null&&typeof value==='object'
      ?JSON.parse(JSON.stringify(value)):value)});
    if(state.fault?.name===name)throw state.fault.error;
    return operation(...args);
  };
  const imports={
    'node:crypto':{
      createHmac:resource('createHmac',crypto.createHmac),
      randomBytes:resource('randomBytes',size=>{
        const value=crypto.randomBytes(size);state.entropy.push(value);return value;
      }),
    },
    'node:fs':Object.fromEntries(['existsSync','mkdirSync','readFileSync','writeFileSync']
      .map(name=>[name,resource(name,fs[name])])),
    'node:path':{default:path},
  };
  const processPort={get env(){state.envReads++;return state.env;}};

  const effects=[];
  const refused=name=>{effects.push(name);throw new Error('Undeclared ambient resource: '+name);};
  const context=vm.createContext({__denySecretEffect:refused});
  // Functional conformance controls. This VM is not a security sandbox.
  vm.runInContext(`
    Math.random=()=>__denySecretEffect('Math.random');
    Date=new Proxy(Date,{
      apply(){return __denySecretEffect('Date');},
      construct(){return __denySecretEffect('new Date');},
      get(target,key){return key==='now'?()=>__denySecretEffect('Date.now'):Reflect.get(target,key);}
    });
    process=new Proxy({}, {get(_target,key){return __denySecretEffect('process.'+String(key));}});
    performance=new Proxy({}, {get(_target,key){return __denySecretEffect('performance.'+String(key));}});
    for(const name of ['setTimeout','setInterval','setImmediate','fetch','WebSocket']){
      globalThis[name]=function(){return __denySecretEffect(name);};
    }
  `,context);
  const resources={
    environment:()=>processPort.env,join:path.join,dirname:path.dirname,
    ...imports['node:fs'],...imports['node:crypto'],
  };
  assert.equal(Object.keys(resources).length,9);
  const loadFactory=candidateLoader(root,entry,context,refused);
  state.resources=resources;state.effects=effects;
  state.close=()=>{
    fs.rmSync(directory,{recursive:true,force:true});
    assert.deepEqual(effects,[],'Undeclared ambient effect');
  };
  try{
    const create_tools=await loadFactory();
    state.api=create_tools(resources);
    assert(state.api&&typeof state.api==='object');
    assert.deepEqual(Object.keys(state.api).sort(),['hmac','serverSecret']);
    assert.equal(state.api.serverSecret.name,'serverSecret');
    assert.equal(state.api.hmac.name,'hmac');
    assert.deepEqual(state.calls,[],'Binding must not invoke host resources');
    assert.equal(state.envReads,0,'Binding must not read the environment');
    return state;
  }catch(error){state.close();throw error;}
  };
}

async function matrix(fixture,selectedIds=null){
  const cases=[];
  async function test(case_id,body){
    if(selectedIds&&!selectedIds.has(case_id))return;
    const state=await fixture();
    try{cases.push({case_id,result:await body(state)});}finally{state.close();}
  }
  const names=f=>f.calls.map(call=>call.name);
  const seed=(f,text,mode=0o600)=>{
    fs.mkdirSync(f.dataDir,{recursive:true});
    const file=path.join(f.dataDir,'.secret');fs.writeFileSync(file,text,{mode});return file;
  };

  await test('public-functions',f=>{
    assert.deepEqual(Object.keys(f.api).sort(),['hmac','serverSecret']);
    assert.equal(f.api.serverSecret.length,1);assert.equal(f.api.hmac.length,2);
    assert.deepEqual(names(f),[]);
    return {exports:['hmac','serverSecret'],arity:{serverSecret:1,hmac:2},construction_effects:0};
  });
  for(const [label,value]of [['ordinary','configured-secret'],['spaces','  configured secret\n'],['zero','0'],['unicode','配置鍵🔑']]){
    await test('configured-'+label,f=>{
      const result=f.api.serverSecret(f.dataDir,{ALIGN_SECRET:value});
      assert.equal(result,value);assert.deepEqual(names(f),[]);assert.equal(f.envReads,0);
      assert.equal(fs.existsSync(f.dataDir),false);
      return {value:result,resource_calls:0,process_environment_reads:0};
    });
  }
  await test('configured-bypasses-invalid-path',f=>{
    const blocker=path.join(f.directory,'blocker');fs.writeFileSync(blocker,'owned fixture');
    assert.equal(f.api.serverSecret(path.join(blocker,'nested'),{ALIGN_SECRET:'chosen'}),'chosen');
    assert.deepEqual(names(f),[]);return {value:'chosen',resource_calls:0};
  });
  await test('configured-property-read-count',f=>{
    let reads=0;const env={get ALIGN_SECRET(){reads++;return 'getter-value';}};
    assert.equal(f.api.serverSecret(f.dataDir,env),'getter-value');assert.equal(reads,2);
    return {property_reads:reads,resource_calls:names(f)};
  });
  await test('default-environment-per-call',f=>{
    f.env={ALIGN_SECRET:'first'};const first=f.api.serverSecret(f.dataDir);
    f.env={ALIGN_SECRET:'second'};const second=f.api.serverSecret(f.dataDir);
    assert.deepEqual([first,second],['first','second']);assert.equal(f.envReads,2);
    assert.deepEqual(names(f),[]);return {values:[first,second],environment_reads:f.envReads};
  });
  await test('explicit-undefined-uses-default',f=>{
    f.env={ALIGN_SECRET:'default'};assert.equal(f.api.serverSecret(f.dataDir,undefined),'default');
    assert.equal(f.envReads,1);return {value:'default',environment_reads:1};
  });
  for(const [label,env]of [['absent',{}],['empty',{ALIGN_SECRET:''}]]){
    await test('fallback-'+label,f=>{
      const result=f.api.serverSecret(f.dataDir,env),file=path.join(f.dataDir,'.secret');
      assert.match(result,/^[0-9a-f]{64}$/);assert.equal(fs.readFileSync(file,'utf8'),result);
      assert.equal(fs.statSync(file).mode&0o777,0o600);
      assert.deepEqual(names(f),['existsSync','mkdirSync','randomBytes','writeFileSync','readFileSync']);
      assert.deepEqual(f.calls.find(call=>call.name==='mkdirSync').args,['data',{recursive:true}]);
      assert.deepEqual(f.calls.find(call=>call.name==='randomBytes').args,[32]);
      assert.equal(result,f.entropy[0].toString('hex'),'Use the exact bytes returned by the entropy resource');
      const write=f.calls.find(call=>call.name==='writeFileSync');
      assert.equal(write.args[0],'data/.secret');assert.equal(write.args[1],result);
      assert.deepEqual(write.args[2],{mode:0o600});
      assert.deepEqual(f.calls.at(-1).args,['data/.secret','utf8']);
      return {hex_length:64,mode:'0600',order:names(f),mkdir_recursive:true,entropy_bytes:32,
        write_options:{mode:'0600'},read_encoding:'utf8',writes_exact_generated_key:true};
    });
  }
  await test('nested-directory-created',f=>{
    f.dataDir=path.join(f.directory,'outer','inner','leaf');
    const value=f.api.serverSecret(f.dataDir,{});assert.match(value,/^[0-9a-f]{64}$/);
    assert(fs.statSync(f.dataDir).isDirectory());
    return {path:'outer/inner/leaf/.secret',created:true,mode:'0600'};
  });
  await test('persisted-key-reused',f=>{
    const first=f.api.serverSecret(f.dataDir,{}),second=f.api.serverSecret(f.dataDir,{});
    assert.equal(first,second);assert.equal(names(f).filter(name=>name==='randomBytes').length,1);
    assert.equal(names(f).filter(name=>name==='writeFileSync').length,1);
    return {same_key:true,random_calls:1,writes:1,reads:2};
  });
  await test('independent-directories',f=>{
    const first=f.api.serverSecret(f.dataDir,{});
    const second=f.api.serverSecret(path.join(f.directory,'other'),{});
    assert.notEqual(first,second);assert.match(second,/^[0-9a-f]{64}$/);
    return {distinct_keys:true,entropy_calls:2};
  });
  for(const [label,text,expected]of [['trim',' \t\r\n fixed-key \n\t','fixed-key'],['empty','',''],['whitespace','\u2003 \t\n',''],['internal-space',' inner key\nline ','inner key\nline']]){
    await test('existing-file-'+label,f=>{
      const file=seed(f,text);assert.equal(f.api.serverSecret(f.dataDir,{}),expected);
      assert.equal(fs.readFileSync(file,'utf8'),text);
      assert.deepEqual(names(f),['existsSync','readFileSync']);
      return {value:expected,file_unchanged:true,order:names(f)};
    });
  }
  await test('existing-mode-preserved',f=>{
    const file=seed(f,'existing',0o644);fs.chmodSync(file,0o644);
    assert.equal(f.api.serverSecret(f.dataDir,{}),'existing');
    assert.equal(fs.statSync(file).mode&0o777,0o644);
    return {value:'existing',mode:'0644',writes:0};
  });
  await test('file-reread-after-external-change',f=>{
    const file=seed(f,'first');const first=f.api.serverSecret(f.dataDir,{});
    fs.writeFileSync(file,'second\n');const second=f.api.serverSecret(f.dataDir,{});
    assert.deepEqual([first,second],['first','second']);
    return {values:[first,second],read_calls:2,cache:false};
  });
  await test('owned-symlink-followed',f=>{
    fs.mkdirSync(f.dataDir,{recursive:true});const target=path.join(f.directory,'fixture-target');
    fs.writeFileSync(target,'linked-key\n');fs.symlinkSync(target,path.join(f.dataDir,'.secret'));
    assert.equal(f.api.serverSecret(f.dataDir,{}),'linked-key');
    assert(fs.lstatSync(path.join(f.dataDir,'.secret')).isSymbolicLink());
    return {value:'linked-key',symlink_preserved:true,fixture_only:true};
  });
  await test('directory-at-secret-fails',f=>{
    fs.mkdirSync(path.join(f.dataDir,'.secret'),{recursive:true});
    let caught;try{f.api.serverSecret(f.dataDir,{});}catch(error){caught=error;}
    assert(caught);assert.equal(caught.code,'EISDIR');
    return {code:caught.code,order:names(f)};
  });
  for(const phase of ['existsSync','mkdirSync','randomBytes','writeFileSync','readFileSync']){
    await test('resource-failure-'+phase,f=>{
      const error=Object.assign(new Error('owned fixture fault'),{code:'FIXTURE_FAILURE'});
      f.fault={name:phase,error};let caught;
      try{f.api.serverSecret(f.dataDir,{});}catch(value){caught=value;}
      assert.equal(caught,error);assert.equal(names(f).at(-1),phase);
      assert.equal(fs.existsSync(path.join(f.dataDir,'.secret')),phase==='readFileSync');
      return {phase,same_error:true,order:names(f),file_exists:phase==='readFileSync'};
    });
  }
  const vectors=[['empty','',''],['ascii','key','The quick brown fox jumps over the lazy dog'],
    ['unicode','鍵🔑','你好 π\n'],['nul','a\0b','\0payload\0'],['domain-actor','fixed-key','ale.user-1'],
    ['domain-code','fixed-key','alc.code-1'],['long-key','k'.repeat(200),'payload']];
  for(const [label,key,payload]of vectors){
    await test('hmac-'+label,f=>{
      const result=f.api.hmac(key,payload);
      assert.match(result,/^[A-Za-z0-9_-]{43}$/);
      assert.equal(result,crypto.createHmac('sha256',key).update(payload).digest('base64url'));
      assert.deepEqual(names(f),['createHmac']);assert.deepEqual(f.calls[0].args,['sha256',key]);
      return {key,payload,value:result,algorithm:'sha256',encoding:'base64url',resource_calls:names(f)};
    });
  }
  await test('hmac-failure-identity',f=>{
    const error=Object.assign(new Error('owned crypto fault'),{code:'FIXTURE_CRYPTO'});
    f.fault={name:'createHmac',error};let caught;
    try{f.api.hmac('key','payload');}catch(value){caught=value;}
    assert.equal(caught,error);return {same_error:true,resource_calls:names(f)};
  });

  await test('captured-resources-and-current-environment',f=>{
    for(const name of Object.keys(f.resources))f.resources[name]=()=>{throw new Error('Replaced resource '+name);};
    f.env={ALIGN_SECRET:'first-captured'};
    assert.equal(f.api.serverSecret(f.dataDir),'first-captured');
    f.env={ALIGN_SECRET:'second-captured'};
    assert.equal(f.api.serverSecret(f.dataDir),'second-captured');
    f.env={};
    const value=f.api.serverSecret(f.dataDir);
    assert.equal(value,f.entropy[0].toString('hex'));
    assert.equal(f.api.serverSecret(f.dataDir,{}),value);
    assert.equal(f.envReads,3);assert.equal(f.entropy.length,1);
    assert.equal(f.api.hmac('key','payload'),crypto.createHmac('sha256','key').update('payload').digest('base64url'));
    assert.equal(fs.statSync(path.join(f.dataDir,'.secret')).mode&0o777,0o600);
    return {captured_resources:true,current_environment_per_call:true,entropy_bytes_used:true,resource_count:9};
  });
  return cases;
}

async function runSelected(root, surface, selected) {
  const ids = selected.map(item => {
    assert(item.capability === CAPABILITY);
    assert(Array.isArray(item.arguments) && item.arguments.length === 1);
    const index = item.arguments[0];
    assert(Number.isSafeInteger(index) && index >= 0 && index < CASE_IDS.length, 'Private verifier selector');
    return CASE_IDS[index];
  });
  assert.equal(new Set(ids).size, ids.length, 'Duplicate verifier case');
  const observed = await matrix(generatedFixtureBuilder(root, surface), new Set(ids));
  assert.equal(observed.length, selected.length, 'Incomplete verifier result');
  const byId = new Map(observed.map(item => [item.case_id, item.result]));
  const ordered = value => {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
    return value;
  };
  return selected.map((item, index) => ({case_id: item.case_id, capability: CAPABILITY,
    result: {sha256: hash(JSON.stringify(ordered({case_id: ids[index], result: byId.get(ids[index])})))}}));
}
async function main() {
  const argv = process.argv.slice(2);
  assert.equal(argv.length, 3, 'Expected candidate root, import surface and cases');
  const root = path.resolve(argv[0]), surface = JSON.parse(argv[1]), selected = JSON.parse(argv[2]);
  assert(Array.isArray(selected) && selected.length > 0 && selected.length <= 64);
  const cases = await runSelected(root, surface, selected);
  process.stdout.write(JSON.stringify({schema:'literate-ai/library-acceptance-results@1', cases}) + '\n');
}
module.exports = {CAPABILITY, CASE_IDS, matrix, generatedFixtureBuilder, runSelected, main};
if (require.main === module) {
  if (typeof vm.SourceTextModule !== 'function') {
    const child = cp.spawnSync(process.execPath, ['--experimental-vm-modules', __filename, ...process.argv.slice(2)], {stdio: 'inherit', timeout: 900000});
    if (child.error) throw child.error;
    process.exit(child.status ?? 1);
  }
  main().catch(error => { process.stderr.write((error.stack || String(error)) + '\n'); process.exitCode = 1; });
}
