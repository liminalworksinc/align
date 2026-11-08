// Private independent acceptance verifier. Original startup implementation excluded.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const vm=require('node:vm'),crypto=require('node:crypto'),cp=require('node:child_process');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const CAPABILITY='server-startup.create-startup';
const CASE_IDS=["public-surface","new-owner","detached-public-startup","validation-before-build-skip","production-build-skips-effects","other-phase-trailing-space","other-phase-upper-case","other-phase-other","existing-own-pid-ordinary","existing-own-pid-spaces","existing-own-pid-leading-zero","existing-own-pid-plus","existing-own-pid-decimal","existing-own-pid-exponent","existing-own-pid-hex","falsy-pid-empty","falsy-pid-whitespace","falsy-pid-zero","falsy-pid-negative-zero","falsy-pid-invalid","numeric-probe-infinity","numeric-probe-fraction","numeric-probe-negative","numeric-probe-other","owned-live-other-process","owned-stale-process","permission-denied-probe-counts-alive","other-probe-error-ESRCH","other-probe-error-EINVAL","other-probe-error-EACCES","other-probe-error-eperm","other-probe-error-undefined","successful-probe-return-false","successful-probe-return-zero","successful-probe-return-empty","successful-probe-return-undefined","unexpected-probe-throw-null","unexpected-probe-throw-undefined","pid-path-directory","unreadable-pid-file","data-directory-is-file","nested-unicode-data-directory","empty-client-directory","crash-file-name-matrix","supplied-directory-order","matching-symlink-unlinked","matching-directory-refuses-recursion","warnings-in-order-without-reformatting","repeated-starts-are-not-cached","exit-own","exit-whitespace-own","exit-numeric-leading-zero","exit-malformed","exit-replaced","exit-missing-file-is-silent","exit-keeps-captured-path","exit-swallows-readFileSync","exit-swallows-unlinkSync","exit-swallows-null","resource-failure-assertStartupConfig-1","resource-failure-environment-1","resource-failure-dataDir-1","resource-failure-join-1","resource-failure-existsSync-1","resource-failure-readFileSync-1","resource-failure-dirname-1","resource-failure-mkdirSync-1","resource-failure-pid-1","resource-failure-writeFileSync-1","resource-failure-chmodSync-1","resource-failure-dcrDir-1","resource-failure-existsSync-2","resource-failure-readdirSync-1","resource-failure-rmSync-2","resource-failure-warnings-1","resource-failure-warn-2","resource-failure-once-1","refusal-formatting-failure-propagates","binding-captures-handles-and-reads-current-environment"];
function candidateEntry(root, surface) {
  const binding = surface?.capabilities.find(item => item.capability === CAPABILITY);
  if (surface) assert(binding && binding.symbols.includes('create_startup'), 'Missing startup import capability');
  const module = binding?.module || 'server_startup/create_startup';
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
  walk(root); assert.equal(hits.length, 1, 'Expected one advertised startup module');
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
    const factory = values.create_startup ?? values.default?.create_startup ?? values.default;
    assert.equal(typeof factory, 'function', 'Missing startup factory');
    assert.equal(factory.name, 'create_startup'); assert.equal(factory.length, 1);
    return factory;
  };
}


"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.observeStartup = observeStartup;
// Independent behavior observations. This module contains no startup algorithm.
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
async function observeStartup(instantiate, { caseIds, bindingProbe = false } = {}) {
    strict_1.default.notEqual(process.geteuid(), 0, 'Permission controls require a non-root worker');
    const selected = caseIds === undefined ? null : new Set(caseIds);
    if (selected)
        (0, strict_1.default)(selected.size > 0 && selected.size === caseIds.length, 'Select distinct existing cases');
    const cases = [];
    async function fixture() {
        const root = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), 'align-startup-observation-'));
        const f = { root, dataDir: node_path_1.default.join(root, 'data'), clientDir: node_path_1.default.join(root, 'data', 'workspaces'),
            pid: process.pid, env: {}, warnings: [], warned: [], handlers: [], calls: [], counts: {},
            fault: null, probeFault: null, killHandler: null, readOrder: null, children: [], pidAliases: new Map() };
        f.pidAliases.set(String(f.pid), '<current-pid>');
        f.normalize = value => {
            if (typeof value === 'string') {
                value = value.split(root).join('<fixture>');
                for (const [pid, label] of f.pidAliases) {
                    if (value.trim() === pid)
                        value = value.replace(pid, label);
                    else if (value === '000' + pid)
                        value = '000' + label;
                    value = value.split('(pid ' + pid + ')').join('(pid ' + label + ')');
                }
                return value;
            }
            if (typeof value === 'number') {
                if (!Number.isFinite(value))
                    return { number: String(value) };
                return f.pidAliases.get(String(value)) ?? value;
            }
            if (typeof value === 'function')
                return '<callback>';
            if (value === undefined)
                return '<undefined>';
            if (value === null || typeof value !== 'object')
                return value;
            if (Array.isArray(value))
                return value.map(f.normalize);
            return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, f.normalize(item)]));
        };
        const resource = (name, operation) => (...args) => {
            const ordinal = f.counts[name] = (f.counts[name] ?? 0) + 1;
            f.calls.push({ name, args: f.normalize(args) });
            if (f.fault?.name === name && ordinal === (f.fault.nth ?? 1))
                throw f.fault.value;
            return operation(...args);
        };
        f.ports = {
            assertStartupConfig: resource('assertStartupConfig', () => undefined),
            environment: resource('environment', () => f.env),
            dataDir: resource('dataDir', () => f.dataDir),
            dcrDir: resource('dcrDir', () => f.clientDir),
            warnings: resource('warnings', () => f.warnings),
            ...Object.fromEntries(['chmodSync', 'existsSync', 'mkdirSync', 'readFileSync', 'rmSync', 'unlinkSync', 'writeFileSync']
                .map(name => [name, resource(name, node_fs_1.default[name])])),
            readdirSync: resource('readdirSync', directory => f.readOrder && directory === f.clientDir
                ? [...f.readOrder] : node_fs_1.default.readdirSync(directory)),
            join: resource('join', node_path_1.default.join), dirname: resource('dirname', node_path_1.default.dirname),
            pid: resource('pid', () => f.pid),
            kill: resource('kill', (...args) => {
                if (f.killHandler)
                    return f.killHandler(...args);
                (0, strict_1.default)(f.children.some(child => child.pid === args[0]), 'Probe only an owned child PID');
                strict_1.default.equal(args[1], 0, 'A real liveness probe must deliver no signal');
                return process.kill(...args);
            }),
            once: resource('once', (event, handler) => { f.handlers.push({ event, handler }); return { fixture_process: true }; }),
            warn: resource('warn', value => { f.warned.push(value); }),
        };
        try {
            f.api = await instantiate(f.ports);
            strict_1.default.deepEqual(f.calls, [], 'Module binding must not execute startup effects');
        }
        catch (error) {
            node_fs_1.default.rmSync(root, { recursive: true, force: true });
            throw error;
        }
        f.pidFile = () => node_path_1.default.join(f.dataDir, '.pid');
        f.seedPid = (text, mode = 0o600) => {
            node_fs_1.default.mkdirSync(f.dataDir, { recursive: true, mode: 0o755 });
            node_fs_1.default.chmodSync(f.dataDir, 0o755);
            node_fs_1.default.writeFileSync(f.pidFile(), text, { mode });
            node_fs_1.default.chmodSync(f.pidFile(), mode);
        };
        f.seedClients = names => {
            node_fs_1.default.mkdirSync(f.clientDir, { recursive: true, mode: 0o700 });
            for (const name of names)
                node_fs_1.default.writeFileSync(node_path_1.default.join(f.clientDir, name), 'fixture:' + name);
        };
        f.outcome = operation => {
            try {
                const value = operation();
                return { returned: value === undefined ? 'undefined' : typeof value };
            }
            catch (error) {
                return { thrown: { type: error === null ? 'null' : typeof error,
                        name: error?.name ?? null, code: error?.code ?? null,
                        message: f.normalize(error?.message ?? String(error)),
                        same_fault: f.fault !== null && error === f.fault.value,
                        same_probe_fault: f.probeFault !== null && error === f.probeFault.value } };
            }
        };
        f.start = () => f.outcome(() => f.api.startup());
        f.exit = index => {
            const item = f.handlers[index];
            (0, strict_1.default)(item);
            strict_1.default.equal(item.event, 'exit');
            return f.outcome(() => item.handler(37));
        };
        f.names = () => f.calls.map(call => call.name);
        f.mode = file => (node_fs_1.default.statSync(file).mode & 0o777).toString(8).padStart(4, '0');
        f.ownPid = () => {
            strict_1.default.equal(node_fs_1.default.readFileSync(f.pidFile(), 'utf8'), String(f.pid));
            strict_1.default.equal(f.mode(f.pidFile()), '0600');
        };
        f.child = async () => {
            const child = (0, node_child_process_1.spawn)(process.execPath, ['-e', "process.stdout.write('ready\\n');setInterval(()=>{},1000)"], { stdio: ['ignore', 'pipe', 'pipe'] });
            f.children.push(child);
            child.finished = new Promise(resolve => child.once('exit', resolve));
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Owned child readiness timeout')), 5000);
                child.once('error', error => { clearTimeout(timer); reject(error); });
                child.stdout.once('data', data => { clearTimeout(timer); strict_1.default.equal(data.toString(), 'ready\n'); resolve(); });
            });
            return child;
        };
        f.snapshot = () => {
            const records = [];
            function visit(directory, prefix = '') {
                for (const name of node_fs_1.default.readdirSync(directory).sort()) {
                    const file = node_path_1.default.join(directory, name), relative = prefix + name, stat = node_fs_1.default.lstatSync(file);
                    const record = { path: relative, mode: (stat.mode & 0o777).toString(8).padStart(4, '0') };
                    if (stat.isSymbolicLink())
                        records.push({ ...record, kind: 'symlink', target: f.normalize(node_fs_1.default.readlinkSync(file)) });
                    else if (stat.isDirectory()) {
                        records.push({ ...record, kind: 'directory' });
                        try {
                            visit(file, relative + '/');
                        }
                        catch (error) {
                            records.push({ path: relative, read_error: error.code });
                        }
                    }
                    else {
                        try {
                            records.push({ ...record, kind: 'file', text: f.normalize(node_fs_1.default.readFileSync(file, 'utf8')) });
                        }
                        catch (error) {
                            records.push({ ...record, kind: 'file', read_error: error.code });
                        }
                    }
                }
            }
            visit(root);
            return records;
        };
        f.close = async () => {
            for (const child of f.children) {
                if (child.exitCode === null && child.signalCode === null)
                    child.kill('SIGTERM');
                await child.finished;
            }
            function accessible(directory) {
                node_fs_1.default.chmodSync(directory, 0o700);
                for (const entry of node_fs_1.default.readdirSync(directory, { withFileTypes: true }))
                    if (entry.isDirectory())
                        accessible(node_path_1.default.join(directory, entry.name));
            }
            accessible(root);
            node_fs_1.default.rmSync(root, { recursive: true, force: true });
        };
        return f;
    }
    async function test(case_id, body) {
        if (selected && !selected.has(case_id))
            return;
        const f = await fixture();
        try {
            const detail = await body(f);
            cases.push({ case_id, result: { ...detail, calls: f.calls, files: f.snapshot(),
                    warnings: f.normalize(f.warned), registered_events: f.handlers.map(item => item.event) } });
        }
        finally {
            await f.close();
        }
    }
    const success = outcome => strict_1.default.deepEqual(outcome, { returned: 'undefined' });
    const errno = code => Object.assign(new Error('synthetic-process-probe'), { code });
    const fault = (f, name, nth = 1) => {
        const value = Object.assign(new Error('synthetic-startup-' + name), { code: 'FIXTURE_RESOURCE_FAILURE' });
        f.fault = { name, nth, value };
        return value;
    };
    await test('public-surface', f => {
        strict_1.default.deepEqual(Object.keys(f.api), ['startup']);
        strict_1.default.equal(f.api.startup.length, 0);
        strict_1.default.equal(f.api.startup.name, 'startup');
        return { exports: ['startup'], arity: 0, import_effects: 0 };
    });
    await test('new-owner', f => {
        success(f.start());
        f.ownPid();
        strict_1.default.equal(f.mode(f.dataDir), '0700');
        strict_1.default.deepEqual(f.names(), ['assertStartupConfig', 'environment', 'dataDir', 'join', 'existsSync',
            'dirname', 'mkdirSync', 'pid', 'writeFileSync', 'chmodSync', 'dcrDir', 'existsSync', 'warnings', 'once']);
        strict_1.default.equal(f.handlers.length, 1);
        return { new_directory_mode: '0700', pid_mode: '0600' };
    });
    await test('detached-public-startup', f => {
        const startup = f.api.startup;
        success(f.outcome(() => startup()));
        f.ownPid();
        strict_1.default.equal(f.handlers.length, 1);
        return { detached_call_works: true };
    });
    await test('validation-before-build-skip', f => {
        f.env = { NEXT_PHASE: 'phase-production-build' };
        fault(f, 'assertStartupConfig');
        const result = f.start();
        strict_1.default.equal(result.thrown.same_fault, true);
        strict_1.default.deepEqual(f.names(), ['assertStartupConfig']);
        return result;
    });
    await test('production-build-skips-effects', f => {
        f.env = { NEXT_PHASE: 'phase-production-build' };
        success(f.start());
        strict_1.default.deepEqual(f.names(), ['assertStartupConfig', 'environment']);
        return { build_skipped: true };
    });
    for (const [label, phase] of [['trailing-space', 'phase-production-build '], ['upper-case', 'PHASE-PRODUCTION-BUILD'], ['other', 'build']]) {
        await test('other-phase-' + label, f => {
            f.env = { NEXT_PHASE: phase };
            success(f.start());
            f.ownPid();
            return { phase };
        });
    }
    for (const [label, text] of [['ordinary', f => String(f.pid)], ['spaces', f => ' \t' + f.pid + '\n'],
        ['leading-zero', f => '000' + f.pid], ['plus', f => '+' + f.pid], ['decimal', f => f.pid + '.0'],
        ['exponent', f => f.pid + 'e0'], ['hex', f => '0x' + f.pid.toString(16)]]) {
        await test('existing-own-pid-' + label, f => {
            f.seedPid(text(f), 0o644);
            success(f.start());
            f.ownPid();
            strict_1.default.equal(f.mode(f.dataDir), '0755');
            strict_1.default.equal(f.counts.kill ?? 0, 0);
            return { pid_rewritten: true, existing_directory_mode: '0755' };
        });
    }
    for (const [label, text] of [['empty', ''], ['whitespace', ' \t\n'], ['zero', '0'], ['negative-zero', '-0'], ['invalid', 'not-a-pid']]) {
        await test('falsy-pid-' + label, f => {
            f.seedPid(text);
            success(f.start());
            f.ownPid();
            strict_1.default.equal(f.counts.kill ?? 0, 0);
            return { probe_calls: 0 };
        });
    }
    for (const [label, text, expected] of [['infinity', 'Infinity', Infinity], ['fraction', '1.5', 1.5], ['negative', '-1', -1], ['other', '424242', 424242]]) {
        await test('numeric-probe-' + label, f => {
            f.seedPid(text);
            f.killHandler = (pid, signal) => { strict_1.default.equal(pid, expected); strict_1.default.equal(signal, 0); throw errno('ESRCH'); };
            success(f.start());
            f.ownPid();
            return { parsed: f.normalize(expected), probe_signal: 0 };
        });
    }
    await test('owned-live-other-process', async (f) => {
        const child = await f.child();
        f.pidAliases.set(String(child.pid), '<live-pid>');
        f.seedPid(' ' + child.pid + '\n', 0o644);
        const result = f.start();
        strict_1.default.equal(result.thrown.name, 'Error');
        strict_1.default.equal(result.thrown.message, 'Another Align server (pid <live-pid>) is using <fixture>/data. Stop it first.');
        strict_1.default.equal(f.counts.writeFileSync ?? 0, 0);
        strict_1.default.equal(f.handlers.length, 0);
        strict_1.default.equal(node_fs_1.default.readFileSync(f.pidFile(), 'utf8'), ' ' + child.pid + '\n');
        strict_1.default.equal(process.kill(child.pid, 0), true);
        return { ...result, other_process_alive: true };
    });
    await test('owned-stale-process', async (f) => {
        const child = await f.child();
        f.pidAliases.set(String(child.pid), '<stale-pid>');
        child.kill('SIGTERM');
        await child.finished;
        f.seedPid(String(child.pid));
        success(f.start());
        f.ownPid();
        return { stale_owner_reclaimed: true, real_probe: true };
    });
    await test('permission-denied-probe-counts-alive', f => {
        f.seedPid('424242');
        f.killHandler = () => { throw errno('EPERM'); };
        const result = f.start();
        strict_1.default.equal(result.thrown.name, 'Error');
        strict_1.default.equal(f.counts.writeFileSync ?? 0, 0);
        strict_1.default.equal(f.handlers.length, 0);
        return result;
    });
    for (const code of ['ESRCH', 'EINVAL', 'EACCES', 'eperm', undefined]) {
        await test('other-probe-error-' + String(code), f => {
            f.seedPid('424242');
            f.killHandler = () => { throw errno(code); };
            success(f.start());
            f.ownPid();
            return { code: code ?? null, reclaimed: true };
        });
    }
    for (const [label, value] of [['false', false], ['zero', 0], ['empty', ''], ['undefined', undefined]]) {
        await test('successful-probe-return-' + label, f => {
            f.seedPid('424242');
            f.killHandler = () => value;
            const result = f.start();
            strict_1.default.equal(result.thrown.name, 'Error');
            strict_1.default.equal(f.counts.writeFileSync ?? 0, 0);
            return result;
        });
    }
    for (const [label, value] of [['null', null], ['undefined', undefined]]) {
        await test('unexpected-probe-throw-' + label, f => {
            f.seedPid('424242');
            f.probeFault = { value };
            f.killHandler = () => { throw value; };
            const result = f.start();
            strict_1.default.equal(result.thrown.name, 'TypeError');
            strict_1.default.equal(f.counts.writeFileSync ?? 0, 0);
            return result;
        });
    }
    await test('pid-path-directory', f => {
        node_fs_1.default.mkdirSync(f.pidFile(), { recursive: true });
        const result = f.start();
        strict_1.default.equal(result.thrown.code, 'EISDIR');
        strict_1.default.equal(f.handlers.length, 0);
        return result;
    });
    await test('unreadable-pid-file', f => {
        f.seedPid(String(f.pid));
        node_fs_1.default.chmodSync(f.pidFile(), 0);
        const result = f.start();
        strict_1.default.equal(result.thrown.code, 'EACCES');
        strict_1.default.equal(f.mode(f.pidFile()), '0000');
        return result;
    });
    await test('data-directory-is-file', f => {
        node_fs_1.default.writeFileSync(f.dataDir, 'owned-blocker');
        const result = f.start();
        (0, strict_1.default)(result.thrown);
        strict_1.default.equal(f.handlers.length, 0);
        strict_1.default.equal(node_fs_1.default.readFileSync(f.dataDir, 'utf8'), 'owned-blocker');
        return result;
    });
    await test('nested-unicode-data-directory', f => {
        f.dataDir = node_path_1.default.join(f.root, 'nested path', '資料');
        f.clientDir = node_path_1.default.join(f.dataDir, 'workspaces');
        success(f.start());
        f.ownPid();
        return { nested_created: true };
    });
    await test('empty-client-directory', f => {
        f.seedClients([]);
        success(f.start());
        strict_1.default.equal(f.counts.readdirSync, 1);
        strict_1.default.equal(f.counts.rmSync ?? 0, 0);
        return { read_once: true };
    });
    await test('crash-file-name-matrix', f => {
        const removed = ['_oauth_clients.json.01234567.tmp', '_oauth_clients.json.deadbeef00.tmp', '_oauth_clients.json.abcdef0123456789.tmp'];
        const kept = ['_oauth_clients.json.1234567.tmp', '_oauth_clients.json.ABCDEF12.tmp', 'prefix_oauth_clients.json.01234567.tmp',
            '_oauth_clients.json.01234567.tmp.backup', '_oauth_clients.json', '_oauth_clients.json.0123456g.tmp'];
        const edge = ['_oauth_clients.json.01234567.tmp\n', '_oauth_clients.json.01234567.tmp\r',
            '_oauth_clients.json.01234567.tmp\u2028', '_oauth_clients.json.01234567.tmp\u2029'];
        f.seedClients([...removed, ...kept, ...edge]);
        success(f.start());
        const after = node_fs_1.default.readdirSync(f.clientDir);
        (0, strict_1.default)(removed.every(name => !after.includes(name)));
        (0, strict_1.default)(kept.every(name => after.includes(name)));
        return { removed, kept, terminal_line_separator_removed: edge.map(name => !after.includes(name)) };
    });
    await test('supplied-directory-order', f => {
        const names = ['_oauth_clients.json.bbbbbbbb.tmp', 'keep.txt', '_oauth_clients.json.aaaaaaaa.tmp'];
        f.seedClients(names);
        f.readOrder = names;
        success(f.start());
        strict_1.default.deepEqual(f.calls.filter(call => call.name === 'rmSync').map(call => call.args[0]), ['<fixture>/data/workspaces/' + names[0], '<fixture>/data/workspaces/' + names[2]]);
        return { provided_order_preserved: true };
    });
    await test('matching-symlink-unlinked', f => {
        f.seedClients([]);
        const target = node_path_1.default.join(f.root, 'owned-target');
        node_fs_1.default.writeFileSync(target, 'kept-target');
        node_fs_1.default.symlinkSync(target, node_path_1.default.join(f.clientDir, '_oauth_clients.json.01234567.tmp'));
        success(f.start());
        strict_1.default.equal(node_fs_1.default.readFileSync(target, 'utf8'), 'kept-target');
        return { target_preserved: true };
    });
    await test('matching-directory-refuses-recursion', f => {
        f.seedClients([]);
        node_fs_1.default.mkdirSync(node_path_1.default.join(f.clientDir, '_oauth_clients.json.01234567.tmp'));
        const result = f.start();
        (0, strict_1.default)(result.thrown);
        strict_1.default.equal(f.handlers.length, 0);
        f.ownPid();
        return result;
    });
    await test('warnings-in-order-without-reformatting', f => {
        f.warnings = ['first warning', ' second\nline '];
        success(f.start());
        strict_1.default.deepEqual(f.warned, f.warnings);
        strict_1.default.equal(f.names().at(-1), 'once');
        return { passed_values_unchanged: true };
    });
    await test('repeated-starts-are-not-cached', f => {
        f.warnings = ['same warning'];
        success(f.start());
        success(f.start());
        f.ownPid();
        strict_1.default.equal(f.handlers.length, 2);
        strict_1.default.deepEqual(f.warned, ['same warning', 'same warning']);
        success(f.exit(0));
        (0, strict_1.default)(!node_fs_1.default.existsSync(f.pidFile()));
        success(f.exit(1));
        return { start_calls: 2, exit_callbacks: 2 };
    });
    for (const [label, change, removed] of [
        ['own', f => String(f.pid), true], ['whitespace-own', f => ' \t' + f.pid + '\r\n', true],
        ['numeric-leading-zero', f => '000' + f.pid, false], ['malformed', () => 'not-a-pid', false],
        ['replaced', f => { f.pidAliases.set(String(f.pid + 777777), '<replacement-pid>'); return String(f.pid + 777777); }, false]
    ]) {
        await test('exit-' + label, f => {
            success(f.start());
            const text = change(f);
            node_fs_1.default.writeFileSync(f.pidFile(), text);
            success(f.exit(0));
            strict_1.default.equal(node_fs_1.default.existsSync(f.pidFile()), !removed);
            if (!removed)
                strict_1.default.equal(node_fs_1.default.readFileSync(f.pidFile(), 'utf8'), text);
            return { removed };
        });
    }
    await test('exit-missing-file-is-silent', f => {
        success(f.start());
        node_fs_1.default.unlinkSync(f.pidFile());
        success(f.exit(0));
        return { silent: true };
    });
    await test('exit-keeps-captured-path', f => {
        success(f.start());
        const prior = f.pidFile();
        f.dataDir = node_path_1.default.join(f.root, 'later-data');
        f.seedPid(String(f.pid));
        const current = f.pidFile();
        success(f.exit(0));
        (0, strict_1.default)(!node_fs_1.default.existsSync(prior));
        (0, strict_1.default)(node_fs_1.default.existsSync(current));
        return { old_removed: true, new_preserved: true };
    });
    for (const name of ['readFileSync', 'unlinkSync']) {
        await test('exit-swallows-' + name, f => {
            success(f.start());
            fault(f, name, (f.counts[name] ?? 0) + 1);
            success(f.exit(0));
            (0, strict_1.default)(node_fs_1.default.existsSync(f.pidFile()));
            return { silent: true };
        });
    }
    await test('exit-swallows-null', f => {
        success(f.start());
        f.fault = { name: 'unlinkSync', nth: 1, value: null };
        success(f.exit(0));
        return { silent: true };
    });
    const faultCases = [
        ['assertStartupConfig', 1], ['environment', 1], ['dataDir', 1], ['join', 1], ['existsSync', 1],
        ['readFileSync', 1, 'seedPid'], ['dirname', 1], ['mkdirSync', 1], ['pid', 1], ['writeFileSync', 1],
        ['chmodSync', 1], ['dcrDir', 1], ['existsSync', 2], ['readdirSync', 1, 'seedClients'],
        ['rmSync', 2, 'seedTwoClients'], ['warnings', 1], ['warn', 2, 'twoWarnings'], ['once', 1],
    ];
    for (const [name, nth, setup] of faultCases) {
        await test('resource-failure-' + name + '-' + nth, f => {
            if (setup === 'seedPid')
                f.seedPid(String(f.pid));
            if (setup === 'seedClients')
                f.seedClients([]);
            if (setup === 'seedTwoClients')
                f.seedClients(['_oauth_clients.json.aaaaaaaa.tmp', '_oauth_clients.json.bbbbbbbb.tmp']);
            if (setup === 'twoWarnings')
                f.warnings = ['first', 'second'];
            fault(f, name, nth);
            const result = f.start();
            strict_1.default.equal(result.thrown.same_fault, true);
            strict_1.default.equal(f.handlers.length, 0);
            return result;
        });
    }
    await test('refusal-formatting-failure-propagates', f => {
        f.seedPid('424242');
        f.killHandler = () => true;
        fault(f, 'dirname');
        const result = f.start();
        strict_1.default.equal(result.thrown.same_fault, true);
        strict_1.default.equal(f.counts.writeFileSync ?? 0, 0);
        return result;
    });
    if (bindingProbe)
        await test('binding-captures-handles-and-reads-current-environment', f => {
            const names = Object.keys(f.ports);
            for (const name of names)
                f.ports[name] = () => { throw new Error('Rebound resource must not be used: ' + name); };
            f.env = { NEXT_PHASE: 'phase-production-build' };
            success(f.start());
            f.env = {};
            f.warnings = ['bound warning'];
            f.seedClients(['_oauth_clients.json.01234567.tmp']);
            f.seedPid('424242');
            f.killHandler = () => { throw errno('ESRCH'); };
            success(f.start());
            f.ownPid();
            success(f.exit(0));
            (0, strict_1.default)(names.every(name => (f.counts[name] ?? 0) > 0));
            (0, strict_1.default)(!node_fs_1.default.existsSync(f.pidFile()));
            return { captured_resource_functions: names.length, current_environment_reads: f.counts.environment,
                every_original_resource_exercised: true };
        });
    strict_1.default.equal(new Set(cases.map(item => item.case_id)).size, cases.length);
    if (selected)
        strict_1.default.deepEqual(new Set(cases.map(item => item.case_id)), selected, 'Unknown selected case');
    return cases;
}


function generatedBinding(root,surface){
  const entry=candidateEntry(root,surface);
  return async resources=>{
    const effects=[];
    const refused=name=>{effects.push(name);throw new Error('Undeclared ambient resource: '+name);};
    const context=vm.createContext({__denyStartupEffect:refused});
    // Functional conformance controls. The VM is not a security sandbox.
    vm.runInContext(
      "Math.random=()=>__denyStartupEffect('Math.random');"+
      "Date=new Proxy(Date,{apply(){return __denyStartupEffect('Date');},construct(){return __denyStartupEffect('new Date');},get(target,key){return key==='now'?()=>__denyStartupEffect('Date.now'):Reflect.get(target,key);}});"+
      "for(const label of ['process','console','performance']){"+
        "const denied=new Proxy({}, {get(_target,key){return __denyStartupEffect(label+'.'+String(key));},set(){return __denyStartupEffect(label+' mutation');}});"+
        "Object.defineProperty(globalThis,label,{configurable:false,get(){return denied;},set(){return __denyStartupEffect(label+' assignment');}});"+
      "}"+
      "for(const label of ['setTimeout','setInterval','setImmediate','queueMicrotask','fetch','WebSocket'])globalThis[label]=()=>__denyStartupEffect(label);",
      context);
    const check=()=>assert.deepEqual(effects,[],'Undeclared ambient effect');
    const originalOnce=resources.once;
    resources.once=(event,callback)=>originalOnce(event,(...args)=>{
      try{return callback(...args);}finally{check();}
    });
    const factory=await candidateLoader(root,entry,context,refused)();check();
    const api=factory(resources);check();
    assert(api&&typeof api==='object'&&typeof api.then!=='function','Factory must return its API synchronously');
    assert.deepEqual(Object.keys(api),['startup']);
    assert.equal(typeof api.startup,'function');assert.equal(api.startup.name,'startup');assert.equal(api.startup.length,0);
    return {startup:new Proxy(api.startup,{apply(target,receiver,args){
      try{return Reflect.apply(target,receiver,args);}finally{check();}
    }})};
  };
}
async function runSelected(root,surface,selected){
  const groups=selected.map(item=>{
    assert.equal(item.capability,CAPABILITY);
    assert(Array.isArray(item.arguments)&&item.arguments.length===1);
    const indices=Array.isArray(item.arguments[0])?item.arguments[0]:[item.arguments[0]];
    assert(indices.length>0&&indices.length<=2,'Private verifier batch size');
    return indices.map(index=>{
      assert(Number.isSafeInteger(index)&&index>=0&&index<CASE_IDS.length,'Private verifier selector');
      return CASE_IDS[index];
    });
  });
  const ids=groups.flat();assert.equal(new Set(ids).size,ids.length,'Duplicate verifier case');
  const observed=await observeStartup(generatedBinding(root,surface),{caseIds:ids,bindingProbe:true});
  assert.equal(observed.length,ids.length);
  const byId=new Map(observed.map(item=>[item.case_id,item.result]));
  const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'
    ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
  const digest=id=>({sha256:hash(JSON.stringify(ordered({case_id:id,result:byId.get(id)})))});
  return selected.map((item,index)=>({case_id:item.case_id,capability:CAPABILITY,
    result:Array.isArray(item.arguments[0])?{observations:groups[index].map(digest)}:digest(groups[index][0])}));
}
async function main(){
  const argv=process.argv.slice(2);assert.equal(argv.length,3);
  const root=path.resolve(argv[0]),surface=JSON.parse(argv[1]),selected=JSON.parse(argv[2]);
  assert(Array.isArray(selected)&&selected.length>0&&selected.length<=CASE_IDS.length);
  const cases=await runSelected(root,surface,selected);
  process.stdout.write(JSON.stringify({schema:'literate-ai/library-acceptance-results@1',cases})+'\n');
}
module.exports={CAPABILITY,CASE_IDS,observeStartup,generatedBinding,runSelected,main};
if(require.main===module){
  if(typeof vm.SourceTextModule!=='function'){
    const child=cp.spawnSync(process.execPath,['--no-warnings','--experimental-vm-modules',__filename,...process.argv.slice(2)],
      {stdio:'inherit',timeout:900000});
    if(child.error)throw child.error;process.exit(child.status??1);
  }
  main().catch(error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;});
}
