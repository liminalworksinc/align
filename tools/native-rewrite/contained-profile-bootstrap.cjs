'use strict';
// Readable qualification command bootstrap. Candidate code never runs in this host process.
// Load this hash-pinned file through the profile's existing short relative-file loader.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const image = 'node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9';
async function main(args, repositoryRoot) {
const [driver, driverHash, mode, manifestPath, manifestHash, ...rest] = args;
assert(['build', 'source', 'generated'].includes(mode));
assert.equal(rest.length, mode === 'build' ? 0 : mode === 'source' ? 3 : 1);
const repository = fs.realpathSync(repositoryRoot);
const work = fs.realpathSync(process.cwd());
const cache = path.join(os.homedir(), '.cache', 'align-native-oracles');
fs.mkdirSync(cache, {recursive: true, mode: 0o700});
const snapshot = fs.mkdtempSync(path.join(fs.realpathSync(cache), 'qualification-'));
const name = 'align-qualification-' + crypto.randomUUID();
const dockerEnvironment = {...process.env};
delete dockerEnvironment.NODE_OPTIONS;
delete dockerEnvironment.NODE_PATH;
let started = false;
let total = 0;
const copied = new Set();
function relativeParts(relative) {
  assert(typeof relative === 'string' && !path.isAbsolute(relative));
  const parts = relative.split('/');
  assert(parts.length > 0 && parts.every(part =>
    (/^[A-Za-z0-9_.-]+$/.test(part) || /^\[(?:\.\.\.)?[A-Za-z0-9_]+\]$/.test(part)) &&
    part !== '.' && part !== '..'));
  return parts;
}
function read(root, relative, digest) {
  const parts = relativeParts(relative);
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    assert(stat.isDirectory() && !stat.isSymbolicLink(), 'Unsafe input directory');
  }
  const descriptor = fs.openSync(path.join(current, parts.at(-1)), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(descriptor);
    assert(stat.isFile() && stat.size <= 8 * 1024 * 1024, 'Unsafe input file');
    const bytes = fs.readFileSync(descriptor);
    if (digest !== undefined) {
      assert(/^[a-f0-9]{64}$/.test(digest));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), digest, 'Private input drift');
    }
    return bytes;
  } finally { fs.closeSync(descriptor); }
}
function put(relative, bytes) {
  const parts = relativeParts(relative);
  assert(!copied.has(relative), 'Duplicate input snapshot path');
  copied.add(relative);
  assert(copied.size <= 256);
  total += bytes.length;
  assert(total <= 32 * 1024 * 1024, 'Input snapshot exceeds bound');
  let parent = snapshot;
  for (const part of parts.slice(0, -1)) {
    parent = path.join(parent, part);
    fs.mkdirSync(parent, {recursive: true, mode: 0o755});
    fs.chmodSync(parent, 0o755);
  }
  const file = path.join(snapshot, ...parts);
  fs.writeFileSync(file, bytes, {flag: 'wx', mode: 0o444});
  fs.chmodSync(file, 0o444);
}
try {
  assert(!/[\r\n,]/.test(snapshot));
  put('repo/' + driver, read(repository, driver, driverHash));
  const manifestBytes = read(repository, manifestPath, manifestHash);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.schema, 'align/readable-private-qualification@1');
  assert(Array.isArray(manifest.files) && manifest.files.length < 200);
  put('repo/' + manifestPath, manifestBytes);
  for (const item of manifest.files) {
    const bytes = read(repository, item.path, item.sha256);
    assert.equal(bytes.length, item.size);
    put('repo/' + item.path, bytes);
  }
  if (mode === 'source') {
    const referenceBytes = read(repository, rest[0], rest[1]);
    const references = JSON.parse(referenceBytes);
    assert.equal(references.schema, 'align/private-original-reference@1');
    assert(Array.isArray(references.factories) && references.factories.length <= 32);
    assert(Array.isArray(references.raw_sources) && references.raw_sources.length <= 64);
    put('repo/' + rest[0], referenceBytes);
    for (const item of references.factories) put('repo/' + item.path, read(repository, item.path, item.sha256));
    for (const item of references.raw_sources) put('work/' + item.path, read(work, item.path, item.sha256));
  } else {
    relativeParts(manifest.package);
    assert(!manifest.package.includes('/'));
    assert(Array.isArray(manifest.package_files) && manifest.package_files.length <= 64);
    const candidates = [manifest.package, 'source/' + manifest.package]
      .filter(relative => fs.existsSync(path.join(work, relative)));
    assert.equal(candidates.length, 1, 'Expected one generated package');
    const packageRoot = candidates[0];
    let directory = work;
    for (const part of relativeParts(packageRoot)) {
      directory = path.join(directory, part);
      const stat = fs.lstatSync(directory);
      assert(stat.isDirectory() && !stat.isSymbolicLink(), 'Unsafe candidate directory');
    }
    assert.deepEqual(fs.readdirSync(path.join(work, packageRoot)).sort(), [...manifest.package_files].sort());
    for (const member of manifest.package_files) {
      assert(relativeParts(member).length === 1);
      put('work/' + packageRoot + '/' + member, read(work, packageRoot + '/' + member));
    }
  }
  put('request.json', Buffer.from(JSON.stringify({driver, args: [mode, manifestPath, manifestHash, ...rest]})));
  put('execute.cjs', Buffer.from([
    "'use strict';",
    "const request=require('./request.json');",
    "require('/inputs/repo/'+request.driver).main(request.args,'/inputs/repo')",
    ".catch(error=>{console.error(error.stack);process.exitCode=1;});",
  ].join('\n')));
  fs.chmodSync(snapshot, 0o755);
  started = true;
  const result = cp.spawnSync('docker', ['run', '--rm', '--name', name, '--pull=never',
    '--network=none', '--read-only', '--user=65532:65532', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--pids-limit=64', '--memory=768m', '--cpus=2',
    '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=128m', '--env=HOME=/tmp',
    '--env=ALIGN_NATIVE_QUAL_REPOSITORY=/inputs/repo',
    '--mount', 'type=bind,source=' + snapshot + ',target=/inputs,readonly',
    '--workdir=/inputs/work', '--entrypoint=/usr/bin/timeout', image,
    '--signal=KILL', '50s', 'node', '--no-warnings',
    '--max-old-space-size=512', '/inputs/execute.cjs'], {
      env: dockerEnvironment, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024});
  if (result.error || result.status !== 0) {
    throw Error('Contained qualification command failed: ' + (result.error?.code || result.status) + '\n' +
      String(result.stderr || '').slice(0, 1600));
  }
  assert(result.stdout.length > 0);
  JSON.parse(result.stdout);
  process.stdout.write(result.stdout);
} finally {
  if (started) cp.spawnSync('docker', ['rm', '--force', name], {
    env: dockerEnvironment, stdio: 'ignore', timeout: 10000});
  fs.rmSync(snapshot, {recursive: true, force: true});
}
}
module.exports = {main};
