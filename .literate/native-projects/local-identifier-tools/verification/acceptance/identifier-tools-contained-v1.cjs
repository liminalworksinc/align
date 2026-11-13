'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"647b3acec0fe8db568f478c73080a1113817ca7e4956e2de1569535436f97578","package":"identifier_tools","package_files":["create_identifiers.js","package.json"],"maximum_cases":51,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {"use strict";
// Independent identifier observer. Never source-generation input.
const assert=require("node:assert/strict"),crypto=require("node:crypto"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),sqlite=require("node:sqlite");
const {stripTypeScriptTypes,syncBuiltinESMExports}=require("node:module");
const {pathToFileURL}=require("node:url");
const OriginalDate=Date,OriginalRandomBytes=crypto.randomBytes,OriginalCreateHash=crypto.createHash;
const cwdAtStart=process.cwd(),stdout=process.stdout,stderr=process.stderr,exit=process.exit.bind(process);
const CAPABILITY="identifier-tools.create-identifiers";
const sha=value=>OriginalCreateHash("sha256").update(value).digest("hex");
const expectedSource={"lib/v2/ids.ts": "bbfd3e67c32ba15e1fe30187427e31d9962a871ac6e6bc93e256b87f43510d95", "lib/v2/core.mts": "2dad847c7e7240a0b0f8af3d4be907fc8e4194929cf8032f01a22e79612bb1f5"};
function loadBaseline(root){
  const sources={};
  for(const [name,digest] of Object.entries(expectedSource)){
    const file=path.resolve(root,name);assert.equal(fs.realpathSync(file),file);
    const original=fs.readFileSync(file,"utf8");assert.equal(sha(original),digest,"Unreviewed identifier snapshot: "+name);
    sources[name]=stripTypeScriptTypes(original,{mode:"strip"});
  }
  return sources;
}
const plain = (value) => Buffer.isBuffer(value) ? { buffer_hex: value.toString("hex") } : value;
async function fixture(moduleSources, factory, options = {}) {
  const calls = [], observed = [];
  const entropy = (options.entropy ?? []).map((value) => Buffer.from(value));
  const times = [...(options.times ?? [])];
  const fault = new Error("synthetic-identifier-resource-failure");
  const randomBytes = function (bytes) {
    calls.push({ port: "randomBytes", arguments: [bytes], bare: this === undefined });
    if (options.fault === "entropy") throw fault;
    if (!entropy.length) return OriginalRandomBytes(bytes);
    const value = entropy.shift();
    assert.equal(bytes, value.length, "Original helper must request the declared byte count");
    return value;
  };
  const createHash = function (algorithm) {
    calls.push({ port: "createHash", arguments: [algorithm], bare: this === undefined });
    if (options.fault === "hash-create") throw fault;
    const hash = OriginalCreateHash(algorithm);
    const resource = {
      update(value) {
        calls.push({ port: "hash.update", arguments: [plain(value)], receiver: this === resource });
        if (options.fault === "hash-update") throw fault;
        hash.update(value);
        return resource;
      },
      digest(encoding) {
        calls.push({ port: "hash.digest", arguments: [encoding], receiver: this === resource });
        if (options.fault === "hash-digest") throw fault;
        return hash.digest(encoding);
      },
    };
    return resource;
  };
  class FixtureDate extends OriginalDate {
    constructor(...args) {
      calls.push({ port: "Date", arguments: args, construction: true });
      if (options.fault === "clock-create") throw fault;
      assert.equal(args.length, 0, "Original clock must use the current instant");
      assert(times.length, "Unexpected clock access");
      super(times.shift());
    }
    toISOString() {
      calls.push({ port: "Date.toISOString", arguments: [], receiver: this instanceof FixtureDate });
      if (options.fault === "clock-format") throw fault;
      return super.toISOString();
    }
    static now() { throw new Error("Unexpected Date.now access"); }
  }
  const newDate=function(){assert.equal(this,undefined,"Clock callback must be called without a receiver");return new FixtureDate();};
  const binding={randomBytes,createHash,newDate};
  let api;
  if(factory){
    api=factory(binding);
    assert(api&&typeof api==="object"&&typeof api.then!=="function","Expected a synchronous identifier service");
  }else{
    const context=vm.createContext({Date:FixtureDate});
    const ports={createHash,randomBytes,createHmac(){throw new Error("Unrelated signing capability used");}};
    const cryptoModule=new vm.SyntheticModule(Object.keys(ports),function(){for(const [key,value] of Object.entries(ports))this.setExport(key,value);},{context});
    const core=new vm.SourceTextModule(moduleSources["lib/v2/core.mts"],{context,identifier:"captured-base32"});
    const ids=new vm.SourceTextModule(moduleSources["lib/v2/ids.ts"],{context,identifier:"captured-identifiers"});
    await ids.link(specifier=>{if(specifier==="node:crypto")return cryptoModule;if(specifier==="./core.mts")return core;throw new Error("Unexpected identifier dependency: "+specifier);});
    await ids.evaluate();api=ids.namespace;
  }
  assert.deepEqual(calls, [], "Constructing an identifier binding must not access resources");
  const eq = (label, actual, expected) => {
    assert.deepEqual(actual, expected, label);
    observed.push({ label, actual: plain(actual), expected: plain(expected) });
  };
  const throws = (label, fn, expected) => {
    let error;
    try { fn(); } catch (value) { error = value; }
    assert(error, label);
    if (expected === "same-resource-error") eq(label + " identity", error === fault, true);
    else { eq(label + " name", error.name, expected.name); eq(label + " code", error.code ?? null, expected.code ?? null); }
    observed.push({ label, thrown: { name: error.name, code: error.code ?? null, message: error.message } });
  };
  return { api, binding, calls, observed, entropy, times, eq, throws, fork:options=>fixture(moduleSources,factory,options) };
}
const cases=[];const test=(name,options,run)=>cases.push({name,options,run});
test("surface-and-reexport-identity", {}, (f) => {
  f.eq("public names", Object.keys(f.api).sort(), ["newId", "nowIso", "rand32", "secretToken", "sha256hex"]);
  for (const [name, arity] of Object.entries({ newId: 1, nowIso: 0, rand32: 0, secretToken: 0, sha256hex: 1 })) f.eq(name + " arity", f.api[name].length, arity);
});
const words = ["", "f", "fo", "foo", "foob", "fooba", "foobar"];
const encoded = ["", "my", "mzxq", "mzxw6", "mzxw6yq", "mzxw6ytb", "mzxw6ytboi"];
for (const [index, word] of words.entries()) test("rfc4648-" + word.length, { entropy: [Buffer.from(word)] }, (f) => {
  f.eq("lowercase unpadded encoding", f.api.rand32(word.length), encoded[index]);
  f.eq("entropy call", f.calls, [{ port: "randomBytes", arguments: [word.length], bare: true }]);
});
for (const bytes of [1, 2, 3, 4, 5, 7, 8, 15, 20, 32]) test("base32-high-bits-" + bytes, { entropy: [Buffer.alloc(bytes, 255)] }, (f) => {
  const result = f.api.rand32(bytes);
  const bits = bytes * 8, whole = Math.floor(bits / 5), remaining = bits % 5;
  const suffix = remaining ? "abcdefghijklmnopqrstuvwxyz234567"[((1 << remaining) - 1) << (5 - remaining)] : "";
  f.eq("all bits preserved", result, "7".repeat(whole) + suffix);
  f.eq("output length", result.length, Math.ceil(bits / 5));
});
test("default-base32-and-fresh-entropy", { entropy: [Buffer.alloc(15), Buffer.alloc(15, 255)] }, (f) => {
  f.eq("first default", f.api.rand32(), "a".repeat(24));
  f.eq("second default", f.api.rand32(), "7".repeat(24));
  f.eq("two entropy samples", f.calls.map((call) => call.arguments), [[15], [15]]);
});
const prefixes = ["u", "ws", "pod", "g", "al", "dv", "dir", "inv", "m", "dr", "cr", "ar", "ev", "ask", "vr", "rq", "rl"];
test("all-seventeen-prefixes", { entropy: prefixes.map(() => Buffer.alloc(15)) }, (f) => {
  for (const prefix of prefixes) f.eq("prefix " + prefix, f.api.newId(prefix), prefix + "_" + "a".repeat(24));
  f.eq("one fifteen-byte sample per id", f.calls.map((call) => call.arguments[0]), prefixes.map(() => 15));
});
for (const bytes of [0, 1, 2, 3, 7, 17, 32]) test("secret-token-" + bytes, { entropy: [Buffer.alloc(bytes, 251)] }, (f) => {
  f.eq("base64url token", f.api.secretToken(bytes), Buffer.alloc(bytes, 251).toString("base64url"));
  f.eq("sample count", f.calls.length, 1);
});
test("secret-token-default", { entropy: [Buffer.alloc(32, 255)] }, (f) => {
  f.eq("default size and encoding", f.api.secretToken(), Buffer.alloc(32, 255).toString("base64url"));
  f.eq("sample arguments", f.calls[0].arguments, [32]);
});
for (const [index, value] of ["", "abc", "é", "e\u0301", "line\n\u0000tail", Buffer.from(Array.from({ length: 256 }, (_, i) => i))].entries()) test("sha256-" + index, {}, (f) => {
  f.eq("digest", f.api.sha256hex(value), sha(value));
  f.eq("hash operation order", f.calls.map((call) => call.port), ["createHash", "hash.update", "hash.digest"]);
  f.eq("algorithm", f.calls[0].arguments, ["sha256"]);
  f.eq("exact input", f.calls[1].arguments, [plain(value)]);
  f.eq("encoding", f.calls[2].arguments, ["hex"]);
});
test("iso-clock-samples-and-utc", { times: [0, -1, 951827696789] }, (f) => {
  for (const instant of [0, -1, 951827696789]) f.eq("UTC " + instant, f.api.nowIso(), new OriginalDate(instant).toISOString());
  f.eq("one construction and format per call", f.calls.map((call) => call.port), ["Date", "Date.toISOString", "Date", "Date.toISOString", "Date", "Date.toISOString"]);
});
test("invalid-clock", { times: [NaN] }, (f) => f.throws("invalid instant", () => f.api.nowIso(), { name: "RangeError" }));
for (const method of ["rand32", "secretToken", "newId"]) test("entropy-error-" + method, { fault: "entropy" }, (f) => {
  f.throws("same entropy failure", () => method === "newId" ? f.api[method]("u") : f.api[method](), "same-resource-error");
  f.eq("stop at entropy failure", f.calls.length, 1);
});
for (const fault of ["hash-create", "hash-update", "hash-digest"]) test("resource-error-" + fault, { fault }, (f) => {
  f.throws("same hash failure", () => f.api.sha256hex("abc"), "same-resource-error");
  f.eq("stop at failed resource", f.calls.length, ["hash-create", "hash-update", "hash-digest"].indexOf(fault) + 1);
});
test("clock-error-identity", { fault: "clock-format", times: [0] }, (f) => f.throws("same formatting failure", () => f.api.nowIso(), "same-resource-error"));
for (const method of ["rand32", "secretToken"]) test("negative-byte-count-" + method, {}, (f) => {
  f.throws("native entropy refusal", () => f.api[method](-1), { name: "RangeError", code: "ERR_OUT_OF_RANGE" });
  f.eq("original negative argument", f.calls[0].arguments, [-1]);
});

// These cases extend the authored resource-binding contract beyond the original 142 observations.
function exerciseBare(f){
  const {rand32,newId,secretToken,sha256hex,nowIso}=f.api;
  f.eq("bare base32",rand32(),"a".repeat(24));
  f.eq("bare prefixed id",newId("dv"),"dv_"+"7".repeat(24));
  f.eq("bare token",secretToken(2),Buffer.alloc(2,251).toString("base64url"));
  f.eq("bare hash",sha256hex("abc"),sha("abc"));
  f.eq("bare clock",nowIso(),"1970-01-01T00:00:00.000Z");
  f.eq("resource callback receivers",f.calls.filter(call=>["randomBytes","createHash"].includes(call.port)).every(call=>call.bare),true);
}
const allPorts={entropy:[Buffer.alloc(15),Buffer.alloc(15,255),Buffer.alloc(2,251)],times:[0]};
test("public-methods-work-as-bare-aliases",allPorts,exerciseBare);
test("bound-resource-references-are-captured-once",allPorts,f=>{
  for(const name of ["randomBytes","createHash","newDate"])f.binding[name]=()=>{throw new Error("Replacement resource must not run");};
  exerciseBare(f);
});
test("public-function-names-are-preserved",{},f=>{
  const names=["newId","nowIso","rand32","secretToken","sha256hex"];
  f.eq("public names",names.map(name=>f.api[name].name),names);
});
test("distinct-resource-bindings-remain-independent",{entropy:[Buffer.alloc(3),Buffer.alloc(3,255)]},async f=>{
  const other=await f.fork({entropy:[Buffer.alloc(3,251)]});
  f.eq("first bound resource",f.api.secretToken(3),Buffer.alloc(3).toString("base64url"));
  f.eq("second bound resource",other.api.secretToken(3),Buffer.alloc(3,251).toString("base64url"));
  f.eq("first resource remains active",f.api.secretToken(3),Buffer.alloc(3,255).toString("base64url"));
  f.eq("second resource used once",other.calls.length,1);
  f.eq("second scripted resource consumed",other.entropy.length,0);
});
test("clock-construction-error-identity",{fault:"clock-create"},f=>{
  f.throws("same construction failure",()=>f.api.nowIso(),"same-resource-error");
  f.eq("stop at failed clock construction",f.calls.map(call=>call.port),["Date"]);
});
test("undefined-byte-counts-keep-natural-defaults",{entropy:[Buffer.alloc(15),Buffer.alloc(32,255)]},f=>{
  f.eq("undefined base32 bytes",f.api.rand32(undefined),"a".repeat(24));
  f.eq("undefined token bytes",f.api.secretToken(undefined),Buffer.alloc(32,255).toString("base64url"));
  f.eq("default arguments",f.calls.map(call=>call.arguments),[[15],[32]]);
});
function installEffectsGuard() {
  const effects = { filesystem: 0, network: 0, childProcess: 0, ambientEnvironment: 0, ambientCwd: 0, ambientClock: 0, ambientState: 0, ambientEntropy: 0, ambientHash: 0 };
  let trusted = 0;
  const NativeError = Error;
  const originalCwd = process.cwd.bind(process);
  const modules = [
    [fs, "filesystem"], [require("node:fs/promises"), "filesystem"],
    [require("node:http"), "network"], [require("node:https"), "network"],
    [require("node:net"), "network"], [require("node:tls"), "network"],
    [require("node:dgram"), "network"], [require("node:dns"), "network"],
    [require("node:dns/promises"), "network"], [require("node:child_process"), "childProcess"],
  ];
  function caller(skip) {
    const previous = NativeError.prepareStackTrace;
    const previousLimit = NativeError.stackTraceLimit;
    try {
      NativeError.stackTraceLimit = 16;
      NativeError.prepareStackTrace = (_error, frames) => frames;
      const record = {};
      NativeError.captureStackTrace(record, skip);
      return record.stack[0]?.getFileName() || "";
    } finally { NativeError.prepareStackTrace = previous; NativeError.stackTraceLimit = previousLimit; }
  }
  function blocked(domain, name) {
    effects[domain]++;
    throw new NativeError("Identifier verifier blocked " + domain + "." + name);
  }
  function wrap(original, domain, name) {
    function guarded(...args) {
      if (trusted) return Reflect.apply(original, this, args);
      const origin = caller(guarded);
      if (domain === "filesystem" && name === "writeSync" && (args[0] === 1 || args[0] === 2) && origin === "node:internal/fs/sync_write_stream") return Reflect.apply(original, this, args);
      const loaderRead = domain === "filesystem" && /^(?:read|open|close|stat|lstat|fstat|realpath|access|exists)/.test(name) && origin.startsWith("node:internal/modules/");
      if (loaderRead) {
        trusted++;
        try { return Reflect.apply(original, this, args); }
        finally { trusted--; }
      }
      return blocked(domain, name);
    }
    if (typeof original.native === "function") guarded.native = wrap(original.native, domain, name + ".native");
    return guarded;
  }
  const seen = new Set();
  for (const [object, domain] of modules) {
    if (seen.has(object)) continue;
    seen.add(object);
    for (const key of Object.getOwnPropertyNames(object)) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      const original = object[key];
      if (typeof original !== "function") continue;
      const value = wrap(original, domain, key);
      if (descriptor.configurable) Object.defineProperty(object, key, { configurable: true, enumerable: descriptor.enumerable, value, writable: true });
      else assert(Reflect.set(object, key, value), "cannot instrument " + domain + "." + key);
    }
  }
  const cryptoTargets=[
    [crypto,["randomBytes","pseudoRandomBytes","randomFill","randomFillSync","randomInt","randomUUID"],"ambientEntropy"],
    [crypto,["createHash","createHmac"],"ambientHash"],
    [crypto.webcrypto,["getRandomValues","randomUUID"],"ambientEntropy"],
    [crypto.webcrypto.subtle,["digest"],"ambientHash"],
  ];
  for(const [object,names,domain] of cryptoTargets)for(const name of names)if(typeof object[name]==="function")Object.defineProperty(object,name,{configurable:true,writable:true,value:wrap(object[name],domain,name)});
  Math.random=wrap(Math.random,"ambientEntropy","Math.random");
  const workers = require("node:worker_threads");
  workers.Worker = wrap(workers.Worker, "childProcess", "Worker");
  for (const name of ["fetch", "WebSocket", "EventSource"]) if (typeof globalThis[name] === "function") globalThis[name] = wrap(globalThis[name], "network", name);
  for (const name of ["exit", "abort", "kill"]) process[name] = wrap(process[name], "childProcess", "process." + name);
  process.env = new Proxy({}, {
    get(_target, key) {
      if (typeof key !== "string") return undefined;
      if (trusted || caller(this.get).startsWith("node:")) return undefined;
      return blocked("ambientEnvironment", key);
    },
    set(_target, key) { return blocked("ambientEnvironment", String(key)); },
    ownKeys() {
      if (trusted || caller(this.ownKeys).startsWith("node:")) return [];
      return blocked("ambientEnvironment", "enumerate");
    },
  });
  process.cwd = function guardedCwd() {
    if (trusted || caller(guardedCwd).startsWith("node:")) return originalCwd();
    return blocked("ambientCwd", "cwd");
  };
  for (const name of ["DatabaseSync", "Session"]) if (typeof sqlite[name] === "function") sqlite[name] = wrap(sqlite[name], "filesystem", "sqlite." + name);
  const OriginalDate = globalThis.Date;
  const blockedNow = () => blocked("ambientClock", "Date.now");
  globalThis.Date = new Proxy(OriginalDate, {
    get(target, key, receiver) { return key === "now" ? blockedNow : Reflect.get(target, key, receiver); },
    apply() { return blocked("ambientClock", "Date"); },
    construct() { return blocked("ambientClock", "new Date"); },
  });
  if (typeof performance?.now === "function") Object.defineProperty(performance, "now", { configurable: true, value: () => blocked("ambientClock", "performance.now") });
  for (const name of ["hrtime", "uptime"]) if (typeof process[name] === "function") process[name] = () => blocked("ambientClock", "process." + name);
  Object.defineProperty(globalThis, "__alignV2Limits", { configurable: true, get() { return blocked("ambientState", "__alignV2Limits"); }, set() { return blocked("ambientState", "__alignV2Limits"); } });
  syncBuiltinESMExports();
  return {
    effects,
    assertClean() { for (const [name, value] of Object.entries(effects)) assert.equal(value, 0, "identifier effect: " + name); },
    trusted(fn) { trusted++; try { return fn(); } finally { trusted--; } },
  };
}
function generatedPath(root, surface) {
  const binding = surface?.capabilities.find(item => item.capability === CAPABILITY);
  if (surface) assert(binding && binding.symbols.includes("create_identifiers"), "missing identifier import capability");
  const module = binding?.module || "identifier_tools/create_identifiers";
  const files = [];
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const file = path.join(folder, entry.name);
      assert(!entry.isSymbolicLink(), "candidate source must not contain symbolic links");
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && [".js", ".mjs", ".cjs"].includes(path.extname(file))) files.push(file);
    }
  }
  walk(root);
  const hits = files.filter(file => {
    const relative = path.relative(root, file).split(path.sep).join("/");
    return [".js", ".mjs", ".cjs"].some(ext => relative === module + ext || relative.endsWith("/" + module + ext));
  });
  assert.equal(hits.length, 1, "expected one advertised identifier module");
  return hits[0];
}

async function observeCase(moduleSources,factory,args){
  assert(Array.isArray(args)&&args.length===1&&Number.isSafeInteger(args[0])&&args[0]>=0&&args[0]<cases.length,"invalid identifier case selector");
  const item=cases[args[0]],f=await fixture(moduleSources,factory,item.options);
  await item.run(f);
  assert.equal(f.entropy.length,0,"Unconsumed scripted entropy: "+item.name);
  assert.equal(f.times.length,0,"Unconsumed scripted clock: "+item.name);
  return {name:item.name,observations:f.observed,calls:f.calls};
}
async function runCase(moduleSources,factory,args){
  const record=await observeCase(moduleSources,factory,args);
  return {observations:record.observations.length,sha256:sha(JSON.stringify(record))};
}
async function main(){
  const profile=["--baseline","--generated"].includes(process.argv[1]);
  const mode=profile?process.argv[1]:"--generated";
  const root=profile?cwdAtStart:path.resolve(process.argv[2]);
  const surface=profile?null:JSON.parse(process.argv[3]);
  const selected=profile?[{arguments:JSON.parse(process.argv[2])}]:JSON.parse(process.argv[4]);
  assert(Array.isArray(selected)&&selected.length>0&&selected.length<=64);
  let sources,factory,file;
  if(mode==="--baseline")sources=loadBaseline(root);
  else file=generatedPath(root,surface);
  const guard=installEffectsGuard();
  if(file){
    const loaded=await import(pathToFileURL(file).href);
    factory=loaded.create_identifiers??loaded.default?.create_identifiers??loaded.default;
    assert.equal(typeof factory,"function","missing identifier constructor");
    assert.equal(factory.length,1,"identifier constructor must have one required argument");
  }
  guard.assertClean();
  const results=[];
  for(const item of selected){
    if(!profile)assert.equal(item.capability,CAPABILITY);
    const result=await runCase(sources,factory,item.arguments);guard.assertClean();
    results.push(profile?result:{case_id:item.case_id,capability:CAPABILITY,result});
  }
  const output=profile?results[0]:{schema:"literate-ai/library-acceptance-results@1",cases:results};
  guard.trusted(()=>stdout.write(JSON.stringify(output)+"\n"));
}
module.exports={CAPABILITY,cases,loadBaseline,observeCase,runCase,generatedPath,installEffectsGuard};
if(require.main===module||["--baseline","--generated"].includes(process.argv[1]))main().catch(error=>{stderr.write((error.stack||String(error))+"\n");exit(1);});
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
