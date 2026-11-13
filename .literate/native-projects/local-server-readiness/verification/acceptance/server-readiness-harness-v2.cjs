'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const vm=require('node:vm'),crypto=require('node:crypto');
const CAPABILITY='server-readiness.create-ready';
function candidateEntry(root, surface) {
  const binding = surface?.capabilities.find(item => item.capability === CAPABILITY);
  if (surface) assert(binding && binding.symbols.includes('create_ready'), 'Missing readiness import capability');
  const module = binding?.module || 'server_readiness/create_ready';
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
  walk(root); assert.equal(hits.length, 1, 'Expected one advertised readiness module');
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
    const factory = values.create_ready ?? values.default?.create_ready ?? values.default;
    assert.equal(typeof factory, 'function', 'Missing readiness factory');
    assert.equal(factory.name, 'create_ready'); assert.equal(factory.length, 1);
    return factory;
  };
}const CASE_IDS = [
  'surface-and-no-construction-effects', 'initial-synchronous-order',
  'fulfilled-promise-cached', 'concurrent-callers-share-identity',
  'two-bindings-share-caller-state', 'independent-state-containers',
  'preseed-pending-promise', 'preseed-fulfilled-promise', 'preseed-object',
  'preseed-false', 'preseed-zero', 'preseed-empty-string',
  'null-cache-starts', 'undefined-cache-starts',
  'open-sync-failure', 'auth-sync-failure', 'auth-async-failure',
  'migration-sync-failure', 'null-rejection', 'undefined-rejection',
  'symbol-rejection', 'retry-after-open-failure', 'retry-after-auth-failure',
  'retry-after-migration-failure', 'failed-attempt-shared-until-cleared',
  'success-keeps-external-cache-replacement',
  'failure-clears-external-cache-replacement',
  'old-failure-clears-new-pending-cache',
  'open-result-is-not-awaited', 'migration-result-is-not-awaited',
  'auth-thenable-is-awaited', 'scalar-auth-result-still-yields',
  'captured-function-handles', 'captured-state-reference',
  'resource-receiver-is-undefined', 'cache-getter-fails-synchronously',
  'cache-setter-fails-after-open-and-auth',
  'failure-clear-setter-error-replaces-reason', 'bounded-reentrant-open',
  'state-key-is-exact'
];
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
async function observe(instantiate, selected = CASE_IDS) {
  assert.equal(new Set(selected).size, selected.length);
  const records = [];
  for (const id of selected) {
    assert(CASE_IDS.includes(id), 'Unknown observation');
    const state = {}, calls = [], gate = deferred(), fault = {owned: id};
    let phase = null, reason = fault, authResult = gate.promise, openResult, migrationResult;
    const resources = {
      state,
      openDb: function () { calls.push('open'); if (phase === 'open') throw reason; return openResult; },
      migrateAuth: function () { calls.push('auth'); if (phase === 'auth') throw reason; return authResult; },
      migrate: function () { calls.push('migrate'); if (phase === 'migrate') throw reason; return migrationResult; },
    };
    const api = await instantiate(resources);
    const ready = api.ready;
    let result;
    const rejected = async (promise, expected) => {
      let observed = false;
      await Promise.resolve(promise).then(() => assert.fail('Expected rejection'), error => {
        observed = true; assert.equal(error, expected, 'Rejection identity');
      });
      assert(observed);
    };
    switch (id) {
      case 'surface-and-no-construction-effects': {
        assert.deepEqual(Object.keys(api), ['ready']);
        assert.equal(ready.name, 'ready'); assert.equal(ready.length, 0);
        assert.equal(ready.constructor.name, 'Function');
        assert.deepEqual(calls, []); assert.deepEqual(Object.keys(state), []);
        const p = ready(); assert.equal(p, state.__alignV2Ready);
        gate.resolve(); assert.equal(await p, undefined);
        result = {public: ['ready'], name: ready.name, arity: ready.length, detached: true}; break;
      }
      case 'initial-synchronous-order': {
        const p = ready(); assert.deepEqual(calls, ['open', 'auth']);
        assert.equal(state.__alignV2Ready, p); gate.resolve();
        assert.equal(await p, undefined); assert.deepEqual(calls, ['open', 'auth', 'migrate']);
        result = {before_return: ['open', 'auth'], after_auth: calls.slice(), resolved: 'undefined'}; break;
      }
      case 'fulfilled-promise-cached': {
        const p = ready(); gate.resolve(); await p;
        assert.equal(ready(), p); await ready(); assert.deepEqual(calls, ['open', 'auth', 'migrate']);
        result = {same_settled_promise: true, calls}; break;
      }
      case 'concurrent-callers-share-identity': {
        const promises = Array.from({length: 100}, () => ready());
        assert(promises.every(p => p === promises[0]));
        assert.deepEqual(calls, ['open', 'auth']); gate.resolve(); await Promise.all(promises);
        assert.deepEqual(calls, ['open', 'auth', 'migrate']);
        result = {callers: promises.length, one_promise: true, calls}; break;
      }
      case 'two-bindings-share-caller-state': {
        const secondCalls = [];
        const second = await instantiate({state, openDb: () => secondCalls.push('open'),
          migrateAuth: () => secondCalls.push('auth'), migrate: () => secondCalls.push('migrate')});
        const p = ready(); assert.equal(second.ready(), p); gate.resolve(); await p;
        assert.equal(second.ready(), p); assert.deepEqual(secondCalls, []);
        result = {shared_promise: true, first_calls: calls, second_calls: secondCalls}; break;
      }
      case 'independent-state-containers': {
        const other = {}, secondCalls = [];
        const second = await instantiate({state: other, openDb: () => secondCalls.push('open'),
          migrateAuth: () => secondCalls.push('auth'), migrate: () => secondCalls.push('migrate')});
        const p = ready(), q = second.ready(); assert.notEqual(p, q);
        await q; assert.deepEqual(calls, ['open', 'auth']); gate.resolve(); await p;
        result = {different_promises: true, first_calls: calls, second_calls: secondCalls}; break;
      }
      case 'preseed-pending-promise': case 'preseed-fulfilled-promise':
      case 'preseed-object': case 'preseed-false': case 'preseed-zero': case 'preseed-empty-string': {
        const values = {'preseed-pending-promise': gate.promise,
          'preseed-fulfilled-promise': Promise.resolve('existing'), 'preseed-object': {existing: true},
          'preseed-false': false, 'preseed-zero': 0, 'preseed-empty-string': ''};
        state.__alignV2Ready = values[id]; assert.equal(ready(), values[id]); assert.deepEqual(calls, []);
        gate.resolve(); result = {preseed_returned_exactly: true, calls}; break;
      }
      case 'null-cache-starts': case 'undefined-cache-starts': {
        state.__alignV2Ready = id === 'null-cache-starts' ? null : undefined;
        const p = ready(); assert.equal(state.__alignV2Ready, p); gate.resolve(); await p;
        assert.deepEqual(calls, ['open', 'auth', 'migrate']); result = {calls}; break;
      }
      case 'open-sync-failure': case 'auth-sync-failure': case 'migration-sync-failure':
      case 'auth-async-failure': case 'null-rejection': case 'undefined-rejection': case 'symbol-rejection': {
        phase = id.startsWith('open-') ? 'open' : id.startsWith('migration-') ? 'migrate' : 'auth';
        if (id === 'null-rejection') reason = null;
        if (id === 'undefined-rejection') reason = undefined;
        if (id === 'symbol-rejection') reason = Symbol('owned-reason');
        if (id === 'auth-async-failure') { phase = null; }
        let p; assert.doesNotThrow(() => { p = ready(); });
        assert.equal(p, state.__alignV2Ready);
        if (id === 'auth-async-failure') gate.reject(reason); else gate.resolve();
        await rejected(p, reason); assert.equal(state.__alignV2Ready, undefined);
        const expected = phase === 'open' ? ['open'] : phase === 'migrate' ? ['open', 'auth', 'migrate'] : ['open', 'auth'];
        assert.deepEqual(calls, expected); result = {calls, exact_rejection: true, cache_cleared: true}; break;
      }
      case 'retry-after-open-failure': case 'retry-after-auth-failure': case 'retry-after-migration-failure': {
        phase = id.includes('-open-') ? 'open' : id.includes('-auth-') ? 'auth' : 'migrate';
        gate.resolve(); const p = ready(); await rejected(p, reason);
        assert.equal(state.__alignV2Ready, undefined); const before = calls.slice(); phase = null;
        const q = ready(); assert.notEqual(p, q); await q; assert.equal(ready(), q);
        assert.deepEqual(calls.slice(before.length), ['open', 'auth', 'migrate']);
        result = {failed_calls: before, retry_calls: calls.slice(before.length), new_promise: true}; break;
      }
      case 'failed-attempt-shared-until-cleared': {
        phase = 'open'; const p = ready(); const q = ready(); assert.equal(p, q);
        assert.deepEqual(calls, ['open']); await rejected(p, reason);
        assert.equal(state.__alignV2Ready, undefined); phase = null; gate.resolve();
        const again = ready(); assert.notEqual(again, p); await again;
        result = {same_failed_pending_promise: true, retry_new_promise: true, calls}; break;
      }
      case 'success-keeps-external-cache-replacement': {
        const p = ready(), replacement = {external: true}; state.__alignV2Ready = replacement;
        gate.resolve(); await p; assert.equal(state.__alignV2Ready, replacement); assert.equal(ready(), replacement);
        result = {external_replacement_kept: true, calls}; break;
      }
      case 'failure-clears-external-cache-replacement': {
        const p = ready(); state.__alignV2Ready = {external: true}; gate.reject(fault);
        await rejected(p, fault); assert.equal(state.__alignV2Ready, undefined);
        result = {external_replacement_cleared: true, calls}; break;
      }
      case 'old-failure-clears-new-pending-cache': {
        const p = ready(), newerGate = deferred(); state.__alignV2Ready = undefined; authResult = newerGate.promise;
        const q = ready(); assert.notEqual(p, q); assert.equal(state.__alignV2Ready, q);
        gate.reject(fault); await rejected(p, fault); assert.equal(state.__alignV2Ready, undefined);
        newerGate.resolve(); await q; assert.equal(state.__alignV2Ready, undefined);
        assert.deepEqual(calls, ['open', 'auth', 'open', 'auth', 'migrate']);
        result = {older_failure_clears_newer_cache: true, calls}; break;
      }
      case 'open-result-is-not-awaited': case 'migration-result-is-not-awaited': {
        const ignored = Object.defineProperty({}, 'then', {get() { throw fault; }});
        if (id.startsWith('open-')) openResult = ignored; else migrationResult = ignored;
        const p = ready(); gate.resolve(); assert.equal(await p, undefined);
        assert.deepEqual(calls, ['open', 'auth', 'migrate']);
        result = {then_property_not_read: true, calls}; break;
      }
      case 'auth-thenable-is-awaited': {
        let release; authResult = {then(resolve) { calls.push('then'); release = resolve; }};
        const p = ready(); assert.deepEqual(calls, ['open', 'auth']); await tick();
        assert.deepEqual(calls, ['open', 'auth', 'then']); release('ignored'); await p;
        assert.deepEqual(calls, ['open', 'auth', 'then', 'migrate']); result = {calls}; break;
      }
      case 'scalar-auth-result-still-yields': {
        authResult = 17; const p = ready(); assert.deepEqual(calls, ['open', 'auth']); await p;
        assert.deepEqual(calls, ['open', 'auth', 'migrate']); result = {calls, yielded: true}; break;
      }
      case 'captured-function-handles': case 'captured-state-reference': {
        if (id === 'captured-function-handles') {
          for (const name of ['openDb', 'migrateAuth', 'migrate']) resources[name] = () => { throw fault; };
        } else resources.state = {__alignV2Ready: fault};
        const p = ready(); assert.equal(state.__alignV2Ready, p); gate.resolve(); await p;
        assert.deepEqual(calls, ['open', 'auth', 'migrate']); result = {captured_original_handles: true, calls}; break;
      }
      case 'resource-receiver-is-undefined': {
        const receivers = [], ownState = {};
        const other = await instantiate({state: ownState,
          openDb: function () { receivers.push(this); },
          migrateAuth: function () { receivers.push(this); },
          migrate: function () { receivers.push(this); }});
        await other.ready(); assert.equal(receivers.length, 3); assert(receivers.every(value => value === undefined));
        result = {unbound_receivers: 3}; break;
      }
      case 'cache-getter-fails-synchronously': {
        Object.defineProperty(state, '__alignV2Ready', {get() { throw fault; }});
        let caught; try { ready(); } catch (e) { caught = e; }
        assert.equal(caught, fault); assert.deepEqual(calls, []);
        result = {same_synchronous_failure: true, calls}; break;
      }
      case 'cache-setter-fails-after-open-and-auth': {
        Object.defineProperty(state, '__alignV2Ready', {get() { return undefined; }, set() { throw fault; }});
        let caught; try { ready(); } catch (e) { caught = e; }
        assert.equal(caught, fault); assert.deepEqual(calls, ['open', 'auth']);
        gate.resolve(); await tick(); assert.deepEqual(calls, ['open', 'auth', 'migrate']);
        result = {same_synchronous_failure: true, prior_effects_continue: true, calls}; break;
      }
      case 'failure-clear-setter-error-replaces-reason': {
        let stored, writes = 0; const replacement = {clear_failure: true};
        Object.defineProperty(state, '__alignV2Ready', {get() { return stored; }, set(value) {
          writes++; if (writes === 2) throw replacement; stored = value;
        }});
        const p = ready(); gate.reject(fault); await rejected(p, replacement);
        assert.equal(stored, p); assert.equal(writes, 2);
        result = {clear_error_replaces_reason: true, writes, calls}; break;
      }
      case 'bounded-reentrant-open': {
        const ownState = {}, events = []; let nested, entered = false;
        const other = await instantiate({state: ownState, openDb() {
          events.push('open'); if (!entered) { entered = true; nested = other.ready(); }
        }, migrateAuth() { events.push('auth'); return gate.promise; }, migrate() { events.push('migrate'); }});
        const p = other.ready(); assert.notEqual(p, nested); assert.equal(ownState.__alignV2Ready, p);
        assert.deepEqual(events, ['open', 'open', 'auth', 'auth']); gate.resolve(); await Promise.all([p, nested]);
        assert.deepEqual(events, ['open', 'open', 'auth', 'auth', 'migrate', 'migrate']);
        result = {distinct_reentrant_promise: true, events}; break;
      }
      case 'state-key-is-exact': {
        state.otherReady = fault; state.__alignV2ReadyExtra = fault;
        const p = ready(); gate.resolve(); await p;
        assert.deepEqual(Object.keys(state).sort(), ['__alignV2Ready', '__alignV2ReadyExtra', 'otherReady']);
        assert.equal(state.otherReady, fault); assert.equal(state.__alignV2ReadyExtra, fault);
        result = {unrelated_keys_preserved: true, calls}; break;
      }
      default: assert.fail(id);
    }
    records.push({case_id: id, result});
  }
  return records;
}

function generatedBinding(root,surface) {
  const entry=candidateEntry(root,surface), checks=[];
  const instantiate=async resources=>{
    const effects=[];
    const refused=name=>{effects.push(name);throw new Error('Undeclared ambient effect: '+name);};
    const context=vm.createContext({__denyReadinessEffect:refused});
    // Functional conformance guard, not a security sandbox.
    vm.runInContext(
      "Math.random=()=>__denyReadinessEffect('Math.random');"+
      "Date=new Proxy(Date,{apply(){return __denyReadinessEffect('Date');},construct(){return __denyReadinessEffect('new Date');},get(target,key){return key==='now'?()=>__denyReadinessEffect('Date.now'):Reflect.get(target,key);}});"+
      "for(const label of ['process','console','performance']){"+
        "const denied=new Proxy({}, {get(_target,key){return __denyReadinessEffect(label+'.'+String(key));},set(){return __denyReadinessEffect(label+' mutation');}});"+
        "Object.defineProperty(globalThis,label,{configurable:false,get(){return denied;},set(){return __denyReadinessEffect(label+' assignment');}});}"+
      "Object.defineProperty(globalThis,'__alignV2Ready',{get(){return __denyReadinessEffect('ambient readiness cache');},set(){return __denyReadinessEffect('ambient readiness cache assignment');}});"+
      "for(const label of ['setTimeout','setInterval','setImmediate','queueMicrotask','fetch'])globalThis[label]=()=>__denyReadinessEffect(label);"+
      "globalThis.WebSocket=new Proxy(function WebSocket(){},{apply(){return __denyReadinessEffect('WebSocket');},construct(){return __denyReadinessEffect('new WebSocket');}});",
      context);
    const check=()=>assert.deepEqual(effects,[],'Undeclared ambient effects'); checks.push(check);
    const factory=await candidateLoader(root,entry,context,refused)(); check();
    const api=factory(resources); check();
    assert(api&&typeof api==='object'&&typeof api.then!=='function','Synchronous API binding');
    assert.deepEqual(Object.keys(api),['ready']);
    assert.equal(typeof api.ready,'function');assert.equal(api.ready.name,'ready');assert.equal(api.ready.length,0);
    return {ready:new Proxy(api.ready,{apply(target,receiver,args){
      try {return Reflect.apply(target,receiver,args);}finally{check();}
    }})};
  };
  instantiate.check=()=>checks.forEach(check=>check());
  return instantiate;
}
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const digest=record=>({sha256:crypto.createHash('sha256').update(JSON.stringify(ordered(record))).digest('hex')});
async function runSelected(root,surface,selected) {
  const indices=selected.map(item=>{
    assert.equal(item.capability,CAPABILITY);assert(Array.isArray(item.arguments)&&item.arguments.length===1);
    const index=item.arguments[0];assert(Number.isSafeInteger(index)&&index>=0&&index<CASE_IDS.length);return index;
  });
  assert.equal(new Set(indices).size,indices.length,'Duplicate selectors');
  const instantiate=generatedBinding(root,surface);
  const observations=await observe(instantiate,indices.map(index=>CASE_IDS[index])); instantiate.check();
  assert.equal(observations.length,selected.length);
  return selected.map((item,index)=>({case_id:item.case_id,capability:CAPABILITY,result:digest(observations[index])}));
}
async function main() {
  const argv=process.argv.slice(2);assert.equal(argv.length,3);
  const selected=JSON.parse(argv[2]);assert(Array.isArray(selected)&&selected.length>0&&selected.length<=CASE_IDS.length);
  const cases=await runSelected(path.resolve(argv[0]),JSON.parse(argv[1]),selected);
  process.stdout.write(JSON.stringify({schema:'literate-ai/library-acceptance-results@1',cases})+'\n');
}
module.exports={CAPABILITY,CASE_IDS,observe,generatedBinding,runSelected,digest,main};
if(require.main===module)main().catch(error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;});
