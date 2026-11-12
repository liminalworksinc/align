'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"bef15c3881bfa93a82f92b8209d7607767cb18a8710e1508e260489ec7a5dffd","package":"server_workspace_admin_routes","package_files":["create_workspace_admin_routes.js","package.json"],"maximum_cases":3,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9"};

function historicalVerifier() {'use strict';
// Independent private test code, in readable source. The original route implementations are excluded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modules = Object.create(null);
const loaded = new Map();

// Private verifier module: /__private__/server-workspace-admin-routes/driver.cjs
modules["/__private__/server-workspace-admin-routes/driver.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
// Private verifier. Original implementations are loaded only in source mode.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const cp = require('node:child_process');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function relativeFile(root, relative, routeSegments = false) {
  assert.equal(typeof relative, 'string');
  assert(!path.isAbsolute(relative) && !relative.includes('\\') && !relative.includes(':'));
  const parts = relative.split('/');
  assert(parts.every(part => (/^[A-Za-z0-9_.-]+$/.test(part) || (routeSegments && /^\[(?:\.\.\.)?[A-Za-z0-9_]+\]$/.test(part))) && part !== '.' && part !== '..'));
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const stat = fs.lstatSync(current);
    assert(!stat.isSymbolicLink(), 'Private verifier input must not be a symlink');
    assert(i === parts.length - 1 ? stat.isFile() : stat.isDirectory());
  }
  return current;
}
function pinned(root, relative, hash, routeSegments = false) {
  const file = relativeFile(root, relative, routeSegments);
  const bytes = fs.readFileSync(file);
  assert(bytes.length <= 8 * 1024 * 1024);
  assert.equal(digest(bytes), hash, 'Private input changed: ' + relative);
  return {file, bytes};
}
function prepare(root, relative, hash) {
  const input = pinned(root, relative, hash);
  const manifest = JSON.parse(input.bytes);
  assert.equal(manifest.schema, 'align/readable-private-qualification@1');
  const files = new Map();
  for (const item of manifest.files) {
    assert(!files.has(item.name));
    const loaded = pinned(root, item.path, item.sha256);
    assert.equal(loaded.bytes.length, item.size);
    files.set(item.name, loaded);
  }
  return {manifest, files};
}
function candidatePackage(root, manifest) {
  const matches = [path.join(root, manifest.package), path.join(root, 'source', manifest.package)].filter(file => fs.existsSync(file));
  assert.equal(matches.length, 1, 'Expected exactly one generated package');
  const directory = matches[0];
  assert(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink());
  assert.deepEqual(fs.readdirSync(directory).sort(), [...manifest.package_files].sort());
  for (const name of manifest.package_files) relativeFile(directory, name);
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
  assert.equal(metadata.name, manifest.package);
  assert.equal(metadata.type, 'commonjs');
  assert.deepEqual(metadata.exports, manifest.package_exports);
  return directory;
}
function factoryFromBytes(bytes, symbol) {
  const blocked = () => { throw Error('Forbidden ambient generated effect'); };
  const context = vm.createContext({Date: blocked, process: new Proxy({}, {get: blocked}), console: new Proxy({}, {get: blocked}), fetch: blocked, setInterval: blocked, setTimeout: blocked, Buffer: undefined}, {codeGeneration: {strings: false, wasm: false}});
  new vm.Script('Math.random=()=>{throw Error("Forbidden ambient randomness")};').runInContext(context, {timeout: 1000});
  const module = {exports: {}};
  new vm.Script('(function(exports,module,require){"use strict";\n' + bytes.toString('utf8') + '\n})', {filename: symbol + '.js'}).runInContext(context, {timeout: 1000})(module.exports, module, blocked);
  assert.deepEqual(Object.keys(module.exports), [symbol]);
  const factory = module.exports[symbol];
  assert.equal(typeof factory, 'function');
  assert.equal(factory.name, symbol);
  assert.equal(factory.length, 1);
  assert.equal(factory.constructor.name, 'Function');
  return factory;
}
function corpus(capability, files) {
  const get = name => {
    assert(files.has(name), 'Undeclared private corpus input');
    return require(files.get(name).file);
  };
  const fixture = get(capability.fixture);
  const characterization = get(capability.characterization);
  const semantic = capability.cases ? get(capability.cases).semanticBatches() : [fixture.semanticCases()];
  const properties = [], effects = [];
  for (const entry of characterization.fault_paths) {
    let settings = entry.settings;
    if (capability.fault_settings_codec === 'semantic-label@1') {
      const matches = semantic.flat().filter(item => item.operation === entry.operation && item.settings.label === entry.settings.label);
      assert.equal(matches.length, 1, 'Fault settings require one immutable semantic case');
      assert.deepEqual(JSON.parse(JSON.stringify(matches[0].settings)), entry.settings);
      settings = matches[0].settings;
    }
    for (let propertyFault = 1; propertyFault <= entry.reads; propertyFault++) properties.push(capability.runner ? {...settings, propertyFault} : {operation: entry.operation, settings: {...settings, propertyFault}});
    for (let effectFault = 1; effectFault <= entry.effects; effectFault++) effects.push(capability.runner ? {...settings, effectFault} : {operation: entry.operation, settings: {...settings, effectFault}});
  }
  for (let captureFault = 1; captureFault <= capability.resource_count; captureFault++) effects.push(capability.runner ? {captureFault} : {operation: capability.default_operation, settings: {captureFault}});
  semantic.push(properties, effects);
  assert.deepEqual(semantic.map(entries => entries.length), characterization.batches.map(item => item.records));
  return {fixture, batches: semantic, characterization};
}
function withPublicConstants(factory, constants) {
  return resources => {
    const api = factory(resources);
    for (const name of ['LOI_EVENTS', 'FUNNEL', 'WAW_WEEKS']) {
      assert.deepEqual(JSON.parse(JSON.stringify(api[name])), constants[name]);
      if (name !== 'WAW_WEEKS') {
        assert.strictEqual(api[name], api[name]);
        assert(!Object.isFrozen(api[name]));
      }
    }
    return api;
  };
}
async function runBatch(factory, capability, batch, files) {
  const {fixture, batches, characterization} = corpus(capability, files);
  assert(Number.isSafeInteger(batch) && batch >= 0 && batch < batches.length);
  if (capability.constant_data) {
    const constants = JSON.parse(files.get(capability.constant_data).bytes).constants;
    factory = withPublicConstants(factory, constants);
  }
  const hash = crypto.createHash('sha256');
  for (const entry of batches[batch]) {
    const value = capability.runner ? await fixture.fixture(entry).run(factory) : await fixture.fixture(entry.settings).run(factory, entry.operation);
    hash.update(JSON.stringify(value) + '\n');
  }
  const actual = {batch, records: batches[batch].length, sha256: hash.digest('hex')};
  assert.deepEqual(actual, characterization.batches[batch], 'Frozen original observations differ');
  return actual;
}
async function main(args, repository) {
  const [mode, manifestPath, manifestHash, ...rest] = args;
  assert(['build','source','generated'].includes(mode));
  const {manifest, files} = prepare(repository, manifestPath, manifestHash);
  if (mode === 'build') {
    assert.equal(rest.length, 0);
    const directory = candidatePackage(process.cwd(), manifest);
    for (const name of manifest.package_files.filter(file => file.endsWith('.js'))) {
      const result = cp.spawnSync(process.execPath, ['--check', path.join(directory, name)], {encoding: 'utf8', timeout: 30000});
      assert.equal(result.status, 0, result.stderr);
    }
    console.log(JSON.stringify({schema: 'align/readable-private-package-build@1', passed: true, files: manifest.package_files.length}));
    return;
  }
  const expected = mode === 'source' ? 3 : 1;
  assert.equal(rest.length, expected);
  const [index] = JSON.parse(rest.at(-1));
  assert(Number.isSafeInteger(index) && index >= 0 && index < manifest.plans.length);
  const plan = manifest.plans[index];
  const capability = manifest.capabilities.find(item => item.id === plan.capability);
  assert(capability);
  let bytes;
  if (mode === 'source') {
    const references = JSON.parse(pinned(repository, rest[0], rest[1]).bytes);
    assert.equal(references.schema, 'align/private-original-reference@1');
    const record = references.factories.find(item => item.symbol === capability.symbol);
    assert(record);
    for (const source of references.raw_sources) pinned(process.cwd(), source.path, source.sha256, true);
    bytes = pinned(repository, record.path, record.sha256).bytes;
  } else {
    const directory = candidatePackage(process.cwd(), manifest);
    bytes = fs.readFileSync(path.join(directory, capability.module));
  }
  const factory = factoryFromBytes(bytes, capability.symbol);
  const value = await runBatch(factory, capability, plan.batch, files);
  assert.deepEqual(value, plan.expected_result);
  console.log(JSON.stringify(value));
}
module.exports = {main, prepare, candidatePackage, factoryFromBytes, runBatch};

};

// Private verifier module: /__private__/server-workspace-admin-routes/fixture.cjs
modules["/__private__/server-workspace-admin-routes/fixture.cjs"] = function(require,module,exports,__filename,__dirname) {
"use strict";
const assert = require("node:assert/strict");
const imports = {
  "@/lib/v2/http": {
    "resource": "http",
    "members": [
      "idParam",
      "noContent",
      "readJson",
      "requireRecentSignIn",
      "route",
      "webAuth",
      "webWrite"
    ]
  },
  "@/lib/v2/policy": {
    "resource": "policy",
    "members": [
      "POD_ROLES",
      "WS_ROLES"
    ]
  },
  "@/lib/v2/sample": {
    "resource": "sample",
    "members": [
      "createSampleWorkspace"
    ]
  },
  "@/lib/v2/validate": {
    "resource": "validate",
    "members": [
      "ID_RE",
      "oneLine",
      "oneOf",
      "optOneOf",
      "optStr",
      "str"
    ]
  },
  "@/lib/v2/workspaces": {
    "resource": "workspaces",
    "members": [
      "auditTrail",
      "createInvite",
      "createTeam",
      "createWorkspace",
      "deleteInvite",
      "deleteWorkspace",
      "deletedWorkspaceOwnedBy",
      "deletedWorkspacesFor",
      "enter",
      "listInvites",
      "removeMember",
      "removeTeamMember",
      "restoreWorkspace",
      "setMemberRole",
      "setTeamMember",
      "updateWorkspace",
      "workspaceDetail",
      "workspacesFor"
    ]
  }
};
const methodKeys = {
  "workspaces/[ws]/audit": [
    "GET"
  ],
  "workspaces/[ws]/invites/[id]": [
    "DELETE"
  ],
  "workspaces/[ws]/invites": [
    "GET",
    "POST"
  ],
  "workspaces/[ws]/members/[user]": [
    "DELETE",
    "POST"
  ],
  "workspaces/[ws]/restore": [
    "POST"
  ],
  "workspaces/[ws]": [
    "DELETE",
    "GET",
    "PATCH"
  ],
  "workspaces/[ws]/teams/[team]/members/[user]": [
    "DELETE"
  ],
  "workspaces/[ws]/teams/[team]/members": [
    "POST"
  ],
  "workspaces/[ws]/teams": [
    "POST"
  ],
  "workspaces": [
    "GET",
    "POST"
  ],
  "workspaces/sample": [
    "POST"
  ]
};
const jsonValue = value=>JSON.parse(JSON.stringify(value));
const hosts = {
  "lib/errors.ts": {
    "imports": [],
    "code": "\"use strict\";\nObject.defineProperty(exports, \"__esModule\", { value: true });\nexports.HttpError = void 0;\nclass HttpError extends Error {\n    status;\n    code;\n    /** `code` is sent in the JSON body only when set, so every existing error body stays exactly as it was. */\n    constructor(status, message, code) {\n        super(message);\n        this.status = status;\n        this.code = code;\n    }\n}\nexports.HttpError = HttpError;\n"
  },
  "lib/v2/errors.ts": {
    "imports": [],
    "code": "\"use strict\";\nObject.defineProperty(exports, \"__esModule\", { value: true });\nexports.conflict = exports.forbidden = exports.badRequest = exports.notFound = exports.V2Error = void 0;\n/** A v2 error: `{ \"error\": \"<code>\", \"message\": \"<human text>\" }` with this HTTP status (docs/v2/WIRE.md), plus any\n *  `extra` fields a route documents (such as `server_time` on `clock_skew`). */\nclass V2Error extends Error {\n    status;\n    code;\n    extra;\n    constructor(status, code, message, extra) {\n        super(message ?? code);\n        this.status = status;\n        this.code = code;\n        this.extra = extra;\n    }\n}\nexports.V2Error = V2Error;\nconst notFound = () => new V2Error(404, \"not_found\", \"Not found\");\nexports.notFound = notFound;\nconst badRequest = (message, code = \"bad_request\") => new V2Error(400, code, message);\nexports.badRequest = badRequest;\nconst forbidden = (code, message) => new V2Error(403, code, message);\nexports.forbidden = forbidden;\nconst conflict = (code, message) => new V2Error(409, code, message);\nexports.conflict = conflict;\n"
  },
  "lib/v2/text-core.mts": {
    "imports": [],
    "code": "\"use strict\";\n// The invisible characters people's text never keeps (W3; E2E-WEB cycle 13 W3, cycle 14 C14-1): one rule for one-line names\n// (lib/v2/validate.ts cleanName) and for free text (reasons, notes, conditions, titles), so text that renders as nothing\n// is never recorded as if something were written. Plain module (no imports), so client components can load it and\n// their forms stop such text before it is sent.\nObject.defineProperty(exports, \"__esModule\", { value: true });\nexports.isBlankText = exports.cleanProse = exports.dropControls = exports.BLANK_FILLERS = void 0;\nexports.dropInvisible = dropInvisible;\n/** Invisible format characters (category Cf: bidirectional marks, embeddings, overrides and isolates, the Arabic letter\n *  mark, zero-width spaces, the zero-width non-joiner, word joiners, invisible operators, the byte order mark, the\n *  Mongolian vowel separator, soft hyphens) and lone surrogates (Cs), by Unicode property rather than a list. */\nconst INVISIBLE = /[\\p{Cf}\\p{Cs}]/gu;\n/** The only Cf characters kept are those an emoji is made of (E2E-WEB cycle 8 W5): a zero-width joiner between two\n *  pictographs (`👩‍💻`), and the tag characters of a tag sequence after one (U+E0020 to U+E007E ended by U+E007F, a\n *  subdivision flag such as Scotland's). */\nconst EMOJI_ZWJ = /(?<=\\p{Extended_Pictographic}[︎️\\u{1F3FB}-\\u{1F3FF}]?)‍(?=\\p{Extended_Pictographic})/gu;\nconst EMOJI_TAGS = /(?<=\\p{Extended_Pictographic}️?)[\\u{E0020}-\\u{E007E}]+\\u{E007F}/gu;\n/** Blank fillers that render as nothing: the Hangul fillers U+115F, U+1160, U+3164, U+FFA0 and the Braille blank U+2800. */\nexports.BLANK_FILLERS = \"ᅟᅠㅤﾠ⠀\";\nconst FILLER = new RegExp(`[${exports.BLANK_FILLERS}]`, \"g\");\n/** Control characters (category Cc: C0, DEL, C1) other than the tab and the line feed: they draw nothing, or a box\n *  (E2E-WEB cycle 14 C14-1). A carriage return ends a line, so CR LF and a lone CR are first made one line feed. */\nconst CONTROL = /[\\u0000-\\u0008\\u000B-\\u001F\\u007F-\\u009F]/g;\n/** `v` with its control characters dropped but tabs and line breaks (as line feeds); a one-line field makes those\n *  spaces itself. */\nconst dropControls = (v) => v.replace(/\\r\\n?/g, \"\\n\").replace(CONTROL, \"\");\nexports.dropControls = dropControls;\n/** `v` with its control characters (`dropControls`), invisible format characters and lone surrogates dropped, keeping\n *  emoji sequences whole. */\nfunction dropInvisible(v) {\n    const t = (0, exports.dropControls)(v);\n    const keep = new Set();\n    for (const m of t.matchAll(EMOJI_ZWJ))\n        keep.add(m.index);\n    for (const m of t.matchAll(EMOJI_TAGS))\n        for (let i = 0; i < m[0].length; i++)\n            keep.add(m.index + i);\n    return t.replace(INVISIBLE, (c, at) => (keep.has(at) ? c : \"\"));\n}\n/** People's free text (a reason, note, condition or title), cleaned as a name is but keeping its line breaks: control\n *  characters (but tabs and line breaks), invisible format characters dropped (emoji kept whole), blank fillers made\n *  spaces, the ends trimmed. */\nconst cleanProse = (v) => dropInvisible(v).replace(FILLER, \" \").trim();\nexports.cleanProse = cleanProse;\n/** Combining marks and spaces: text of only these (a variation selector such as U+FE0F, the combining grapheme joiner\n *  U+034F, an accent with no letter under it) renders as nothing (E2E-AGENT cycle 12, section 6). */\nconst MARKS_AND_SPACES = /[\\p{M}\\s]+/gu;\n/** Whether `v`, once cleaned, has nothing a person can read: empty, or only spaces, control and invisible characters,\n *  blank fillers and combining marks. A required field holding such text is missing, and every web form's blank check\n *  is this one (E2E-WEB cycle 14 C14-2), so a form never sends what the server would refuse as missing. */\nconst isBlankText = (v) => !(0, exports.cleanProse)(v).replace(MARKS_AND_SPACES, \"\");\nexports.isBlankText = isBlankText;\n"
  },
  "lib/v2/validate.ts": {
    "imports": [
      "./errors",
      "./text-core.mts"
    ],
    "code": "\"use strict\";\nObject.defineProperty(exports, \"__esModule\", { value: true });\nexports.SESSION_KEY_RE = exports.ID_RE = exports.B64URL = exports.NO_REVISION = exports.NAME_PARTS_PER_CHAR = exports.NAME_MARKS_PER_CHAR = exports.charCount = void 0;\nexports.str = str;\nexports.cleanName = cleanName;\nexports.oneLine = oneLine;\nexports.optStr = optStr;\nexports.oneOf = oneOf;\nexports.optOneOf = optOneOf;\nexports.nonNegInt = nonNegInt;\nexports.revisionRead = revisionRead;\nexports.assertRevisionReached = assertRevisionReached;\nexports.optInt = optInt;\nexports.iso = iso;\nexports.optIso = optIso;\nexports.b64url = b64url;\nexports.strList = strList;\nconst errors_1 = require(\"./errors\");\nconst text_core_mts_1 = require(\"./text-core.mts\");\n/** A string field, cleaned as people's text is (`cleanProse`: invisible characters dropped, blank fillers made spaces,\n *  trimmed; line breaks kept), so a reason, note, condition or title of only invisible characters or marks is missing\n *  (400 \"<k> is required\"), never recorded as empty text (E2E-WEB cycle 13 W3). */\nfunction str(b, k, max = 300, { min = 1 } = {}) {\n    const v = b[k];\n    if (typeof v !== \"string\")\n        throw (0, errors_1.badRequest)(`${k} must be a string`);\n    const t = (0, text_core_mts_1.cleanProse)(v);\n    if (t.length < min || (min > 0 && (0, text_core_mts_1.isBlankText)(t)))\n        throw (0, errors_1.badRequest)(`${k} is required`);\n    if (t.length > max)\n        throw (0, errors_1.badRequest)(`${k} is too long (max ${max} characters)`);\n    return t;\n}\nconst CONTROL_CHAR = /\\p{Cc}/gu;\n/** Characters a one-line name never keeps (W3): controls (category Cc: C0, DEL, C1), Unicode line and paragraph\n *  separators and the blank fillers that render as nothing (lib/v2/text-core.mts) become a space, as runs of whitespace\n *  do; invisible format characters and lone surrogates are dropped as in all people's text (`dropInvisible`, which keeps\n *  emoji sequences whole), so a name reads the same wherever it is shown. */\nconst NAME_SPACE = new RegExp(`[\\\\p{Cc}\\\\s\\\\u2028\\\\u2029${text_core_mts_1.BLANK_FILLERS}]+`, \"gu\");\n/** `v` with the characters a one-line name never keeps dropped (or made spaces), keeping emoji sequences whole. Its\n *  control characters become spaces before `dropInvisible`, which would drop them. */\nfunction cleanName(v) {\n    return (0, text_core_mts_1.dropInvisible)(v.replace(CONTROL_CHAR, \" \")).replace(NAME_SPACE, \" \");\n}\nconst graphemes = new Intl.Segmenter(undefined, { granularity: \"grapheme\" });\n/** How many characters a person reads in `v` (grapheme clusters: `👩‍💻` and a flag are one each). */\nconst charCount = (v) => [...graphemes.segment(v)].length;\nexports.charCount = charCount;\n/** Combining marks one character of a one-line name may carry: enough for any script's real clusters (Vietnamese stacks\n *  two, Devanagari and Tibetan clusters up to five, an emoji's variation selectors and keycap three, a subdivision\n *  flag's six tags), never a tower of accents that draws over the page around it (E2E-WEB cycle 9 C9-3). Every\n *  grapheme extender counts, not only category M: half-width voiced sound marks (U+FF9E) and emoji skin-tone modifiers\n *  join the character before them too (E2E-WEB cycle 10 C10-3); the zero-width joiner of an emoji sequence does not. */\nexports.NAME_MARKS_PER_CHAR = 6;\nconst MARK = /(?!\\u200D)[\\p{M}\\p{Grapheme_Extend}\\p{Emoji_Modifier}]/gu;\n/** Code points one character may be built of: the longest emoji (a kiss with two skin tones, 10) and the longest\n *  conjuncts fit; a chain of emoji joined into one \"character\" (`👩‍👩‍…`) does not (E2E-WEB cycle 10 C10-3). */\nexports.NAME_PARTS_PER_CHAR = 16;\n/** A one-line name (a device name, Z4): cleaned (`cleanName`) and trimmed; nothing left, or nothing but combining marks,\n *  is 400 \"<k> is required\". At\n *  most `max` characters as a person reads them (grapheme clusters, W6: never UTF-16 units, so 100 emoji fit), each\n *  with at most `NAME_MARKS_PER_CHAR` combining marks (C9-3), and at most 16 bytes of UTF-8 per character allowed, which\n *  only long emoji sequences (families, flags) reach: refused in words the person can act on, never a byte count they\n *  can't see (E2E-WEB cycle 9 W5). */\nfunction oneLine(b, k, max = 300) {\n    const v = b[k];\n    if (typeof v !== \"string\")\n        throw (0, errors_1.badRequest)(`${k} must be a string`);\n    const t = cleanName(v).trim();\n    if ((0, text_core_mts_1.isBlankText)(t))\n        throw (0, errors_1.badRequest)(`${k} is required`);\n    const chars = [...graphemes.segment(t)].map((g) => g.segment);\n    if (chars.length > max)\n        throw (0, errors_1.badRequest)(`${k} is too long (max ${max} characters)`);\n    if (chars.some((c) => (c.match(MARK)?.length ?? 0) > exports.NAME_MARKS_PER_CHAR))\n        throw (0, errors_1.badRequest)(`${k} has a character with too many accents or marks on it (at most ${exports.NAME_MARKS_PER_CHAR} on one character)`);\n    if (chars.some((c) => [...c].length > exports.NAME_PARTS_PER_CHAR))\n        throw (0, errors_1.badRequest)(`${k} has a character joined from too many parts (at most ${exports.NAME_PARTS_PER_CHAR} in one character)`);\n    if (Buffer.byteLength(t, \"utf8\") > max * 16)\n        throw (0, errors_1.badRequest)(`${k} is too long to store: emoji such as families and flags take much more room than letters, so use fewer of them`);\n    return t;\n}\n/** An optional string field, cleaned as `str` cleans one; nothing a person can read left is null (W3). */\nfunction optStr(b, k, max = 300) {\n    const v = b[k];\n    if (v === undefined || v === null)\n        return null;\n    if (typeof v !== \"string\")\n        throw (0, errors_1.badRequest)(`${k} must be a string or null`);\n    const t = (0, text_core_mts_1.cleanProse)(v);\n    if ((0, text_core_mts_1.isBlankText)(t))\n        return null;\n    if (t.length > max)\n        throw (0, errors_1.badRequest)(`${k} is too long (max ${max} characters)`);\n    return t;\n}\nfunction oneOf(b, k, allowed) {\n    const v = b[k];\n    if (typeof v !== \"string\" || !allowed.includes(v))\n        throw (0, errors_1.badRequest)(`${k} must be one of ${allowed.join(\", \")}`);\n    return v;\n}\nfunction optOneOf(b, k, allowed) {\n    if (b[k] === undefined || b[k] === null)\n        return null;\n    return oneOf(b, k, allowed);\n}\nfunction nonNegInt(b, k) {\n    const v = b[k];\n    if (typeof v !== \"number\" || !Number.isSafeInteger(v) || v < 0)\n        throw (0, errors_1.badRequest)(`${k} must be a non-negative integer`);\n    return v;\n}\n/** A decision sent without the revision its person read, or with one that is not a whole number: refused in a person's\n *  words, never a field name, though only API clients can send it (E2E-WEB cycle 11 W1). */\nexports.NO_REVISION = \"This decision doesn't say which revision you read, so nothing was recorded. Read it again and decide again.\";\nfunction revisionRead(b, optional = false) {\n    const v = b.revision;\n    if (v === undefined && optional)\n        return undefined;\n    if (typeof v !== \"number\" || !Number.isSafeInteger(v) || v < 0)\n        throw (0, errors_1.badRequest)(exports.NO_REVISION);\n    return v;\n}\n/** A decision sent for a revision the request or proposal never reached: nothing about it changed since it was read, so\n *  this is 400 `unknown_revision`, not a stale refusal (E2E-WEB cycle 11 W3). `what` is \"request\" or \"proposal\". */\nfunction assertRevisionReached(what, sent, current) {\n    if (sent !== undefined && sent > current)\n        throw (0, errors_1.badRequest)(`This ${what} has no revision ${sent}: it is at revision ${current}, so nothing was recorded. Read it again and decide again.`, \"unknown_revision\");\n}\nfunction optInt(b, k) {\n    if (b[k] === undefined || b[k] === null)\n        return null;\n    return nonNegInt(b, k);\n}\nconst ISO = /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2})$/;\n/** An ISO 8601 timestamp, normalized to UTC with milliseconds (so string order is time order). */\nfunction iso(b, k) {\n    const v = b[k];\n    if (typeof v !== \"string\" || !ISO.test(v) || Number.isNaN(Date.parse(v)))\n        throw (0, errors_1.badRequest)(`${k} must be an ISO 8601 time`);\n    return new Date(v).toISOString();\n}\nfunction optIso(b, k) {\n    if (b[k] === undefined || b[k] === null || b[k] === \"\")\n        return null;\n    return iso(b, k);\n}\nexports.B64URL = /^[A-Za-z0-9_-]+$/;\nfunction b64url(b, k, minLen, maxLen) {\n    const v = b[k];\n    if (typeof v !== \"string\" || !exports.B64URL.test(v) || v.length < minLen || v.length > maxLen)\n        throw (0, errors_1.badRequest)(`${k} must be base64url (${minLen} to ${maxLen} characters)`);\n    return v;\n}\nfunction strList(b, k, { max = 50, itemMax = 300 } = {}) {\n    const v = b[k] ?? [];\n    if (!Array.isArray(v))\n        throw (0, errors_1.badRequest)(`${k} must be a list`);\n    if (v.length > max)\n        throw (0, errors_1.badRequest)(`${k} has too many items (max ${max})`);\n    const out = [];\n    for (const x of v) {\n        if (typeof x !== \"string\")\n            throw (0, errors_1.badRequest)(`${k} must be a list of strings`);\n        const t = x.trim();\n        if (t.length > itemMax)\n            throw (0, errors_1.badRequest)(`${k} items are too long (max ${itemMax} characters)`);\n        if (t && !out.includes(t))\n            out.push(t);\n    }\n    return out;\n}\n/** Path ids: prefix + url-safe chars, bounded. Anything else is simply not found. */\nexports.ID_RE = /^[a-z]{1,4}_[A-Za-z0-9_-]{8,64}$/;\nexports.SESSION_KEY_RE = /^[A-Za-z0-9_-]{43}$/;\n"
  },
  "lib/v2/http.ts": {
    "imports": [
      "next/server",
      "../config",
      "../errors",
      "../ratelimit",
      "./auth",
      "./config",
      "./devices",
      "./errors",
      "./init",
      "./validate"
    ],
    "code": "\"use strict\";\nObject.defineProperty(exports, \"__esModule\", { value: true });\nexports.isRecentSignIn = exports.noContent = void 0;\nexports.route = route;\nexports.rejectBrowser = rejectBrowser;\nexports.deviceAuth = deviceAuth;\nexports.webAuth = webAuth;\nexports.requireRecentSignIn = requireRecentSignIn;\nexports.eitherAuth = eitherAuth;\nexports.requireSameSite = requireSameSite;\nexports.webWrite = webWrite;\nexports.eitherWrite = eitherWrite;\nexports.idParam = idParam;\nexports.readJson = readJson;\nexports.originOf = originOf;\nexports.clientKey = clientKey;\nconst server_1 = require(\"next/server\");\nconst config_1 = require(\"../config\");\nconst errors_1 = require(\"../errors\");\nconst ratelimit_1 = require(\"../ratelimit\");\nconst auth_1 = require(\"./auth\");\nObject.defineProperty(exports, \"isRecentSignIn\", { enumerable: true, get: function () { return auth_1.isRecentSignIn; } });\nconst config_2 = require(\"./config\");\nconst devices_1 = require(\"./devices\");\nconst errors_2 = require(\"./errors\");\nconst init_1 = require(\"./init\");\n/** Wrap a v2 route: waits for the database, maps errors, logs nothing about the request when hosted. */\nfunction route(fn) {\n    return async (req, ctx) => {\n        await (0, server_1.connection)();\n        try {\n            await (0, init_1.ready)();\n            const out = await fn(req, await ctx.params);\n            return out instanceof Response ? out : Response.json(out);\n        }\n        catch (e) {\n            if (e instanceof errors_2.V2Error) {\n                // A limit that says how long to wait (`retry_after`, seconds) also sends it as Retry-After.\n                const wait = e.status === 429 && typeof e.extra?.retry_after === \"number\" ? { \"retry-after\": String(e.extra.retry_after) } : undefined;\n                return Response.json({ ...(e.extra ?? {}), error: e.code, message: e.message }, { status: e.status, headers: wait });\n            }\n            if (e instanceof errors_1.HttpError)\n                return Response.json({ error: \"bad_request\", message: e.message }, { status: e.status });\n            if ((0, config_1.config)().hosted)\n                console.error(\"Server error:\", e?.name ?? \"unknown\");\n            else\n                console.error(e);\n            return Response.json({ error: \"server_error\", message: \"Server error\" }, { status: 500 });\n        }\n    };\n}\nconst noContent = () => new Response(null, { status: 204 });\nexports.noContent = noContent;\nconst bearerOf = (req) => {\n    const h = req.headers.get(\"authorization\");\n    if (!h)\n        return null;\n    const m = /^Bearer\\s+(\\S+)$/i.exec(h.trim());\n    return m ? m[1] : \"\";\n};\n/** Device routes refuse browsers: any Origin header, and any Cookie header. */\nfunction rejectBrowser(req) {\n    if (req.headers.get(\"origin\") !== null)\n        throw new errors_2.V2Error(403, \"browser_not_allowed\", \"Device routes do not accept browser requests\");\n    if (req.headers.get(\"cookie\") !== null)\n        throw new errors_2.V2Error(403, \"cookies_not_allowed\", \"Device routes do not accept cookies\");\n}\n/** Device credential. 401 invalid_token for a missing, unknown, expired or revoked token. */\nfunction deviceAuth(req) {\n    rejectBrowser(req);\n    const t = bearerOf(req);\n    const p = t ? (0, devices_1.deviceFromAccessToken)(t) : null;\n    if (!p)\n        throw new errors_2.V2Error(401, \"invalid_token\", \"Sign in again with align login\");\n    return p;\n}\n/** Browser credential (Better Auth session cookie). */\nasync function webAuth(req) {\n    if (req.headers.get(\"authorization\") !== null)\n        throw new errors_2.V2Error(403, \"bearer_not_allowed\", \"Web routes do not accept device tokens\");\n    const s = await (0, auth_1.getAuth)().api.getSession({ headers: req.headers });\n    if (!s?.user)\n        throw new errors_2.V2Error(401, \"unauthorized\", \"Sign in first\");\n    const u = (0, devices_1.userById)(s.user.id);\n    if (!u)\n        throw new errors_2.V2Error(401, \"unauthorized\", \"Sign in first\");\n    return { kind: \"web\", user: { id: u.id, name: u.name, email: u.email }, emailVerified: u.emailVerified, signedInAt: new Date(s.session.createdAt) };\n}\n/** A sensitive action needs a sign-in from the last 15 minutes: else 403 reauth_required, and the page asks the\n *  person to sign in again and brings them back. Guarded: approving a device and an MCP app (/oauth/authorize),\n *  member role changes (ownership included), owner invites, removing another member, deleting and restoring a\n *  workspace, deleting your account, deleting a passkey and signing out everywhere here; adding a passkey and linking an account in lib/v2/auth.ts. `what`\n *  names the action (\"change a role\"); without it the message is about approving. */\nfunction requireRecentSignIn(p, what) {\n    if (!(0, auth_1.isRecentSignIn)(p.signedInAt)) {\n        throw new errors_2.V2Error(403, \"reauth_required\", what ? (0, auth_1.reauthMessage)(what) : \"Sign in again to approve. Approving needs a sign-in from the last 15 minutes.\");\n    }\n}\n/** Routes open to both: an Authorization header means the device path (with its refusals), else the cookie. */\nasync function eitherAuth(req) {\n    return req.headers.get(\"authorization\") !== null ? deviceAuth(req) : webAuth(req);\n}\n/** CSRF for cookie writes: a browser always sends Origin on these, and it must be this server's own host.\n *  Hosted (as lib/http.ts since LIM-2437): Origin is required and must be exactly https://<Host>, so an http:// page or\n *  another port can't write. Local: an Origin, when sent, must match Host; scripts send none.\n *  Fetch metadata, when sent, must say same-origin. */\nfunction requireSameSite(req) {\n    const origin = req.headers.get(\"origin\");\n    if ((0, config_1.config)().hosted) {\n        const host = req.headers.get(\"host\")?.toLowerCase();\n        if (!origin || !host || !(0, config_1.hostAllowed)(host) || origin.toLowerCase() !== `https://${host}`)\n            throw new errors_2.V2Error(403, \"cross_site\", \"This request came from another site\");\n    }\n    else if (origin !== null) {\n        let host = null;\n        try {\n            host = new URL(origin).host;\n        }\n        catch { }\n        if (!host || host !== req.headers.get(\"host\"))\n            throw new errors_2.V2Error(403, \"cross_site\", \"This request came from another site\");\n    }\n    const site = req.headers.get(\"sec-fetch-site\");\n    if (site && site !== \"same-origin\" && site !== \"none\")\n        throw new errors_2.V2Error(403, \"cross_site\", \"This request came from another site\");\n}\n/** The cookie path for a write: same-site check, then session (a cross-site write is refused before any session read). */\nasync function webWrite(req) {\n    requireSameSite(req);\n    return webAuth(req);\n}\n/** A write open to both credentials. No Authorization header means the cookie path, so it gets the same-site check first. */\nasync function eitherWrite(req) {\n    if (req.headers.get(\"authorization\") === null)\n        requireSameSite(req);\n    return eitherAuth(req);\n}\n/** Path segments that can't be ids are simply not found. */\nfunction idParam(v, re) {\n    if (!v || !re.test(v))\n        throw new errors_2.V2Error(404, \"not_found\", \"Not found\");\n    return v;\n}\nconst RESERVED = new Set([\"__proto__\", \"constructor\", \"prototype\"]);\nfunction rejectReserved(v) {\n    if (Array.isArray(v))\n        return v.forEach(rejectReserved);\n    if (v && typeof v === \"object\")\n        for (const k of Object.keys(v)) {\n            if (RESERVED.has(k))\n                throw (0, errors_2.badRequest)(`\"${k}\" is not allowed as a field name`);\n            rejectReserved(v[k]);\n        }\n}\n/** JSON object body, at most `max` bytes (413), application/json only (415). An empty body is {}. */\nasync function readJson(req, max = 64 * 1024) {\n    const type = (req.headers.get(\"content-type\") || \"\").split(\";\")[0].trim().toLowerCase();\n    const declared = Number(req.headers.get(\"content-length\") || 0);\n    if (declared > max)\n        throw new errors_2.V2Error(413, \"too_large\", \"This request is too large\");\n    const chunks = [];\n    let size = 0;\n    if (req.body) {\n        const reader = req.body.getReader();\n        for (;;) {\n            const { done, value } = await reader.read();\n            if (done)\n                break;\n            size += value.byteLength;\n            if (size > max) {\n                await reader.cancel();\n                throw new errors_2.V2Error(413, \"too_large\", \"This request is too large\");\n            }\n            chunks.push(value);\n        }\n    }\n    const text = Buffer.concat(chunks).toString(\"utf8\").trim();\n    if (!text)\n        return {};\n    if (type !== \"application/json\")\n        throw new errors_2.V2Error(415, \"unsupported_media_type\", \"Send this as application/json\");\n    let raw;\n    try {\n        raw = JSON.parse(text);\n    }\n    catch {\n        throw (0, errors_2.badRequest)(\"Send valid JSON\");\n    }\n    if (!raw || typeof raw !== \"object\" || Array.isArray(raw))\n        throw (0, errors_2.badRequest)(\"Send a JSON object\");\n    rejectReserved(raw);\n    return raw;\n}\n/** This server's origin for links shown to the user (the device verification URI). */\nfunction originOf(req) {\n    const pub = (0, config_2.publicOrigin)();\n    if (pub)\n        return pub;\n    return `http://${req.headers.get(\"host\") || \"127.0.0.1\"}`;\n}\n/** The client key for limits: Fly-Client-IP when hosted (IPv6 keyed by its /64), else one local key (as lib/ratelimit.ts). */\nfunction clientKey(req) {\n    return (0, config_1.config)().hosted ? `ip:${(0, ratelimit_1.clientNet)(req.headers.get(\"fly-client-ip\") ?? \"unknown\")}` : \"local\";\n}\n"
  }
};
const compiled = new Map(Object.entries(hosts).map(([file,{imports,code}])=>
  [file,{run:new Function("require","exports",code),imports:new Set(imports)}]));
const date = "2026-01-02T12:00:00.000Z";
class FixedDate extends Date {
  static now() { return Date.parse(date); }
}
const user = {id:"user_synthetic",name:"Synthetic user",email:"synthetic@example.invalid",emailVerified:true};
const dev = {kind:"device",user:{id:user.id,name:user.name,email:user.email},deviceId:"dev_synthetic",deviceName:"Synthetic device",grants:new Set(["ws_second","ws_first"])};
const ws = "ws_synthetic", goal = "goal_synthetic", sessionKey = "s".repeat(43);
const teamId = "pod_synthetic", inviteId = "inv_synthetic", otherUser = "user_othermember";
const directiveId = "dir_synthetic", requestId = "req_synthetic";
const askId = "ask_synthetic", grantId = "gr_"+"g".repeat(16);
const passkeyId = "a".repeat(32);
const deviceCode = "c".repeat(43), grantType = "urn:ietf:params:oauth:grant-type:device_code";
const origin = "http://align.invalid";
const source = name=>"app/api/v2/"+name+"/route.ts";
function ports(factory,{observeScheduling=[],hosted=false,authenticated=true,recent=true,denyWorkspace=false,limitAccess=false,deviceOwned=true,denyGrant=false,denyAsk=false,denyImport=false,emptyDirectives=false,denyHolder=false,existingHold=false,denySession=false,workspaceRole}={}) {
  const effects = [];
  const effect = (name,details={})=>{
    effects.push({name,...details});
    if (observeScheduling.includes(name)) {
      queueMicrotask(()=>effects.push({name:"continuationAfter", port:name}));
    }
  };
  const load = (file,imports)=>{
    const entry = compiled.get(file);
    assert(entry,file);
    const exports = {};
    entry.run(specifier=>{
      assert(entry.imports.has(specifier),file+" "+specifier);
      assert(Object.hasOwn(imports,specifier),file+" "+specifier);
      return imports[specifier];
    },exports,FixedDate);
    return exports;
  };
  const errors = load("lib/v2/errors.ts",{});
  const {V2Error} = errors;
  const validate = load("lib/v2/validate.ts",{"./errors":errors,"./text-core.mts":load("lib/v2/text-core.mts",{})});
  const next = {connection:async()=>effect("connection")};
  const init = {ready:async()=>effect("ready")};
  const auth = {getAuth:()=>{
    effect("getAuth");
    return {
      api:{getSession:async({headers})=>{
        effect("getSession",{cookie:headers.get("cookie")!==null});
        return authenticated?{user:{id:user.id},session:{createdAt:date}}:null;
      }},
      handler:async req=>{
        effect("authHandler",{method:req.method});
        return Response.json({method:req.method},{headers:{"x-synthetic":"auth"}});
      },
    };
  },COOKIE_PREFIX:"synthetic",isRecentSignIn:timestamp=>{effect("isRecentSignIn",{signedInAt:timestamp.toISOString()});return recent;},
  reauthMessage:action=>"Sign in again to "+action};
  const devices = {
    deviceFromAccessToken:token=>{effect("deviceFromAccessToken");return token==="synthetic-device"?dev:null;},
    userById:id=>{effect("userById",{id});return id===user.id?user:null;},
    authorize:(body,key,requestOrigin)=>{effect("authorize",{body,key,requestOrigin});return {started:true};},
    userCodeOf:body=>{effect("userCodeOf");return body.user_code;},
    workspaceIdsOf:body=>{effect("workspaceIdsOf");return body.workspace_ids;},
    decideRequest:(id,code,decision,workspaces)=>{effect("decideRequest",{id,code,decision,workspaces});return {decision};},
    refresh:body=>{effect("refresh",{body});return {refreshed:true};},
    lookupRequest:(id,code)=>{effect("lookupRequest",{id,code});return {pending:true};},
    deviceOwnedBy:(id,person)=>{effect("deviceOwnedBy",{id,person});return deviceOwned;},
    revokeDevice:async(id,reason,person,replaces)=>effect("revokeDevice",{id,reason,person,replaces:replaces??null}),
    listDevices:id=>{effect("listDevices",{id});return [{id:dev.deviceId},{id:"dev_otherdevice"}];},
    token:(code,replaces)=>{effect("token",{code,replaces});return {status:"approved"};},
    grantWorkspace:(id,device,workspace)=>{
      effect("grantWorkspace",{id,device,workspace});return {granted:true};
    },
  };
  const http = load("lib/v2/http.ts",{
    "next/server":next,"../config":{config:()=>({hosted}),hostAllowed:host=>host==="align.invalid"},
    "../errors":load("lib/errors.ts",{}),"../ratelimit":{clientNet:value=>value},
    "./auth":auth,"./config":{publicOrigin:()=>null},"./devices":devices,"./errors":errors,"./init":init,
  });
  const workspaces = {
    enter:(p,workspace)=>{
      effect("enter",{kind:p.kind,workspace});
      if (denyWorkspace) throw errors.notFound();
      return {kind:p.kind,workspace,...(workspaceRole===undefined?{}:{wsRole:workspaceRole})};
    },
    workspacesFor:p=>{effect("workspacesFor",{kind:p.kind});return [{id:ws}];},
    otherWorkspacesFor:p=>{effect("otherWorkspacesFor",{kind:p.kind});return [{id:"ws_otherwork"}];},
    auditTrail:pp=>{
      effect("auditTrail",pp);
      if (pp.wsRole!=="owner") throw errors.forbidden("forbidden","Synthetic owner requirement");
      return [];
    },
    listInvites:pp=>{effect("listInvites",pp);return [];},
    createInvite:async(pp,email,role,team)=>{
      effect("createInvite",{...pp,email,role,team});
      if (pp.wsRole!=="owner") throw errors.forbidden("forbidden","Synthetic owner requirement");
      return {id:inviteId};
    },
    deleteInvite:async(pp,id)=>effect("deleteInvite",{...pp,id}),
    setMemberRole:(pp,id,role)=>{effect("setMemberRole",{...pp,id,role});return {role};},
    removeMember:async(pp,id,options)=>effect("removeMember",{...pp,id,options}),
    deletedWorkspaceOwnedBy:(id,workspace)=>{
      effect("deletedWorkspaceOwnedBy",{id,workspace});
      if (workspaceRole!=="owner") throw errors.notFound();
    },
    restoreWorkspace:(id,workspace)=>{effect("restoreWorkspace",{id,workspace});return {id:workspace};},
    workspaceDetail:pp=>{effect("workspaceDetail",pp);return {id:pp.workspace};},
    updateWorkspace:(pp,body)=>{effect("updateWorkspace",{...pp,body});return {id:pp.workspace};},
    deleteWorkspace:async pp=>{
      effect("deleteWorkspace",pp);
      if (pp.wsRole!=="owner") throw errors.forbidden("forbidden","Synthetic owner requirement");
    },
    createTeam:async(pp,teamName)=>{effect("createTeam",{...pp,teamName});return {id:teamId};},
    setTeamMember:(pp,team,id,role)=>{effect("setTeamMember",{...pp,team,id,role});return {role};},
    removeTeamMember:async(pp,team,id)=>effect("removeTeamMember",{...pp,team,id}),
    deletedWorkspacesFor:id=>{effect("deletedWorkspacesFor",{id});return [{id:"ws_deletedone"}];},
    createWorkspace:async(req,p,workspaceName,creationCode)=>{
      effect("createWorkspace",{request:req instanceof Request,id:p.user.id,workspaceName,creationCode});return {id:ws};
    },
    previewInvite:(token,person)=>{effect("previewInvite",{token,id:person.id});return {match:true};},
    acceptInvite:async(token,person,verified,ids,reauth)=>{
      effect("acceptInvite",{token,id:person.id,verified,ids});
      if (ids.length) reauth();
      return {joined:true};
    },
  };
  const modules = {
    "@/lib/config":{config:()=>({hosted})},"next/server":next,"@/lib/v2/init":init,"@/lib/v2/auth":auth,"@/lib/v2/devices":devices,
    "@/lib/v2/http":http,"@/lib/v2/errors":errors,"@/lib/v2/validate":validate,"@/lib/v2/workspaces":workspaces,
    "@/lib/v2/access":{createAccessRequest:async(_req,key,body)=>{
      effect("createAccessRequest",{key,body});
      if (limitAccess) throw new V2Error(429,"rate_limited","Try again",{retry_after:30});
      return {received:true};
    }},
    "@/lib/v2/account":{
      deleteAccount:async(p,email)=>effect("deleteAccount",{id:p.user.id,email}),
      dismissPasskeyPrompt:async id=>effect("dismissPasskeyPrompt",{id}),
      renamePasskey:(id,key,name)=>{effect("renamePasskey",{id,key,passkeyName:name});return {id:key,name};},
      deletePasskey:async(id,key)=>effect("deletePasskey",{id,key}),
      listPasskeys:id=>{effect("listPasskeys",{id});return [{id:passkeyId,name:"Synthetic key"}];},
      passkeyPromptDue:id=>{effect("passkeyPromptDue",{id});return true;},
      signOutEverywhere:async(id,also)=>{effect("signOutEverywhere",{id,also});return {sessions:1,devices:0,apps:0};},
    },
    "@/lib/v2/goals":{
      goalsFeed:pp=>{effect("goalsFeed",pp);return {version:"version-4",goals:[]};},
      createGoal:async(pp,body)=>{effect("createGoal",{...pp,body});return {id:goal};},
    },
    "@/lib/oauth/grants":{
      GRANT_ID:/^gr_[A-Za-z0-9_-]{16}$/,
      listGrants:pp=>{effect("listGrants",pp);return [{id:grantId}];},
      revokeGrant:async(pp,id)=>{effect("revokeGrant",{...pp,id});if (denyGrant) throw errors.notFound();},
    },
    "@/lib/oauth/server":{
      MCP_PATH:"/api/mcp",
      originOf:req=>{effect("mcpOriginOf",{sameRequest:req instanceof Request});return "https://align.invalid";},
    },
    "@/lib/v2/asks":{
      asksFeed:(pp,filters,deviceId)=>{effect("asksFeed",{...pp,filters,deviceId});return {version:"asks-4",asks:[]};},
      createAsk:async(pp,body)=>{effect("createAsk",{...pp,body});return {id:askId};},
      getAsk:(pp,id)=>{effect("getAsk",{...pp,id});if (denyAsk) throw errors.notFound();return {id};},
      importAsks:async(pp,body)=>{
        effect("importAsks",{...pp,body});
        if (denyImport) throw errors.forbidden("forbidden","Synthetic owner requirement");
        return {created:0,merged:0,unchanged:0};
      },
      assertAskAction:action=>{
        effect("assertAskAction",{action});
        if (!["accept","decline","done","reopen","withdraw","mention"].includes(action)) throw errors.notFound();
        return action;
      },
      actOnAsk:(pp,id,action,body)=>{effect("actOnAsk",{...pp,id,action,body});return {id};},
    },
    "@/lib/v2/policy":{POD_ROLES:["lead","member"],WS_ROLES:["owner","member","viewer"]},
    "@/lib/v2/sample":{createSampleWorkspace:async(req,p,creationCode)=>{
      effect("createSampleWorkspace",{request:req instanceof Request,id:p.user.id,creationCode});return {id:ws};
    }},
    "@/lib/v2/activity":{
      activityFor:(pp,after)=>{effect("activityFor",{...pp,after});return {items:[]};},
      ingestActivity:(pp,device,body)=>{effect("ingestActivity",{...pp,device:device.deviceId,body});return {accepted:0};},
    },
    "@/lib/v2/allocation":{
      allocation:(pp,from,to)=>{effect("allocation",{...pp,from,to});return {from,to};},
      weeklyAllocation:(pp,weeks)=>{effect("weeklyAllocation",{...pp,weeks});return [];},
    },
    "@/lib/v2/goal-activity":{ACTIVITY_WINDOW_DAYS:14,
      goalActivity:(pp,id)=>{effect("goalActivity",{...pp,id});return {sessions:1};}},
    "@/lib/v2/home":{workspaceHome:pp=>{effect("workspaceHome",pp);return {connected_apps:null};}},
    "@/lib/v2/spend":{spend:(pp,by,from,to)=>{effect("spend",{...pp,by,from,to});return {groups:[]};}},
    "@/lib/v2/steering":{
      steeringCounts:(pp,from,to)=>{effect("steeringCounts",{...pp,from,to});return {shown:0};},
      ingestSteering:(pp,device,body)=>{effect("ingestSteering",{...pp,device:device.deviceId,body});return {accepted:0};},
    },
    "@/lib/v2/directives":{
      RECEIPT_STATES:["received","applied","enforced","accepted","declined"],
      parseCursor:value=>{
        effect("parseCursor",{value});
        if (value===null||value==="") return 0;
        if (!/^\d{1,15}$/.test(value)) throw errors.badRequest("cursor must be a sequence number");
        return Number(value);
      },
      directivesFor:(device,cursor,limit)=>{
        effect("directivesFor",{device:device.deviceId,cursor,limit});return emptyDirectives?[]:[{seq:8,id:directiveId}];
      },
      endedSessionsFor:device=>{effect("endedSessionsFor",{device:device.deviceId});return [{session_key:sessionKey}];},
      recordReceipt:async(device,id,key,state,at,autoAccepted)=>{
        effect("recordReceipt",{device:device.deviceId,id,key,state,at,autoAccepted});return {recorded:true};
      },
    },
    "@/lib/v2/requests":{
      getHold:(pp,id)=>{effect("getHold",{...pp,id});return {held:false,can_hold:true};},
      requireHolder:(pp,id)=>{effect("requireHolder",{...pp,id});if (denyHolder) throw errors.forbidden("forbidden","Synthetic holder requirement");},
      holdGoal:async(pp,id,body)=>{effect("holdGoal",{...pp,id,body});return {status:existingHold?200:201,body:{held:true}};},
      releaseGoal:(pp,id)=>{effect("releaseGoal",{...pp,id});return {held:false};},
      listRequests:(pp,id)=>{effect("listRequests",{...pp,id});return {requests:[]};},
      sendRequest:async(pp,id,body)=>{effect("sendRequest",{...pp,id,body});return {request:{id:requestId}};},
      cancelRequest:(pp,id,request)=>{effect("cancelRequest",{...pp,id,request});return {request:{id:request}};},
      listHolds:pp=>{effect("listHolds",pp);return [];},
    },
    "@/lib/v2/sessions":{
      ingestUsage:async(pp,device,key,body)=>{effect("ingestUsage",{...pp,device:device.deviceId,key,body});return {accepted:1};},
      openBindingEpoch:(pp,device,key,body)=>{effect("openBindingEpoch",{...pp,device:device.deviceId,key,body});return {opened:true};},
      putSession:(pp,device,key,body)=>{effect("putSession",{...pp,device:device.deviceId,key,body});return {shared:true};},
      setAgentStop:(pp,key,stopped)=>{effect("setAgentStop",{...pp,key,stopped});return {stopped};},
      deleteSession:async(pp,p,key)=>effect("deleteSession",{...pp,principalKind:p.kind,key}),
      stopSharing:(pp,p,key)=>{
        effect("stopSharing",{...pp,principalKind:p.kind,key});
        if (denySession) throw errors.notFound();
        return {shared:false};
      },
      listSessions:pp=>{effect("listSessions",pp);return {sessions:[]};},
    },
    "@/lib/v2/changes":{
      listChangeRequests:(pp,filter)=>{effect("listChangeRequests",{...pp,filter});return [];},
      createChangeRequest:async(pp,id,body)=>{effect("createChangeRequest",{...pp,id,body});return {id:"cr_synthetic"};},
    },
  };

  const resources = Object.fromEntries(Object.entries(imports).map(([specifier,{resource,members}])=>
    [resource,Object.fromEntries(members.map(member=>{
      assert(Object.hasOwn(modules[specifier],member),specifier+" "+member);
      return [member,modules[specifier][member]];
    }))]));
  const routes = factory({...resources,Response,URL});
  assert.deepEqual(Object.keys(routes).sort(),Object.keys(methodKeys).sort());
  for (const [name,methods] of Object.entries(methodKeys)) {
    assert.deepEqual(Object.keys(routes[name]).sort(),methods,name);
  }
  assert.deepEqual(effects,[],"Factory produced request effects");
  return {effects,routes};
}

const first = ["connection","ready"];
const web = [...first,"getAuth","getSession","userById"];
const device = [...first,"deviceFromAccessToken"];
const session = {cookie:"synthetic-session"};
const bearer = {authorization:"Bearer synthetic-device"};
const sameSite = {origin:"https://align.invalid",host:"align.invalid"};
const params = {ws,goal,key:sessionKey,token:"synthetic-invite",id:dev.deviceId,grant:grantId};
const route = {
  access:"access-requests",auth:"auth/[...all]",token:"device/token",grant:"devices/[id]/workspaces",
  invite:"invites/[token]/accept",me:"me",goals:"workspaces/[ws]/goals",
  usage:"workspaces/[ws]/sessions/[key]/usage",changes:"workspaces/[ws]/goals/[goal]/change-requests",
  passkeyPrompt:"account/passkey-prompt",passkeys:"account/passkeys",passkey:"account/passkeys/[id]",
  signOut:"account/sign-out-everywhere",approve:"device/approve",authorize:"device/authorize",deny:"device/deny",
  refresh:"device/refresh",lookup:"device/requests/[code]",device:"devices/[id]",devices:"devices",
  self:"devices/self",preview:"invites/[token]",
  activity:"workspaces/[ws]/activity",allocation:"workspaces/[ws]/allocation",
  goalActivity:"workspaces/[ws]/goals/[goal]/activity",home:"workspaces/[ws]/home",
  spend:"workspaces/[ws]/spend",steering:"workspaces/[ws]/steering",
  apps:"workspaces/[ws]/apps",appGrant:"workspaces/[ws]/apps/[grant]",
  asks:"workspaces/[ws]/asks",ask:"workspaces/[ws]/asks/[id]",askImport:"workspaces/[ws]/asks/import",
  askAction:"workspaces/[ws]/asks/[id]/[action]",
  directives:"directives",receipts:"directives/[id]/receipts",hold:"workspaces/[ws]/goals/[goal]/hold",
  goalRequests:"workspaces/[ws]/goals/[goal]/requests",goalRequest:"workspaces/[ws]/goals/[goal]/requests/[id]",
  holds:"workspaces/[ws]/holds",sessions:"workspaces/[ws]/sessions",sessionKey:"workspaces/[ws]/sessions/[key]",
  epoch:"workspaces/[ws]/sessions/[key]/epochs",stop:"workspaces/[ws]/sessions/[key]/stop",
  resume:"workspaces/[ws]/sessions/[key]/resume",stopSharing:"workspaces/[ws]/sessions/[key]/stop-sharing",
  audit:"workspaces/[ws]/audit",invites:"workspaces/[ws]/invites",workspaceInvite:"workspaces/[ws]/invites/[id]",
  member:"workspaces/[ws]/members/[user]",restore:"workspaces/[ws]/restore",workspace:"workspaces/[ws]",
  teams:"workspaces/[ws]/teams",pods:"workspaces/[ws]/pods",
  teamMembers:"workspaces/[ws]/teams/[team]/members",podMembers:"workspaces/[ws]/pods/[pod]/members",
  teamMember:"workspaces/[ws]/teams/[team]/members/[user]",podMember:"workspaces/[ws]/pods/[pod]/members/[user]",
  workspaces:"workspaces",sample:"workspaces/sample",
};
const cases = [
  ["access-created",route.access,"POST",201,[...first,"createAccessRequest"],{body:{email:user.email}}],
  ["access-cross-site-refused",route.access,"POST",403,first,{body:{email:user.email},headers:{origin:"https://other.invalid",host:"align.invalid"},error:"cross_site"}],
  ["access-retry-after",route.access,"POST",429,[...first,"createAccessRequest"],{body:{email:user.email},options:{limitAccess:true},error:"rate_limited",replyHeaders:{"retry-after":"30"}}],
  ["access-declared-body-limit",route.access,"POST",413,first,{body:{},headers:{"content-length":"8193"},error:"too_large"}],
  ["auth-get-delegates",route.auth,"GET",200,[...first,"getAuth","authHandler"],{replyHeaders:{"x-synthetic":"auth"}}],
  ["auth-post-bearer-refused",route.auth,"POST",403,["connection"],{headers:bearer,error:"bearer_not_allowed"}],
  ["token-approved",route.token,"POST",200,[...first,"token"],{body:{grant_type:grantType,device_code:deviceCode,replaces:dev.deviceId}}],
  ["token-browser-refused",route.token,"POST",403,first,{body:{},headers:{origin},error:"browser_not_allowed"}],
  ["token-cookie-refused",route.token,"POST",403,first,{body:{},headers:session,error:"cookies_not_allowed"}],
  ["token-unsupported-grant",route.token,"POST",400,first,{body:{grant_type:"unknown"},error:"unsupported_grant_type"}],
  ["token-malformed-replacement",route.token,"POST",400,first,{body:{grant_type:grantType,device_code:deviceCode,replaces:"wrong"},error:"bad_request"}],
  ["grant-recent-sign-in",route.grant,"POST",200,[...web,"isRecentSignIn","grantWorkspace"],{headers:session,body:{workspace_id:ws}}],
  ["grant-old-sign-in",route.grant,"POST",403,[...web,"isRecentSignIn"],{headers:session,body:{workspace_id:ws},options:{recent:false},error:"reauth_required"}],
  ["invite-empty-devices",route.invite,"POST",200,[...web,"acceptInvite"],{headers:session,body:{},options:{recent:false}}],
  ["invite-blank-device-refused",route.invite,"POST",400,web,{headers:session,body:{device_ids:[" "]},error:"bad_request"}],
  ["invite-devices-old-sign-in",route.invite,"POST",403,[...web,"acceptInvite","isRecentSignIn"],{headers:session,body:{device_ids:[dev.deviceId]},options:{recent:false},error:"reauth_required"}],
  ["invite-devices-recent-sign-in",route.invite,"POST",200,[...web,"acceptInvite","isRecentSignIn"],{headers:session,body:{device_ids:[dev.deviceId]}}],
  ["me-cookie",route.me,"GET",200,[...web,"workspacesFor"],{headers:session}],
  ["me-device",route.me,"GET",200,[...device,"workspacesFor","otherWorkspacesFor"],{headers:bearer}],
  ["me-account-delete",route.me,"DELETE",204,[...web,"isRecentSignIn","deleteAccount"],{headers:session,body:{email:user.email}}],
  ["me-bearer-delete-refused",route.me,"DELETE",403,first,{headers:bearer,body:{email:user.email},error:"bearer_not_allowed"}],
  ["goals-cookie-feed",route.goals,"GET",200,[...web,"enter","goalsFeed"],{headers:session,replyHeaders:{etag:'"version-4"',"cache-control":"private, no-cache"}}],
  ["goals-device-feed-weak-etag",route.goals,"GET",304,[...device,"enter","goalsFeed"],{headers:{...bearer,"if-none-match":'W/"version-4"'},replyHeaders:{etag:'"version-4"'}}],
  ["goals-invalid-workspace-id",route.goals,"GET",404,web,{headers:session,params:{ws:"invalid"},error:"not_found"}],
  ["goals-workspace-denied",route.goals,"GET",404,[...web,"enter"],{headers:session,options:{denyWorkspace:true},error:"not_found"}],
  ["goals-cookie-create",route.goals,"POST",201,[...web,"enter","createGoal"],{headers:{...session,...sameSite},body:{title:"Synthetic goal"},options:{hosted:true}}],
  ["goals-no-hosted-origin",route.goals,"POST",403,first,{headers:session,body:{title:"Synthetic goal"},options:{hosted:true},error:"cross_site"}],
  ["usage-device-batch",route.usage,"POST",200,[...device,"enter","ingestUsage"],{headers:bearer,body:{rows:[{synthetic:true}]}}],
  ["usage-device-invalid-session",route.usage,"POST",404,[...device,"enter"],{headers:bearer,body:{},params:{key:"wrong"},error:"not_found"}],
  ["usage-body-limit",route.usage,"POST",413,[...device,"enter"],{headers:{...bearer,"content-length":"262145"},body:{},error:"too_large"}],
  ["changes-filtered-list",route.changes,"GET",200,[...web,"enter","listChangeRequests"],{headers:session,query:"?state=pending"}],
  ["changes-created",route.changes,"POST",201,[...web,"enter","createChangeRequest"],{headers:session,body:{base_version:4,reason:"Synthetic reason"}}],
  ["changes-auth-required",route.changes,"GET",401,[...first,"getAuth","getSession"],{options:{authenticated:false},error:"unauthorized"}],
];

const moreCases = [
  ["auth-post-delegates",route.auth,"POST",200,[...first,"getAuth","authHandler"],{body:{},replyHeaders:{"x-synthetic":"auth"}}],
  ["passkey-prompt-dismiss",route.passkeyPrompt,"DELETE",204,[...web,"dismissPasskeyPrompt"],{headers:session}],
  ["passkey-list-cookie",route.passkeys,"GET",200,[...web,"listPasskeys","passkeyPromptDue"],{headers:session}],
  ["passkey-list-bearer-refused",route.passkeys,"GET",403,first,{headers:bearer,error:"bearer_not_allowed"}],
  ["passkey-rename",route.passkey,"PATCH",200,[...web,"renamePasskey"],{headers:session,params:{id:passkeyId},body:{name:"Reviewed key"}}],
  ["passkey-invalid-id",route.passkey,"PATCH",404,web,{headers:session,params:{id:"wrong"},body:{name:"Reviewed key"},error:"not_found"}],
  ["passkey-delete-recent",route.passkey,"DELETE",204,[...web,"isRecentSignIn","deletePasskey"],{headers:session,params:{id:passkeyId}}],
  ["passkey-delete-old-sign-in",route.passkey,"DELETE",403,[...web,"isRecentSignIn"],{headers:session,params:{id:passkeyId},options:{recent:false},error:"reauth_required"}],
  ["sign-out-local-cookie-clear",route.signOut,"POST",200,[...web,"isRecentSignIn","signOutEverywhere"],{headers:session,body:{},replyHeaders:{"set-cookie":"synthetic.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"}}],
  ["sign-out-hosted-cookie-clear",route.signOut,"POST",200,[...web,"isRecentSignIn","signOutEverywhere"],{headers:{...session,...sameSite},body:{devices:true,apps:true},options:{hosted:true},replyHeaders:{"set-cookie":"__Secure-synthetic.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure"}}],
  ["sign-out-flag-validation",route.signOut,"POST",400,web,{headers:session,body:{apps:"yes"},error:"bad_request"}],
  ["pair-approve-recent",route.approve,"POST",200,[...web,"isRecentSignIn","userCodeOf","workspaceIdsOf","decideRequest"],{headers:session,body:{user_code:"SYNTHETIC",workspace_ids:[ws]}}],
  ["pair-approve-old-sign-in",route.approve,"POST",403,[...web,"isRecentSignIn"],{headers:session,body:{},options:{recent:false},error:"reauth_required"}],
  ["pair-authorize-device-name",route.authorize,"POST",200,[...first,"authorize"],{headers:{host:"align.invalid"},body:{device_name:"Synthetic\n   device",public_key:"p".repeat(43)}}],
  ["pair-authorize-public-key-length",route.authorize,"POST",400,first,{body:{device_name:"Synthetic",public_key:"short"},error:"bad_request"}],
  ["pair-deny-old-sign-in-allowed",route.deny,"POST",200,[...web,"userCodeOf","decideRequest"],{headers:session,body:{user_code:"SYNTHETIC"},options:{recent:false}}],
  ["pair-refresh-body-dispatch",route.refresh,"POST",200,[...first,"refresh"],{body:{device_id:dev.deviceId,refresh_token:"synthetic-refresh",ts:date,sig:"s".repeat(86)}}],
  ["pair-refresh-browser-refused",route.refresh,"POST",403,first,{headers:{origin},body:{},error:"browser_not_allowed"}],
  ["pair-request-lookup",route.lookup,"GET",200,[...web,"lookupRequest"],{headers:session,params:{code:"SYNTHETIC"},options:{recent:false}}],
  ["device-owner-revokes",route.device,"DELETE",204,[...web,"deviceOwnedBy","revokeDevice"],{headers:session}],
  ["device-other-owner-refused",route.device,"DELETE",404,[...web,"deviceOwnedBy"],{headers:session,options:{deviceOwned:false},error:"not_found"}],
  ["devices-cookie-list",route.devices,"GET",200,[...web,"listDevices"],{headers:session}],
  ["devices-device-current",route.devices,"GET",200,[...device,"listDevices"],{headers:bearer}],
  ["device-self-revokes-with-replacement",route.self,"DELETE",204,[...device,"revokeDevice"],{headers:bearer,query:"?replaced_by=dv_synthetic"}],
  ["device-self-invalid-replacement-ignored",route.self,"DELETE",204,[...device,"revokeDevice"],{headers:bearer,query:"?replaced_by=invalid"}],
  ["invite-preview-cookie",route.preview,"GET",200,[...web,"previewInvite"],{headers:session}],
  ["invite-preview-anonymous-refused",route.preview,"GET",401,[...first,"getAuth","getSession"],{options:{authenticated:false},error:"unauthorized"}],
];

const reportCases = [
  ["activity-device-ingest",route.activity,"POST",200,[...device,"enter","ingestActivity"],{headers:bearer,body:{items:[]}}],
  ["activity-ingest-bounded-body",route.activity,"POST",413,[...device,"enter"],{headers:{...bearer,"content-length":"131073"},body:{items:[]},error:"too_large"}],
  ["activity-reader-valid-cursor",route.activity,"GET",200,[...device,"enter","activityFor"],{headers:bearer,query:"?after=7"}],
  ["activity-reader-invalid-cursor",route.activity,"GET",200,[...device,"enter","activityFor"],{headers:bearer,query:"?after=-1"}],
  ["activity-reader-cookie-refused",route.activity,"GET",403,first,{headers:session,error:"cookies_not_allowed"}],
  ["allocation-default-window",route.allocation,"GET",200,[...web,"enter","allocation","weeklyAllocation","steeringCounts"],{headers:session}],
  ["allocation-explicit-window",route.allocation,"GET",200,[...device,"enter","allocation","weeklyAllocation","steeringCounts"],{
    headers:bearer,query:"?from=2026-01-01T04:00:00-08:00&to=2026-01-08T12:00:00Z&weeks=26"}],
  ["allocation-window-from-explicit-to",route.allocation,"GET",200,[...web,"enter","allocation","weeklyAllocation","steeringCounts"],{
    headers:session,query:"?to=2026-01-08T12:00:00Z&weeks=1"}],
  ["allocation-invalid-weeks",route.allocation,"GET",400,[...web,"enter"],{headers:session,query:"?weeks=27",error:"bad_request"}],
  ["allocation-invalid-to",route.allocation,"GET",400,[...web,"enter"],{headers:session,query:"?from=bad&to=bad",error:"bad_request"}],
  ["goal-activity-cookie",route.goalActivity,"GET",200,[...web,"enter","goalActivity"],{headers:session}],
  ["goal-activity-invalid-goal",route.goalActivity,"GET",404,[...web,"enter"],{headers:session,params:{goal:"invalid"},error:"not_found"}],
  ["workspace-home-no-store",route.home,"GET",200,[...web,"enter","workspaceHome"],{headers:session,replyHeaders:{"cache-control":"no-store"}}],
  ["workspace-home-bearer-refused",route.home,"GET",403,first,{headers:bearer,error:"bearer_not_allowed"}],
  ["spend-default",route.spend,"GET",200,[...web,"enter","spend"],{headers:session}],
  ["spend-pod-alias",route.spend,"GET",200,[...web,"enter","spend"],{headers:session,query:"?by=pod&from=2026-01-01&to=2026-01-02"}],
  ["spend-invalid-group",route.spend,"GET",400,[...web,"enter"],{headers:session,query:"?by=invalid",error:"bad_request"}],
  ["spend-invalid-from",route.spend,"GET",400,[...web,"enter"],{headers:session,query:"?from=invalid",error:"bad_request"}],
  ["steering-device-ingest",route.steering,"POST",200,[...device,"enter","ingestSteering"],{headers:bearer,body:{events:[]}}],
  ["steering-ingest-bounded-body",route.steering,"POST",413,[...device,"enter"],{headers:{...bearer,"content-length":"32769"},body:{events:[]},error:"too_large"}],
];

const appsCases = [
  ["apps-list-cookie",route.apps,"GET",200,[...web,"enter","mcpOriginOf","listGrants"],
    {headers:session,replyHeaders:{"cache-control":"no-store"}}],
  ["apps-list-bearer-refused",route.apps,"GET",403,first,{headers:bearer,error:"bearer_not_allowed"}],
  ["apps-list-workspace-denied",route.apps,"GET",404,[...web,"enter"],
    {headers:session,options:{denyWorkspace:true},error:"not_found"}],
  ["apps-grant-delete",route.appGrant,"DELETE",204,[...web,"enter","revokeGrant"],{headers:session}],
  ["apps-grant-invalid-path",route.appGrant,"DELETE",404,[...web,"enter"],
    {headers:session,params:{grant:"bad"},error:"not_found"}],
  ["apps-grant-domain-denial",route.appGrant,"DELETE",404,[...web,"enter","revokeGrant"],
    {headers:session,options:{denyGrant:true},error:"not_found"}],
  ["apps-grant-cross-site-refused",route.appGrant,"DELETE",403,first,
    {headers:{...session,origin:"https://other.invalid",host:"align.invalid"},error:"cross_site"}],
];
const asksCases = [
  ["asks-cookie-feed",route.asks,"GET",200,[...web,"enter","asksFeed"],{headers:session,
    query:"?state=open%2Caccepted&team_id=pod_synthetic&limit=25",
    replyHeaders:{etag:'"asks-4"',"cache-control":"private, no-cache"}}],
  ["asks-device-feed",route.asks,"GET",200,[...device,"enter","asksFeed"],{headers:bearer}],
  ["asks-device-weak-etag",route.asks,"GET",304,[...device,"enter","asksFeed"],
    {headers:{...bearer,"if-none-match":'W/"asks-4"'},replyHeaders:{etag:'"asks-4"',"cache-control":"private, no-cache"}}],
  ["asks-cookie-wildcard-etag",route.asks,"GET",304,[...web,"enter","asksFeed"],
    {headers:{...session,"if-none-match":"*"},replyHeaders:{etag:'"asks-4"'}}],
  ["asks-create-cookie",route.asks,"POST",201,[...web,"enter","createAsk"],
    {headers:session,body:{team_id:"pod_synthetic",text:"Synthetic ask"}}],
  ["asks-create-bearer-refused",route.asks,"POST",403,first,{headers:bearer,body:{},error:"bearer_not_allowed"}],
  ["asks-create-body-limit",route.asks,"POST",413,[...web,"enter"],
    {headers:{...session,"content-length":"16385"},body:{},error:"too_large"}],
  ["ask-single-cookie",route.ask,"GET",200,[...web,"enter","getAsk"],{headers:session,params:{id:askId}}],
  ["ask-single-invalid-id",route.ask,"GET",404,[...web,"enter"],
    {headers:session,params:{id:"bad"},error:"not_found"}],
  ["ask-single-domain-denial",route.ask,"GET",404,[...web,"enter","getAsk"],
    {headers:session,params:{id:askId},options:{denyAsk:true},error:"not_found"}],
  ["ask-mention-cookie",route.askAction,"POST",200,[...web,"enter","assertAskAction","actOnAsk"],
    {headers:session,params:{id:askId,action:"mention"},body:{date:"2026-01-02",text:"Synthetic mention"}}],
  ["ask-action-before-body-limit",route.askAction,"POST",404,[...web,"enter","assertAskAction"],
    {headers:{...session,"content-length":"8193"},params:{id:askId,action:"unknown"},body:{},error:"not_found"}],
  ["ask-action-body-limit",route.askAction,"POST",413,[...web,"enter","assertAskAction"],
    {headers:{...session,"content-length":"8193"},params:{id:askId,action:"accept"},body:{},error:"too_large"}],
  ["ask-import-cookie",route.askImport,"POST",201,[...web,"enter","importAsks"],
    {headers:session,body:{asks:[]}}],
  ["ask-import-body-limit",route.askImport,"POST",413,[...web,"enter"],
    {headers:{...session,"content-length":"524289"},body:{},error:"too_large"}],
  ["ask-import-domain-denial",route.askImport,"POST",403,[...web,"enter","importAsks"],
    {headers:session,body:{asks:[]},options:{denyImport:true},error:"forbidden"}],
];

const sessionCases = [
  ["directives-device-current",route.directives,"GET",200,[...device,"parseCursor","directivesFor","endedSessionsFor"],{headers:bearer,query:"?cursor=7"}],
  ["directives-device-empty",route.directives,"GET",200,[...device,"parseCursor","directivesFor","endedSessionsFor"],
    {headers:bearer,query:"?cursor=11",options:{emptyDirectives:true}}],
  ["directives-invalid-cursor",route.directives,"GET",400,[...device,"parseCursor"],{headers:bearer,query:"?cursor=bad",error:"bad_request"}],
  ["directives-cookie-refused",route.directives,"GET",403,first,{headers:session,error:"cookies_not_allowed"}],
  ["receipt-device-auto-accepted",route.receipts,"POST",200,[...device,"recordReceipt"],{headers:bearer,params:{id:directiveId},
    body:{session_key:sessionKey,state:"accepted",at:date,auto_accepted:true}}],
  ["receipt-device-default-auto",route.receipts,"POST",200,[...device,"recordReceipt"],{headers:bearer,params:{id:directiveId},
    body:{session_key:sessionKey,state:"received",at:date}}],
  ["receipt-invalid-auto",route.receipts,"POST",400,device,{headers:bearer,params:{id:directiveId},
    body:{session_key:sessionKey,state:"accepted",at:date,auto_accepted:"yes"},error:"bad_request"}],
  ["receipt-invalid-state",route.receipts,"POST",400,device,{headers:bearer,params:{id:directiveId},
    body:{session_key:sessionKey,state:"unknown",at:date},error:"bad_request"}],
  ["receipt-body-limit",route.receipts,"POST",413,device,{headers:{...bearer,"content-length":"2049"},body:{},error:"too_large"}],
  ["goal-hold-read",route.hold,"GET",200,[...web,"enter","getHold"],{headers:session}],
  ["goal-hold-new",route.hold,"PUT",201,[...web,"enter","requireHolder","isRecentSignIn","holdGoal"],
    {headers:session,body:{reason:"Synthetic hold"}}],
  ["goal-hold-existing",route.hold,"PUT",200,[...web,"enter","requireHolder","isRecentSignIn","holdGoal"],
    {headers:session,body:{},options:{existingHold:true}}],
  ["goal-hold-holder-before-reauth",route.hold,"PUT",403,[...web,"enter","requireHolder"],
    {headers:session,body:{},options:{denyHolder:true,recent:false},error:"forbidden"}],
  ["goal-hold-old-sign-in",route.hold,"PUT",403,[...web,"enter","requireHolder","isRecentSignIn"],
    {headers:session,body:{},options:{recent:false},error:"reauth_required"}],
  ["goal-hold-body-before-holder",route.hold,"PUT",413,[...web,"enter"],
    {headers:{...session,"content-length":"4097"},body:{},error:"too_large"}],
  ["goal-hold-release",route.hold,"DELETE",200,[...web,"enter","requireHolder","isRecentSignIn","releaseGoal"],{headers:session}],
  ["goal-hold-release-holder-before-reauth",route.hold,"DELETE",403,[...web,"enter","requireHolder"],
    {headers:session,options:{denyHolder:true,recent:false},error:"forbidden"}],
  ["goal-requests-list",route.goalRequests,"GET",200,[...web,"enter","listRequests"],{headers:session}],
  ["goal-requests-send",route.goalRequests,"POST",201,[...web,"enter","sendRequest"],
    {headers:session,body:{type:"stop",note:"Synthetic request"}}],
  ["goal-requests-send-body-limit",route.goalRequests,"POST",413,[...web,"enter"],
    {headers:{...session,"content-length":"4097"},body:{},error:"too_large"}],
  ["goal-requests-cancel",route.goalRequest,"DELETE",200,[...web,"enter","cancelRequest"],
    {headers:session,params:{id:requestId}}],
  ["goal-requests-cancel-bad-id",route.goalRequest,"DELETE",404,[...web,"enter"],
    {headers:session,params:{id:"bad"},error:"not_found"}],
  ["workspace-holds-list",route.holds,"GET",200,[...web,"enter","listHolds"],{headers:session}],
  ["workspace-sessions-list",route.sessions,"GET",200,[...web,"enter","listSessions"],{headers:session}],
  ["session-epoch-device-open",route.epoch,"POST",200,[...device,"enter","openBindingEpoch"],
    {headers:bearer,body:{starts_at:date}}],
  ["session-epoch-body-limit",route.epoch,"POST",413,[...device,"enter"],
    {headers:{...bearer,"content-length":"4097"},body:{},error:"too_large"}],
  ["session-stop-cookie",route.stop,"POST",200,[...web,"enter","setAgentStop"],{headers:session}],
  ["session-resume-cookie",route.resume,"POST",200,[...web,"enter","setAgentStop"],{headers:session}],
  ["session-resume-bearer-refused",route.resume,"POST",403,first,{headers:bearer,error:"bearer_not_allowed"}],
  ["session-share-device-put",route.sessionKey,"PUT",200,[...device,"enter","putSession"],
    {headers:bearer,body:{alias:"Synthetic session"}}],
  ["session-share-body-limit",route.sessionKey,"PUT",413,[...device,"enter"],
    {headers:{...bearer,"content-length":"8193"},body:{},error:"too_large"}],
  ["session-delete-device",route.sessionKey,"DELETE",204,[...device,"enter","deleteSession"],{headers:bearer}],
  ["session-delete-cookie",route.sessionKey,"DELETE",204,[...web,"enter","deleteSession"],{headers:session}],
  ["session-delete-cross-site-refused",route.sessionKey,"DELETE",403,first,
    {headers:{...session,origin:"https://other.invalid",host:"align.invalid"},error:"cross_site"}],
  ["session-stop-sharing-device",route.stopSharing,"POST",200,[...device,"enter","stopSharing"],{headers:bearer}],
  ["session-stop-sharing-cookie",route.stopSharing,"POST",200,[...web,"enter","stopSharing"],{headers:session}],
  ["session-stop-sharing-domain-denial",route.stopSharing,"POST",404,[...web,"enter","stopSharing"],
    {headers:session,options:{denySession:true},error:"not_found"}],
];

const owner = {workspaceRole:"owner"};
const member = {workspaceRole:"member"};
const workspaceAdminCases = [
  ["workspace-audit-cookie",route.audit,"GET",200,[...web,"enter","auditTrail"],{headers:session,options:owner}],
  ["workspace-audit-domain-denial",route.audit,"GET",403,[...web,"enter","auditTrail"],
    {headers:session,options:member,error:"forbidden"}],
  ["workspace-invites-list",route.invites,"GET",200,[...web,"enter","listInvites"],{headers:session,options:owner}],
  ["workspace-invite-member",route.invites,"POST",201,[...web,"enter","createInvite"],
    {headers:session,options:{...owner,recent:false},body:{email:"synthetic@example.invalid",role:"member"}}],
  ["workspace-invite-owner",route.invites,"POST",201,[...web,"enter","isRecentSignIn","createInvite"],
    {headers:session,options:owner,body:{email:"synthetic@example.invalid",role:"owner",team_id:teamId,team_role:"lead"}}],
  ["workspace-invite-owner-old-session",route.invites,"POST",403,[...web,"enter","isRecentSignIn"],
    {headers:session,options:{...owner,recent:false},body:{email:"synthetic@example.invalid",role:"owner"},error:"reauth_required"}],
  ["workspace-invite-nonowner-domain-denial",route.invites,"POST",403,[...web,"enter","createInvite"],
    {headers:session,options:{...member,recent:false},body:{email:"synthetic@example.invalid",role:"owner"},error:"forbidden"}],
  ["workspace-invite-invalid-role",route.invites,"POST",400,[...web,"enter"],
    {headers:session,options:owner,body:{email:"synthetic@example.invalid",role:"unknown"},error:"bad_request"}],
  ["workspace-invite-delete",route.workspaceInvite,"DELETE",204,[...web,"enter","deleteInvite"],
    {headers:session,options:owner,params:{id:inviteId}}],
  ["workspace-role-change",route.member,"POST",200,[...web,"enter","isRecentSignIn","setMemberRole"],
    {headers:session,options:owner,params:{user:otherUser},body:{role:"viewer"}}],
  ["workspace-role-change-reauth-before-body",route.member,"POST",403,[...web,"enter","isRecentSignIn"],
    {headers:{...session,"content-length":"4097"},options:{...owner,recent:false},params:{user:otherUser},body:{},error:"reauth_required"}],
  ["workspace-member-owner-remove",route.member,"DELETE",204,[...web,"enter","isRecentSignIn","removeMember"],
    {headers:session,options:owner,params:{user:otherUser},query:"?delete_sessions=1"}],
  ["workspace-member-leave",route.member,"DELETE",204,[...web,"enter","removeMember"],
    {headers:session,options:{...member,recent:false},params:{user:user.id}}],
  ["workspace-member-invalid-id-before-reauth",route.member,"DELETE",404,[...web,"enter"],
    {headers:session,options:{...owner,recent:false},params:{user:"bad"},error:"not_found"}],
  ["workspace-restore-owner",route.restore,"POST",200,[...web,"deletedWorkspaceOwnedBy","isRecentSignIn","restoreWorkspace"],
    {headers:session,options:owner}],
  ["workspace-restore-ownership-before-reauth",route.restore,"POST",404,[...web,"deletedWorkspaceOwnedBy"],
    {headers:session,options:{...member,recent:false},error:"not_found"}],
  ["workspace-restore-old-session",route.restore,"POST",403,[...web,"deletedWorkspaceOwnedBy","isRecentSignIn"],
    {headers:session,options:{...owner,recent:false},error:"reauth_required"}],
  ["workspace-detail",route.workspace,"GET",200,[...web,"enter","workspaceDetail"],{headers:session,options:member}],
  ["workspace-update",route.workspace,"PATCH",200,[...web,"enter","updateWorkspace"],
    {headers:session,options:owner,body:{name:"Synthetic workspace",steering:"on"}}],
  ["workspace-delete-owner",route.workspace,"DELETE",204,[...web,"enter","isRecentSignIn","deleteWorkspace"],
    {headers:session,options:owner}],
  ["workspace-delete-nonowner",route.workspace,"DELETE",403,[...web,"enter","deleteWorkspace"],
    {headers:session,options:{...member,recent:false},error:"forbidden"}],
  ["workspace-team-create",route.teams,"POST",201,[...web,"enter","createTeam"],
    {headers:session,options:owner,body:{name:"Synthetic team"}}],
  ["workspace-pod-create-alias",route.pods,"POST",201,[...web,"enter","createTeam"],
    {headers:session,options:owner,body:{name:"Synthetic team"}}],
  ["workspace-team-member-set",route.teamMembers,"POST",200,[...web,"enter","setTeamMember"],
    {headers:session,options:owner,params:{team:teamId},body:{user_id:otherUser,role:"lead"}}],
  ["workspace-pod-member-set-alias",route.podMembers,"POST",200,[...web,"enter","setTeamMember"],
    {headers:session,options:owner,params:{pod:teamId},body:{user_id:otherUser,role:"lead"}}],
  ["workspace-team-member-remove",route.teamMember,"DELETE",204,[...web,"enter","removeTeamMember"],
    {headers:session,options:owner,params:{team:teamId,user:otherUser}}],
  ["workspace-pod-member-remove-alias",route.podMember,"DELETE",204,[...web,"enter","removeTeamMember"],
    {headers:session,options:owner,params:{pod:teamId,user:otherUser}}],
  ["workspaces-list-with-deleted",route.workspaces,"GET",200,[...web,"workspacesFor","deletedWorkspacesFor"],
    {headers:session}],
  ["workspaces-create-code",route.workspaces,"POST",201,[...web,"createWorkspace"],
    {headers:session,options:{recent:false},body:{name:"Synthetic workspace",creation_code:"synthetic-code"}}],
  ["workspaces-create-body-limit",route.workspaces,"POST",413,web,
    {headers:{...session,"content-length":"4097"},body:{},error:"too_large"}],
  ["workspaces-sample-create",route.sample,"POST",201,[...web,"createSampleWorkspace"],
    {headers:session,body:{creation_code:"synthetic-code"}}],
  ["workspaces-sample-bearer-refused",route.sample,"POST",403,first,{headers:bearer,body:{},error:"bearer_not_allowed"}],
];


const adminCases = workspaceAdminCases.filter(([,route])=>Object.hasOwn(methodKeys,route));

const schedulingPorts = ["enter", "isRecentSignIn", "deletedWorkspaceOwnedBy", "workspacesFor"];
const schedulingCases = adminCases
  .filter(([, , , status, effects])=>status>=200 && status<400 && effects.some(name=>schedulingPorts.includes(name)))
  .map(([name, route, method, status, effects, options])=>[
    "ordering-"+name, route, method, status, effects,
    {...options, options:{...options.options, observeScheduling:schedulingPorts}},
  ]);
adminCases.push(...schedulingCases);

function semanticBatches() {
  const sizes = [15,14,schedulingCases.length];
  let offset = 0;
  const batches = sizes.map(size=>{
    const entries = Array.from({length:size},(_,i)=>({operation:0,settings:{index:offset+i}}));
    offset += size;
    return entries;
  });
  assert.equal(adminCases.length,offset);
  return batches;
}
function fixture({index}) {
  return {async run(factory) {
    const [name,routeName,method,status,effects,fixture] = adminCases[index];
    const current = ports(factory,fixture.options);
    const routeMethod = current.routes[routeName][method];
    assert.equal(typeof routeMethod,"function",name);
    const body = fixture.body===undefined?undefined:JSON.stringify(fixture.body);
    const headers = {...(body?{"content-type":"application/json"}:{}),...fixture.headers};
    const request = new Request(origin+"/"+routeName+(fixture.query??""),{method,headers,body});
    const response = await routeMethod(request,{params:Promise.resolve({...params,...fixture.params})});
    assert.equal(response.status,status,name);
    if (!fixture.options?.observeScheduling) assert.deepEqual(current.effects.map(effect=>effect.name),effects,name);
    for (const [key,value] of Object.entries(fixture.replyHeaders??{})) assert.equal(response.headers.get(key),value,name);
    const raw = await response.text();
    const result = raw?JSON.parse(raw):null;
    assert.equal(result?.error,fixture.error,name);
    if (name==="me-cookie") assert.equal(Object.hasOwn(result,"other_workspaces"),false);
    if (name==="me-device") assert.deepEqual(result.other_workspaces,[{id:"ws_otherwork"}]);
    if (name==="changes-filtered-list") assert.deepEqual(current.effects.at(-1).filter,{goalId:goal,state:"pending"});
    if (name==="goals-device-feed-weak-etag"||name==="me-account-delete") assert.equal(result,null,name);
    if (name==="pair-authorize-device-name") {
      assert.deepEqual(jsonValue(current.effects.at(-1)),{name:"authorize",body:{device_name:"Synthetic device",public_key:"p".repeat(43)},
        key:"local",requestOrigin:"http://align.invalid"});
    }
    if (name==="devices-device-current") assert.deepEqual(result.devices.map(row=>row.current),[true,false]);
    if (name==="devices-cookie-list") assert(result.devices.every(row=>!Object.hasOwn(row,"current")));
    if (name==="device-self-revokes-with-replacement") assert.equal(current.effects.at(-1).replaces,"dv_synthetic");
    if (name==="device-self-invalid-replacement-ignored") assert.equal(current.effects.at(-1).replaces,null);
    if (name==="sign-out-local-cookie-clear") assert.deepEqual(jsonValue(current.effects.at(-1).also),{devices:false,apps:false});
    if (name==="sign-out-hosted-cookie-clear") assert.deepEqual(jsonValue(current.effects.at(-1).also),{devices:true,apps:true});
    if (name==="activity-reader-valid-cursor") assert.equal(current.effects.at(-1).after,7);
    if (name==="activity-reader-invalid-cursor") assert.equal(current.effects.at(-1).after,0);
    if (name==="allocation-default-window") {
      assert.deepEqual(result.window,{from:"2025-12-26T12:00:00.000Z",to:null});
      assert.equal(current.effects.at(-2).weeks,6);
    }
    if (name==="allocation-explicit-window"||name==="allocation-window-from-explicit-to") {
      assert.deepEqual(result.window,{from:"2026-01-01T12:00:00.000Z",to:"2026-01-08T12:00:00.000Z"});
      assert.equal(current.effects.at(-2).weeks,name==="allocation-explicit-window"?26:1);
    }
    if (name==="allocation-invalid-to") assert.equal(result.message,"to must be an ISO 8601 time");
    if (name==="goal-activity-cookie") assert.deepEqual(result,{window_days:14,sessions:1});
    if (name==="spend-default") assert.deepEqual(jsonValue(current.effects.at(-1)),{name:"spend",kind:"web",workspace:ws,by:"goal",from:null,to:null});
    if (name==="spend-pod-alias") assert.deepEqual(jsonValue(current.effects.at(-1)),{name:"spend",kind:"web",workspace:ws,by:"team",
      from:"2026-01-01T00:00:00.000Z",to:"2026-01-02T00:00:00.000Z"});
    if (name==="apps-list-cookie") assert.deepEqual(result,{url:"https://align.invalid/api/mcp",apps:[{id:grantId}]});
    if (name==="apps-grant-delete"||name==="asks-device-weak-etag"||name==="asks-cookie-wildcard-etag") assert.equal(result,null,name);
    if (name==="asks-cookie-feed") assert.deepEqual(current.effects.at(-1).filters,{state:"open,accepted",teamId:"pod_synthetic",limit:"25"});
    if (name==="asks-cookie-feed") assert.equal(current.effects.at(-1).deviceId,null);
    if (name==="asks-device-feed") assert.equal(current.effects.at(-1).deviceId,dev.deviceId);
    if (name==="ask-mention-cookie") assert.deepEqual(current.effects.at(-1).body,{date:"2026-01-02",text:"Synthetic mention"});
    if (name==="directives-device-current"||name==="directives-device-empty") {
      assert.deepEqual(result.workspaces,["ws_first","ws_second"]);
      assert.equal(result.next_cursor,name==="directives-device-current"?"8":"11");
      assert.equal(current.effects.at(-2).limit,100);
      assert.deepEqual(result.ended_sessions,[{session_key:sessionKey}]);
    }
    if (name==="receipt-device-auto-accepted"||name==="receipt-device-default-auto") {
      assert.equal(current.effects.at(-1).autoAccepted,name==="receipt-device-auto-accepted");
      assert.equal(current.effects.at(-1).key,sessionKey);
      assert.equal(current.effects.at(-1).at,date);
    }
    if (name==="session-stop-cookie"||name==="session-resume-cookie") assert.equal(result.stopped,name==="session-stop-cookie");
    if (name==="session-delete-device"||name==="session-delete-cookie") assert.equal(result,null,name);
    if (name==="workspace-invite-owner") assert.deepEqual(jsonValue(current.effects.at(-1).team),{id:teamId,role:"lead"});
    if (name==="workspace-invite-member") assert.deepEqual(jsonValue(current.effects.at(-1).team),{id:null,role:null});
    if (name==="workspace-member-owner-remove"||name==="workspace-member-leave") {
      assert.equal(current.effects.at(-1).options.deleteSessions,name==="workspace-member-owner-remove");
    }
    if (name==="workspaces-list-with-deleted") assert.deepEqual(result.deleted,[{id:"ws_deletedone"}]);
    if (name==="workspaces-create-code"||name==="workspaces-sample-create") assert.equal(current.effects.at(-1).creationCode,"synthetic-code");
    return {name,route:source(routeName),method,status,result,headers:[...response.headers],effects:current.effects};
  }};
}
module.exports={semanticBatches,fixture};

};

// Private JSON data, rendered as literal objects for inspection.
const jsonData = {
  "/__private__/server-workspace-admin-routes/characterization.json": {
    "schema": "align/B19-workspace-admin-routes-frozen-observations@1",
    "fault_paths": [],
    "batches": [
      {
        "batch": 0,
        "records": 15,
        "sha256": "458edc91e86696b0b0b6bc4b7a33ffb5bae3593c7beccb9e07e9aaf966229323"
      },
      {
        "batch": 1,
        "records": 14,
        "sha256": "deab121a06762088dd294543fab69a6cba01b1d7493341d9e320da36df3cb347"
      },
      {
        "batch": 2,
        "records": 16,
        "sha256": "09ec367ccf82f034a035056794a22a420ea52a21c18d48dea0ef823a1b757fcf"
      },
      {
        "batch": 3,
        "records": 0,
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      },
      {
        "batch": 4,
        "records": 0,
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      }
    ]
  }
};
const fileNames = {
  "fixture.cjs": "/__private__/server-workspace-admin-routes/fixture.cjs",
  "characterization.json": "/__private__/server-workspace-admin-routes/characterization.json"
};
const manifest = {
  "schema": "align/readable-private-qualification@1",
  "component": "server-workspace-admin-routes",
  "package": "server_workspace_admin_routes",
  "package_files": [
    "package.json",
    "create_workspace_admin_routes.js"
  ],
  "package_exports": {
    "./create_workspace_admin_routes": "./create_workspace_admin_routes.js"
  },
  "capabilities": [
    {
      "id": "server-workspace-admin-routes.create-workspace-admin-routes",
      "symbol": "create_workspace_admin_routes",
      "module": "create_workspace_admin_routes.js",
      "fixture": "fixture.cjs",
      "cases": "fixture.cjs",
      "characterization": "characterization.json",
      "resource_count": 0,
      "default_operation": 0,
      "runner": false
    }
  ],
  "plans": [
    {
      "capability": "server-workspace-admin-routes.create-workspace-admin-routes",
      "batch": 0,
      "expected_result": {
        "batch": 0,
        "records": 15,
        "sha256": "458edc91e86696b0b0b6bc4b7a33ffb5bae3593c7beccb9e07e9aaf966229323"
      }
    },
    {
      "capability": "server-workspace-admin-routes.create-workspace-admin-routes",
      "batch": 1,
      "expected_result": {
        "batch": 1,
        "records": 14,
        "sha256": "deab121a06762088dd294543fab69a6cba01b1d7493341d9e320da36df3cb347"
      }
    },
    {
      "capability": "server-workspace-admin-routes.create-workspace-admin-routes",
      "batch": 2,
      "expected_result": {
        "batch": 2,
        "records": 16,
        "sha256": "09ec367ccf82f034a035056794a22a420ea52a21c18d48dea0ef823a1b757fcf"
      }
    }
  ],
  "files": [
    {
      "name": "fixture.cjs",
      "path": "tools/native-rewrite/qualification/b19-v1/server-workspace-admin-routes/fixture.cjs",
      "sha256": "44db4599959befb85324a95958ead39e2962aa2caa442389a576c956d9a9a9a3",
      "size": 77992
    },
    {
      "name": "characterization.json",
      "path": "tools/native-rewrite/qualification/b19-v1/server-workspace-admin-routes/characterization.json",
      "sha256": "ec1a609135cf73562d736758515e424b5347ddc79a2c7bedd5ebf4c8ce270a3d",
      "size": 786
    }
  ]
};

function load(file) {
  if (loaded.has(file)) return loaded.get(file).exports;
  if (Object.hasOwn(jsonData,file)) return jsonData[file];
  assert(Object.hasOwn(modules,file),'Undeclared private verifier module '+file);
  const module = {exports:{}};
  loaded.set(file,module);
  const imports = name => {
    if (name.startsWith('node:')) return require(name);
    const resolved = name.startsWith('/') ? name : path.posix.resolve(path.posix.dirname(file),name);
    return load(resolved);
  };
  modules[file](imports,module,module.exports,file,path.posix.dirname(file));
  return module.exports;
}
const driver = load("/__private__/server-workspace-admin-routes/driver.cjs");

const files = new Map(Object.entries(fileNames).map(([name,file]) => [name,{file,bytes:Object.hasOwn(jsonData,file)?Buffer.from(JSON.stringify(jsonData[file])):Buffer.alloc(0)}]));
const CAPABILITIES = manifest.capabilities.map(item=>item.id);
const SYMBOLS = manifest.capabilities.map(item=>item.symbol);
const PLANS = manifest.plans;
const CASE_IDS = PLANS.map(plan=>plan.capability+'-'+String(plan.batch+1).padStart(3,'0'));
async function runSelected(root,_surface,selected) {
  assert(Array.isArray(selected)&&selected.length>0&&selected.length<=PLANS.length);
  const indices=selected.map(item=>{
    assert(Array.isArray(item.arguments)&&item.arguments.length===1);
    const index=item.arguments[0];
    assert(Number.isSafeInteger(index)&&index>=0&&index<PLANS.length);
    assert.equal(item.capability,PLANS[index].capability);
    assert.equal(item.case_id,CASE_IDS[index]);
    return index;
  });
  assert.equal(new Set(indices).size,indices.length);
  const directory=driver.candidatePackage(root,manifest),factories=new Map(),results=[];
  for(let at=0;at<selected.length;at++) {
    const item=selected[at],plan=PLANS[indices[at]];
    const capability=manifest.capabilities.find(cap=>cap.id===plan.capability);
    if(!factories.has(capability.id))factories.set(capability.id,driver.factoryFromBytes(fs.readFileSync(path.join(directory,capability.module)),capability.symbol));
    const result=await driver.runBatch(factories.get(capability.id),capability,plan.batch,files);
    assert.deepEqual(result,plan.expected_result);
    results.push({case_id:item.case_id,capability:item.capability,result});
  }
  return results;
}
module.exports={CAPABILITIES,SYMBOLS,CASE_IDS,PLANS,runSelected};
if(require.main===module) {
  assert.equal(process.argv.length,5);
  runSelected(process.argv[2],JSON.parse(process.argv[3]),JSON.parse(process.argv[4])).then(cases=>console.log(JSON.stringify({schema:'literate-ai/library-acceptance-results@1',cases}))).catch(error=>{console.error(error.stack);process.exitCode=1;});
}
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
      "require('./oracle.cjs').runSelected('/inputs/source',input.surface,input.selected)",
      ".then(cases=>process.stdout.write(JSON.stringify({schema:'literate-ai/library-acceptance-results@1',cases})+'\\n'))",
      ".catch(error=>{console.error(error.stack);process.exitCode=1;});",
    ].join('\n'), {mode: 0o444});
    // Do not depend on the caller's umask for container readability.
    for (const file of SETTINGS.package_files) fs.chmodSync(path.join(packageRoot, file), 0o444);
    for (const file of ['oracle.cjs', 'request.json', 'execute.cjs']) {
      fs.chmodSync(path.join(snapshot, file), 0o444);
    }
    fs.chmodSync(snapshot, 0o755);
    const argv = ['run', '--rm', '--name', name, '--pull=never', '--network=none', '--read-only',
      '--user=65532:65532', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--pids-limit=64', '--memory=768m', '--cpus=2',
      '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m', '--env=HOME=/tmp',
      '--mount', `type=bind,source=${snapshot},target=/inputs,readonly`,
      '--workdir=/inputs', '--entrypoint=node', SETTINGS.image,
      '--no-warnings', '--max-old-space-size=512', '/inputs/execute.cjs'];
    started = true;
    const result = cp.spawnSync('docker', argv, {env: dockerEnvironment, encoding: 'utf8',
      timeout: 120000, maxBuffer: 4 * 1024 * 1024});
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
