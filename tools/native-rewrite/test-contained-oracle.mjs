// Integration controls for host containment. Probes touch only newly owned public canaries.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(os.homedir(), '.cache', 'align-native-oracles');
fs.mkdirSync(cache, {recursive: true, mode: 0o700});
const temporary = fs.mkdtempSync(path.join(cache, 'controls-'));
const environmentKey = 'ALIGN_EVALUATOR_OWNED_PUBLIC_CANARY';
assert(!Object.hasOwn(process.env, environmentKey));
const canary = 'public-contained-control-' + crypto.randomUUID();
const outside = path.join(temporary, 'outside-canary.txt');
fs.writeFileSync(outside, canary, {mode: 0o600});
process.env[environmentKey] = canary;
const results = [];
try {
  for (const component of ['server-workspace-admin-routes', 'server-goals-deliberation-routes']) {
    const packageName = component.replaceAll('-', '_');
    const source = path.join(root, 'generated/native-review-source', packageName);
    const packageFiles = fs.readdirSync(source).sort();
    const module = packageFiles.find(name => name.endsWith('.js'));
    assert(module && packageFiles.length === 2);
    const oraclePath = path.join(root, '.literate/native-projects/local-' + component,
      'verification/acceptance', component + '.json');
    const oracle = JSON.parse(fs.readFileSync(oraclePath));
    const harness = path.join(path.dirname(oraclePath), oracle.harness);
    assert(oracle.harness.endsWith('-contained-v1.cjs'), 'Current oracle must use containment');
    assert.equal('sha256:' + crypto.createHash('sha256').update(fs.readFileSync(harness)).digest('hex'),
      oracle.harness_identity, 'Current oracle verifier identity');
    const selected = oracle.cases.map(({case_id, capability, arguments: args}) =>
      ({case_id, capability, arguments: args}));
    const run = (candidate, cases, env = process.env) => cp.spawnSync(process.execPath,
      [harness, candidate, 'null', JSON.stringify(cases)], {encoding: 'utf8', env,
        timeout: 150000, maxBuffer: 4 * 1024 * 1024});
    const originalUmask = process.umask(0o077);
    let positive;
    try { positive = run(path.join(root, 'generated/native-review-source'), selected); }
    finally { process.umask(originalUmask); }
    assert.equal(positive.status, 0, positive.stderr);
    assert.deepEqual(JSON.parse(positive.stdout).cases.map(item => item.result),
      oracle.cases.map(item => item.expected_result));

    const candidate = path.join(temporary, component, packageName);
    fs.mkdirSync(candidate, {recursive: true});
    fs.copyFileSync(path.join(source, 'package.json'), path.join(candidate, 'package.json'));
    const symbol = path.basename(module, '.js');
    const payload = `'use strict';
function ${symbol}(resources) {
  const processes=[require.constructor('return process')(),
    module.constructor.constructor('return process')(),resources.http.route.constructor('return process')()];
  const p=processes[0], fs=p.getBuiltinModule('node:fs');
  function attempt(action){try{action();return 'unexpected-success';}catch(error){return error.code;}}
  const observed={environment:processes.map(p=>p.env[${JSON.stringify(environmentKey)}]??null),
    outside:attempt(()=>fs.readFileSync(${JSON.stringify(outside)},'utf8')),
    write:attempt(()=>fs.writeFileSync('/inputs/source/${packageName}/${module}','owned-public-probe')),
    dockerSocket:attempt(()=>fs.statSync('/var/run/docker.sock')),uid:p.getuid()};
  p.stderr.write('ALIGN_PUBLIC_CONTAINMENT_PROBE='+JSON.stringify(observed)+'\\n');
  throw Error('Owned public containment probe');
}
module.exports={${symbol}};
`;
    fs.writeFileSync(path.join(candidate, module), payload);
    const malicious = run(path.dirname(candidate), selected.slice(0, 1));
    assert.notEqual(malicious.status, 0);
    const probe = malicious.stderr.match(/ALIGN_PUBLIC_CONTAINMENT_PROBE=(\{[^\n]*\})/);
    assert(probe, malicious.stderr);
    const observed = JSON.parse(probe[1]);
    assert.deepEqual(observed.environment, [null, null, null]);
    assert(['ENOENT', 'EACCES'].includes(observed.outside));
    assert.equal(observed.write, 'EROFS');
    assert.equal(observed.dockerSocket, 'ENOENT');
    assert.equal(observed.uid, 65532);
    assert.equal(fs.readFileSync(outside, 'utf8'), canary);
    assert.equal(fs.readFileSync(path.join(candidate, module), 'utf8'), payload);
    const unavailable = run(path.join(root, 'generated/native-review-source'), selected.slice(0, 1),
      {...process.env, PATH: ''});
    assert.notEqual(unavailable.status, 0);
    assert(unavailable.stderr.includes('ENOENT'));
    fs.unlinkSync(path.join(candidate, module));
    fs.symlinkSync(outside, path.join(candidate, module));
    const symlink = run(path.dirname(candidate), selected.slice(0, 1));
    assert.notEqual(symlink.status, 0);
    assert(!symlink.stdout.includes(canary));
    results.push({component, historical_cases: selected.length, public_canary_probes: observed,
      unavailable_runtime_fails_closed: true, symlink_candidate_refused: true});
  }
  console.log(JSON.stringify({passed: true, results, host_private_data_read: false,
    containment_scope: 'Independent oracle execution; historical qualification and generated build execution remain separate.'}));
} finally {
  delete process.env[environmentKey];
  fs.rmSync(temporary, {recursive: true, force: true});
}
