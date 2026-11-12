'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"2ac875877fca45f12a45ddc5b01a8d2ff5f72bd14be88ad2d13e8d75830d8e77","package":"trust_text_parser","package_files":["package.json","create_trust_text_parser.js"],"maximum_cases":1,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {'use strict';
// Independent private test code, in readable source. No original service algorithm.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modules = Object.create(null);
const loaded = new Map();

// Private verifier module: /__private__/trust-text-parser/driver.cjs
modules["/__private__/trust-text-parser/driver.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
// Private verifier. Original implementations are loaded only in source mode.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const cp = require('node:child_process');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function relativeFile(root, relative) {
  assert.equal(typeof relative, 'string');
  assert(!path.isAbsolute(relative) && !relative.includes('\\') && !relative.includes(':'));
  const parts = relative.split('/');
  assert(parts.every(part => /^[A-Za-z0-9_.-]+$/.test(part) && part !== '.' && part !== '..'));
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const stat = fs.lstatSync(current);
    assert(!stat.isSymbolicLink(), 'Private verifier input must not be a symlink');
    assert(i === parts.length - 1 ? stat.isFile() : stat.isDirectory());
  }
  return current;
}
function pinned(root, relative, hash) {
  const file = relativeFile(root, relative);
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
  // Collection prototypes are observed in the candidate's execution realm.
  // This driver itself runs only inside the declared read-only Linux container.
  const module={exports:{}};
  const blocked=()=>{throw Error('Forbidden generated module import');};
  new Function('exports','module','require','"use strict";\n'+bytes.toString('utf8'))(module.exports,module,blocked);
  assert.deepEqual(Object.keys(module.exports),[symbol]);
  const factory=module.exports[symbol];
  assert.equal(typeof factory,'function');assert.equal(factory.name,symbol);
  assert.equal(factory.length,1);assert.equal(factory.constructor.name,'Function');
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
    for (const source of references.raw_sources) pinned(process.cwd(), source.path, source.sha256);
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

// Private verifier module: /__private__/trust-text-parser/legacy-observations.cjs
modules["/__private__/trust-text-parser/legacy-observations.cjs"] = function(require,module,exports,__filename,__dirname) {
// Independent structural observations for the trust-document Markdown reader.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {pathToFileURL}=require("node:url"),{createHash}=require("node:crypto");
const FUNCTIONS=["slug","safeHref","parseInline","plain","parseMarkdown"];
const SYMBOL=Object.fromEntries(FUNCTIONS.map(n=>[n,n.replace(/[A-Z]/g,c=>"_"+c.toLowerCase())]));
const CAPABILITY=Object.fromEntries(Object.entries(SYMBOL).map(([n,s])=>[n,"trust-markdown."+s.replace(/_/g,"-")]));
// Cached real trust-document fixtures, with original content identities.
const DOCUMENTS=[
  {
    "file": "docs/trust/dpa.md",
    "sha256": "c9696a185eab982cc257ad0e79ba186a542d1be42033754ac9746855640e0da5",
    "text": "# Data processing agreement\n\n> **Draft for counsel review.** Prepared 2026-10-30. It is not legal advice and is not yet offered for signature. The\n> bracketed placeholders are filled in when it is.\n\nAlign adopts the **Common Paper Data Processing Agreement, version 1.1**, as its DPA. The agreement is this Cover Page\nplus the Common Paper DPA Standard Terms, published at\n<https://commonpaper.com/standards/data-processing-agreement/>. This page does not copy the Standard Terms; it fills in\nthe Cover Page for hosted Align. Common Paper's standard agreements are licensed under\n[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Align refers to the Standard Terms as Common Paper\npublishes them; the Cover Page and the changes listed under \"Changes to the Standard Terms\" below are Align's.\n\nThe Standard Terms incorporate the European Commission's 2021 Standard Contractual Clauses (Decision 2021/914) for\ntransfers from the EEA, the UK Addendum to them for transfers from the UK, and adjustments for transfers under Swiss\nlaw. To sign, write to [PRIVACY CONTACT EMAIL].\n\n## Cover Page\n\n| Key term | Align's entry |\n| --- | --- |\n| Agreement | The agreement under which the Customer uses hosted Align, named when the DPA is signed |\n| Provider | [LEGAL ENTITY], [ADDRESS] |\n| Provider Security Contact | [SECURITY CONTACT EMAIL] |\n| Approved Subprocessors | The [subprocessor list](subprocessors.md): Fly.io (hosting, United States), the configured email API (Resend in the default configuration, United States), and Cloudflare Turnstile (bot check, when enabled) |\n| Security Policy | The [security overview](security-overview.md), summarized in Annex II below. Certifications: none |\n| Governing Law and Chosen Courts | To be set by counsel |\n| Service Provider Relationship (CCPA) | Applies: Align acts as a service provider and does not sell or share Customer Personal Data |\n| Restricted Transfers: Governing Member State | To be set by counsel |\n\n## Changes to the Standard Terms\n\nThese change the Standard Terms in the Customer's favour or say how they apply to Align. Counsel to confirm the\nwording.\n\n- **Subprocessor notice.** Align gives at least **30 days'** written notice before a new subprocessor starts processing\n  Customer Personal Data, in place of the Standard Terms' 10 business days, and the Customer may object within those\n  30 days under the Standard Terms' objection process. If the objection can't be resolved, the Customer may stop\n  using hosted Align and delete its workspaces.\n- **Security incidents.** Align notifies the Customer within **72 hours** of becoming aware of a Security Incident, as\n  the Standard Terms require, and without undue delay where it can be sooner.\n- **Deletion on termination.** Customer Personal Data is deleted as the [retention schedule](../RETENTION.md)\n  describes: an owner can delete a workspace at any time; it can be restored for 30 days, is then purged by a daily\n  job, and leaves the 7-day volume snapshots within 38 days of its deletion. On request, Align purges a workspace at\n  once. Align keeps no other copy.\n- **Audits.** Align has no third-party audit report to provide. It meets audit requests by answering security and\n  audit questionnaires and providing documentation (see the [questionnaire answers](questionnaire.md)), at most once\n  a year unless a Security Incident or a supervisory authority requires more. Any inspection beyond that is on\n  reasonable notice and agreed in advance.\n\n## Annex I(A): Parties\n\n| | Data exporter | Data importer |\n| --- | --- | --- |\n| Who | The Customer, as named when the DPA is signed | [LEGAL ENTITY], [ADDRESS] |\n| Contact | The Customer's contact, as named when signed | [PRIVACY CONTACT EMAIL] |\n| Role | Controller (or processor, for its own customers) | Processor (or subprocessor) |\n\n## Annex I(B): Processing details\n\n| Item | Details |\n| --- | --- |\n| Service | Hosted Align: goals with owners and approval, the coding-agent sessions people choose to share toward them, and connected AI apps that read them |\n| Subject matter | Customer Personal Data in the Customer's Align workspaces |\n| Categories of data subjects | The Customer's personnel and contractors who use its workspaces, and people they invite by email |\n| Categories of personal data | Names, email addresses and roles; goals, change requests and decisions and who made them; evidence links on change requests; for shared agent sessions, the agent used, a hashed repository key, an optional repository alias, times, the goal it works toward, and token usage and estimated cost; for 24 hours, hashes of files touched (and, only if a person turns it on, file paths and short task text); paired device names; connected app names; audit log entries |\n| Not processed | Prompt text, agent replies and tool output, code and file contents |\n| Special category data | No |\n| Frequency of transfer | Continuous, while the Customer uses the Service |\n| Nature of processing | Storing, organizing, showing to authorized people, sending to the Customer's paired devices and connected AI apps, rolling up into totals, and deleting |\n| Purpose of processing | Providing the Service to the Customer |\n| Duration of processing | The term of the Agreement, then until deletion as described above |\n\n## Annex I(C): Competent supervisory authority\n\nAs the Standard Terms set out.\n\n## Annex II: Technical and organizational measures\n\nA summary of the [security overview](security-overview.md):\n\n- **Encryption.** HTTPS at the hosting provider's edge; the database volume is encrypted at rest by the hosting\n  provider.\n- **Access control.** People sign in individually (email codes, Google, GitHub or passkeys; no passwords). Sessions\n  last 7 days from last use and at most 30 days. Sensitive actions require a sign-in from the last 15 minutes. Every\n  request is authorized by workspace role, team role and goal visibility.\n- **Credentials.** Device, AI app and invite tokens are stored as hashes; refresh tokens rotate and reuse revokes them; devices hold their own\n  keys; connected AI apps are read-only and limited to one workspace, except for adding agent-reported evidence links\n  with the separate `changes:evidence` scope.\n- **Data minimization.** No prompts, agent output or code on the server.\n- **Abuse prevention.** Rate limits, creation codes and caps, a disposable-domain block, and a bot check.\n- **Logging.** A per-workspace audit log kept 1 year; server logs hold no request bodies, addresses, emails or codes.\n- **Availability.** Daily volume snapshots kept 7 days and a health check every 30 seconds.\n- **Deletion.** A published retention schedule applied by a daily job, and in-app deletion of accounts and\n  workspaces.\n- **Subprocessors.** A published list with 30 days' notice of changes.\n"
  },
  {
    "file": "docs/trust/privacy-policy.md",
    "sha256": "50b589957c417611f2c7b48d932b622253b8b6f0e4333c4eaf53be2e4b72d5f6",
    "text": "# Privacy policy\n\n> **Draft for counsel review.** Prepared 2026-10-30 from the code and configuration of Align. It is not legal advice\n> and is not yet in force. The bracketed placeholders are filled in when it is published.\n\nThis policy explains what personal data Align collects, why, how long it is kept, who else handles it, and the\nchoices and rights you have. \"Align\", \"we\" and \"us\" mean [LEGAL ENTITY], [ADDRESS]. Write to us at\n[PRIVACY CONTACT EMAIL].\n\n<!-- Counsel: decide whether an EU (GDPR Art. 27) or UK representative is needed, and add it here. -->\n\n## Our two roles\n\n- **Controller** for your account, for this website and its sign-in, for the request-access form, for security and\n  abuse prevention, and for product events. We decide why and how that data is used, and this policy covers it.\n- **Processor** for workspace data: the goals, members, teams, change requests, shared sessions and everything else\n  people put in a workspace. We process it on behalf of the organization the workspace belongs to (our customer),\n  under our agreement with them and the [data processing agreement](dpa.md). That organization's own privacy notice\n  governs it; we help them answer requests about it.\n- **Local mode.** Align can run on your own computer instead of on our servers. Then everything stays on your\n  computer, and we receive none of it.\n\n## What we collect\n\n| Data | What it is | Where it comes from |\n| --- | --- | --- |\n| Account | Your email address and name; if you sign in with Google or GitHub, the provider's account id, your profile picture address and the tokens the provider issued at sign-in (kept by our sign-in software, the access and refresh tokens encrypted; we do not use them afterwards). If you sign in with an email code and give no name, your name starts as the part of your email before the @ | You, Google or GitHub <!-- lib/v2/auth.ts; Better Auth ba_user, ba_account --> |\n| Passkeys | Each passkey's public key, its name, when it was added and when it was last used, and whether you dismissed the \"add a passkey\" prompt | You <!-- lib/v2/account.ts --> |\n| Sign-in sessions | A session token in a cookie and, on our servers, your IP address and browser's user agent | Your browser <!-- docs/RETENTION.md --> |\n| Email sign-in codes | A hash of each code, for 5 minutes | Us <!-- lib/v2/auth.ts --> |\n| Devices | The name you give a computer that runs the `align` agent, its public key, when it was last seen, and hashes of its tokens | You <!-- lib/v2/devices.ts --> |\n| Connected AI apps | For each app you connect: its name and return address as it gives them, the workspace, when you connected it and last used it, a hash of its refresh token, and the scopes you granted | You and the app <!-- lib/oauth/grants.ts --> |\n| Workspace data (we are processor) | Workspace name, members and their roles, teams, invites (the invitee's email), goals and their versions, alignments, change requests with their notes and decisions, evidence links on change requests, labelled self-reported or agent-reported, and goal snapshots Align computes, directives, and the audit log | People in the workspace <!-- lib/v2/db.ts --> |\n| Shared sessions (we are processor) | For each agent session a person chooses to share: which agent it was (Claude Code or Codex), a hashed repository key, an optional repository alias, times, state, the goal it works toward, and token usage with estimated cost | The `align` agent on the person's computer <!-- docs/RETENTION.md --> |\n| Work signals (we are processor) | For 24 hours: hashes of files a shared session touched, and, only if the person turns on \"share work signals\", file paths and short text such as a task or commit title | The `align` agent <!-- lib/v2/activity.ts --> |\n| Access requests | Email, name, company, team size, what you want to use Align for, and your interest (try or evaluate) | You, on the request-access form <!-- app/app/request-access/view.tsx --> |\n| Creation codes | A keyed hash of each code, the email it is for, its dates, and the workspace it created | Us <!-- lib/v2/db.ts v2_creation_codes --> |\n| Abuse prevention | Rate-limit counters keyed by a keyed hash of an email address or network address; when the bot check is on, what Cloudflare Turnstile collects in your browser and your IP address | Your browser <!-- lib/v2/limits.ts; lib/v2/captcha.ts --> |\n| Product events | An event name (such as \"workspace created\" or \"first session shared\"), the workspace, a keyed hash that stands for the person, the time, and a few allowlisted properties such as the interest chosen on the request form. Never an email, name, title, address or token | Our server |\n| Messages we send | Sign-in codes and creation codes, sent to your email address | Us |\n\n**What we never collect on our servers:** the prompts you or your colleagues write to coding agents, the agents'\nreplies and tool output, your code and file contents, or a session's title. **Cookies:** only the ones needed to\nsign in: your session cookie and short-lived cookies set during a Google, GitHub or passkey sign-in. We use no\nanalytics, advertising or tracking cookies and no third-party analytics.\n\n## Why we use it, and our legal bases\n\n| Purpose | Data | Legal basis (EU and UK GDPR) |\n| --- | --- | --- |\n| Create your account, sign you in, keep you signed in | Account, passkeys, sessions, codes, devices | Contract |\n| Provide workspaces to our customers | Workspace data, shared sessions, work signals, connected apps | Contract with our customer (as processor, on their instructions) |\n| Answer a request for access and send a creation code | Access requests, creation codes | Steps before a contract, at your request; legitimate interests in choosing whom to onboard |\n| Keep Align secure and stop abuse | Sessions (IP address, user agent), rate-limit counters, the bot check, the audit log | Legitimate interests in security, and the customer's interest in an audit trail |\n| Understand whether people get value from Align, in aggregate | Product events, which hold no content and no direct identifiers | Legitimate interests in improving the product |\n| Meet legal obligations | Any of the above, as required | Legal obligation |\n\nWe do not sell personal data, share it for advertising, or use it to train AI models. Align's server sends no data to\nany AI model provider.\n\n## Who else handles it\n\n- **Our subprocessors**: Fly.io (hosting), our email provider (Resend in the default configuration) and, when the bot\n  check is on, Cloudflare Turnstile. See the [subprocessor list](subprocessors.md).\n- **Google and GitHub**, if you choose to sign in with them.\n- **People in your workspace**, according to their role and the visibility of each goal.\n- **AI apps you connect**, which read one workspace as you, with your permissions. You choose them, and their makers\n  handle what they read under their own terms.\n- **Authorities**, when the law requires it, and a successor if [LEGAL ENTITY] is merged or sold, under this policy.\n\n## How long we keep it\n\nOur full retention schedule is published at [RETENTION.md](../RETENTION.md) and applied by a daily job. In short:\n\n- Sign-in sessions: 7 days from last use, never more than 30 days from sign-in. Email codes: 5 minutes.\n- Shared session details: 13 months after the session ends, then only totals with no person attached.\n- Work signals: 24 hours.\n- Workspace audit log: 1 year.\n- People who leave a workspace: shown as \"Former member\" there after 30 days.\n- A deleted workspace: restorable for 30 days, then deleted, and gone from our backups within 38 days.\n- Access requests: deleted 13 months after we approve or decline them, or 13 months after they were made if still\n  pending.\n- Product events: 13 months.\n- Your account: until you delete it.\n- Backups: daily snapshots of our database, each kept 7 days.\n\n## Your rights\n\nYou can ask us for a copy of your personal data, to correct it, to delete it, to restrict or object to its use, and\nto receive it in a portable form; where we rely on consent, you can withdraw it. You can also complain to your data\nprotection authority.\n\n- **Delete your account yourself** at `/app/account` (it asks you to sign in again first). The account, its devices,\n  sessions, passkeys and sign-in methods are deleted at once, and your name is replaced with \"Former member\" in every\n  workspace you belonged to. Your access requests are deleted with it. If you are the only owner of a workspace that\n  has other members, make someone else an owner or delete the workspace first. <!-- lib/v2/account.ts deleteAccount -->\n- **Everything else:** email [PRIVACY CONTACT EMAIL]. We answer within one month.\n- **Workspace data:** ask the organization that owns the workspace; we will help them answer.\n\nIf you live in California, you have similar rights to know, delete and correct, and we do not sell or share your\npersonal information as California law defines those terms.\n\n## International transfers\n\nHosted Align runs in the United States (Fly.io region `sjc`), and our subprocessors are in the United States. When we\ntransfer personal data from the EEA, the UK or Switzerland, we rely on the European Commission's 2021 Standard\nContractual Clauses, with the UK Addendum and the Swiss adjustments, as the [DPA](dpa.md) sets out.\n\n## Security\n\nHow we protect data is described in our [security overview](security-overview.md).\n\n## Children\n\nAlign is a tool for work. It is not meant for anyone under 16, and we do not knowingly collect their data. If you\nthink a child has given us personal data, write to [PRIVACY CONTACT EMAIL] and we will delete it.\n\n## Changes to this policy\n\nWe will post any change here with a new date. If a change matters to how we use your data, we will tell account\nholders by email before it takes effect.\n\n## Contact\n\n[LEGAL ENTITY], [ADDRESS]. Privacy questions and requests: [PRIVACY CONTACT EMAIL].\n"
  },
  {
    "file": "docs/trust/questionnaire.md",
    "sha256": "95a4a9f41cf56ca8c9953eaf083a71aeec59c91d29a48e6a22c2fa044e1225c4",
    "text": "# Security questionnaire answers\n\n> Prepared 2026-10-30, for review before it is sent or published. These answer common questions from CAIQ-Lite and\n> VSA Core style questionnaires about hosted Align, each with a pointer to where it is shown. \"No\" means no.\n> Answers marked [CONFIRM] depend on account settings outside this repository and must be checked before they are\n> sent. [LEGAL ENTITY] publishes these answers; questions go to [SECURITY CONTACT EMAIL].\n\nThe pointers name sections of the [security overview](security-overview.md), the [privacy policy](privacy-policy.md),\nthe [subprocessor list](subprocessors.md), the [retention schedule](../RETENTION.md) and the [DPA note](dpa.md).\n\n## Governance and assurance\n\n| # | Question | Answer | Detail |\n| --- | --- | --- | --- |\n| 1 | Do you hold a SOC 2 report or ISO 27001 certification? | No | Neither yet. A SOC 2 Type I would start when a customer requires it. Security overview, \"Not yet\". |\n| 2 | Has an independent penetration test been performed? | No | Not yet. Security overview, \"Not yet\". |\n| 3 | Do you have documented security policies? | Partial | This answer set, the security overview, the retention schedule, the privacy policy and the DPA. No separate policy set. |\n| 4 | Is someone accountable for security? | Yes | [LEGAL ENTITY]; security reports go to [SECURITY CONTACT EMAIL]. |\n| 5 | Do staff have background checks and security training? | No | No formal program: [CONFIRM]. |\n| 6 | Do you have a vulnerability disclosure process? | Yes | `SECURITY.md` and [SECURITY CONTACT EMAIL]. No bug bounty. |\n\n## Data\n\n| # | Question | Answer | Detail |\n| --- | --- | --- | --- |\n| 7 | Do you have an inventory of the customer data you hold? | Yes | Privacy policy, \"What we collect\"; security overview, \"What Align stores\". |\n| 8 | Do you store customer source code, prompts or AI conversations? | No | The server stores no prompt text, tool output, messages, code or file contents. <!-- docs/RETENTION.md; lib/v2/db.ts --> |\n| 9 | Do you process special categories of personal data? | No | Not by design. Align holds account details, workspace structure and usage metadata. |\n| 10 | Is customer data used to train AI models? | No | Align's server calls no AI model provider and trains no model. Subprocessors, \"Not subprocessors\". |\n| 11 | Is there a published retention schedule? | Yes | [RETENTION.md](../RETENTION.md), applied by a daily job. |\n| 12 | Can customers delete their data? | Yes | People delete their accounts in the app; owners delete workspaces (30-day restore, then purged; gone from snapshots within 38 days). The operator can purge a workspace at once on request. |\n| 13 | Is customer data logically separated between customers? | Yes | Workspace data is keyed by workspace, and every request is authorized against the caller's membership in one policy module; a workspace the caller can't see answers 404. <!-- lib/v2/policy.ts --> |\n| 14 | Is customer data stored in a known location? | Yes | United States: one Fly.io machine and volume in region `sjc` (San Jose, California). No choice of region yet. |\n\n## Identity and access\n\n| # | Question | Answer | Detail |\n| --- | --- | --- | --- |\n| 15 | Does the product support SSO (SAML or OIDC)? | No | Google and GitHub sign-in are supported; enterprise SSO is available on request. |\n| 16 | Does the product support SCIM provisioning? | No | Available on request. |\n| 17 | Does the product support MFA or phishing-resistant sign-in? | Partial | Passkeys (WebAuthn) are supported and phishing-resistant. MFA cannot be required per workspace yet. |\n| 18 | Does the product store passwords? | No | Sign-in is by email code, Google, GitHub or passkey. |\n| 19 | Are sessions limited in time? | Yes | 7 days from last use, never more than 30 days from sign-in; sign out everywhere. Security overview, \"Signing in\". |\n| 20 | Do sensitive actions require re-authentication? | Yes | A sign-in from the last 15 minutes for device and app approval, role changes, removal, deletion, passkeys and more. |\n| 21 | Is access role-based with least privilege? | Yes | Workspace roles (owner, member, viewer), team roles (lead, member) and goal visibility (private, team, workspace). |\n| 22 | Is access removed promptly when someone leaves? | Yes | Removal ends workspace access, team places, device access and connected apps at once. <!-- lib/v2/lifecycle.ts --> |\n| 23 | Is production access restricted and protected by MFA? | Partial | Production is reached only through the Fly.io account (`fly ssh console`, `fly secrets`). MFA on the Fly.io and GitHub accounts: [CONFIRM]. |\n\n## Encryption and secrets\n\n| # | Question | Answer | Detail |\n| --- | --- | --- | --- |\n| 24 | Is data encrypted in transit? | Yes | HTTPS at Fly's edge, with plain HTTP redirected; calls to the email API and Turnstile are HTTPS. No HSTS header yet. |\n| 25 | Is data encrypted at rest? | Yes | By Fly.io: volumes are encrypted at rest by default (Fly's control). In the application, Google and GitHub access and refresh tokens are also encrypted (XChaCha20-Poly1305); nothing else is encrypted at the application level. |\n| 26 | Are credentials and tokens stored hashed? | Partial | Email codes, device tokens, refresh tokens, invite links and creation codes are stored only as hashes. Google and GitHub access and refresh tokens from sign-in are stored encrypted, though Align does not use them. Browser session tokens are stored as issued (Better Auth's default), and so is a Google ID token. |\n| 27 | Are secrets kept out of source code? | Yes | Set with `fly secrets`; the image is built from an allowlisted context. |\n| 28 | Are customer-managed encryption keys supported? | No | |\n\n## Application security\n\n| # | Question | Answer | Detail |\n| --- | --- | --- | --- |\n| 29 | Are requests protected against cross-site request forgery? | Yes | Cookie-authenticated writes must carry the server's exact `Origin`; cookies are `SameSite=Lax`. |\n| 30 | Is there rate limiting and abuse protection? | Yes | Durable limits on sign-in codes, limits on creation, invites and pairing, caps, a disposable-domain block, and Cloudflare Turnstile when enabled. |\n| 31 | Are dependencies locked and tracked? | Partial | `package-lock.json`, with the sign-in library pinned exactly; no automated dependency scanning yet. |\n| 32 | Is code tested before release? | Partial | Integration tests start real servers and cover sign-in, authorization, the hosted edge and connected apps; they are run by developers, not yet in CI. |\n| 33 | Is the access of connected AI apps limited? | Yes | Read one workspace, as the person who connected them, through nine read-only tools. With the separate `changes:evidence` scope an app may also add agent-reported evidence links. |\n| 34 | Are AI-agent prompt-injection risks addressed? | Partial | Text written by people is marked untrusted for AI apps; Align sends agents only facts and an enforced stop, and never wakes an idle agent. |\n\n## Operations, logging and resilience\n\n| # | Question | Answer | Detail |\n| --- | --- | --- | --- |\n| 35 | Are security events logged? | Yes | A per-workspace audit log (who, what, when), kept 1 year and readable by owners; it records approvals made without evidence. |\n| 36 | Do logs avoid personal and secret data? | Yes | When hosted, the server logs no request body, path, address, email or code. |\n| 37 | Are there backups? | Yes | Daily Fly.io volume snapshots, kept 7 days. No off-site backups. |\n| 38 | Is there high availability or a disaster recovery plan? | No | One machine in one region, no standby; recovery is a restore from the latest snapshot. |\n| 39 | Is there monitoring and alerting? | Partial | Fly checks the server's health every 30 seconds. No alerting on top of it yet: [CONFIRM]. |\n\n## Incidents, vendors and privacy\n\n| # | Question | Answer | Detail |\n| --- | --- | --- | --- |\n| 40 | Do you notify customers of a personal data breach? | Yes | Within 72 hours of becoming aware, under the DPA. No written incident runbook yet. |\n| 41 | Do you publish your subprocessors and give notice of changes? | Yes | [Subprocessors](subprocessors.md); 30 days' notice with a right to object. |\n| 42 | Do you offer a DPA with Standard Contractual Clauses? | Yes | The Common Paper DPA with the 2021 EU SCCs and the UK Addendum. [DPA note](dpa.md). |\n| 43 | Do you use third-party analytics or advertising trackers? | No | Product events are content-free and kept in Align's own database for 13 months, for the operator only. |\n| 44 | Can the product run without sending data to you? | Yes | Local mode keeps everything on the person's own machine. |\n"
  },
  {
    "file": "docs/trust/retention.md",
    "sha256": "df23768d1d92aba94e20e7ee07cfb9b24b6dc2bfa0d9c1f5ed8b6fd1d3a2a863",
    "text": "# Retention\n\nAlign's retention schedule is [RETENTION.md](../RETENTION.md), in the same folder as this one's parent. It is not\ncopied here, so there is one schedule to keep current. The public trust page shows it at `/trust#retention`.\n"
  },
  {
    "file": "docs/trust/security-overview.md",
    "sha256": "958a0bf741ef951b09784c703dba43e51118988a1771b1981c91d3b1031a7295",
    "text": "# Security overview\n\n> Prepared 2026-10-30 from the code and configuration in this repository, for review before it is published. It says\n> what Align does today and, at the end, what it does not do yet. [LEGAL ENTITY] publishes it. Report a security\n> problem to [SECURITY CONTACT EMAIL].\n\nAlign keeps goals, who may change them, and the coding agents working toward them in step. It never needs to see\nwhat people say to their agents: the server stores no prompt text, tool output, messages or code.\n\n## In short\n\n- One server on one Fly.io machine, behind Fly's HTTPS edge, with one SQLite database on a Fly volume that Fly\n  encrypts at rest.\n- No prompts, tool output, messages, code or file contents are stored on the server.\n- People sign in as themselves: an emailed one-time code, Google, GitHub, or a passkey. There are no passwords.\n- Sessions last 7 days from last use and never more than 30 days from sign-in. Sensitive actions need a sign-in from\n  the last 15 minutes. \"Sign out everywhere\" ends every session at once.\n- Every request is authorized in one policy module by workspace role, team role and goal visibility.\n- Device, AI app and invite tokens are stored only as hashes. Refresh tokens rotate, and reusing an old one revokes\n  the device or the app.\n- Connected AI apps get read-only access to one workspace, as the person who connected them; adding evidence links\n  needs a separate scope.\n- Data is deleted on a published schedule ([retention](../RETENTION.md)), and an account can be deleted in the app.\n- Local mode keeps everything on the person's own machine.\n- Not yet: SOC 2, ISO 27001, a penetration test, SSO/SAML/SCIM. See \"Not yet\" below.\n\n## Architecture\n\n| Part | What it is |\n| --- | --- |\n| Server | One Next.js process on one Fly.io machine (region `sjc`, San Jose, California), 1 CPU and 1 GB. A second server on the same data refuses to start. <!-- fly.toml; lib/startup.ts pid file --> |\n| Edge | Fly's proxy terminates TLS and redirects plain HTTP to HTTPS. Align answers only for its own host names, only for requests that came through Fly's edge over HTTPS, and only on an allowlist of paths: everything else is 404, so a route added later stays closed until it is listed. <!-- fly.toml force_https; proxy.ts --> |\n| Database | One SQLite file, `/data/v2/align.sqlite`, file mode 0600 in a 0700 directory, on a Fly volume. Fly states that volumes are created with encryption at rest by default; that is Fly's control, not Align's. <!-- lib/v2/db.ts; https://fly.io/docs/volumes/overview/ --> |\n| Image | Built from an allowlisted context: no tests, docs, local agent packages or `.env` files reach the image. It runs as the unprivileged `node` user. <!-- Dockerfile; .dockerignore --> |\n| Secrets | `ALIGN_SECRET`, `BETTER_AUTH_SECRET` (32+ characters each), the email API key and any Google, GitHub or Turnstile secrets are set with `fly secrets`, never in the repository or the image. A server missing a required setting refuses to start. <!-- lib/config.ts; lib/v2/config.ts v2Problems --> |\n| Outside services | Fly.io, the configured email API (Resend by default), Cloudflare Turnstile when enabled, and Google and GitHub for sign-in when configured. No AI model provider. See [subprocessors](subprocessors.md). |\n\n## What Align stores, and what it does not\n\n| Stored | Not stored |\n| --- | --- |\n| Account: email, name, profile picture address from Google or GitHub, linked sign-in methods, passkeys (public keys) | Passwords (there are none) |\n| Workspace: members and roles, teams, invites, goals and their versions, alignments, change requests and decisions, directives | Prompt text, tool output, messages, code, file contents |\n| Shared sessions: harness, a hashed repository key, an optional repository alias, times, state, goal binding, token usage and estimated cost | A session title: the `align` agent sends none <!-- docs/RETENTION.md --> |\n| Work signals for 24 hours: keyed hashes of files touched; file paths and short text only if the person turns on \"share work signals\" | Anything from a session the person did not choose to share |\n| Change request evidence: typed links (pull request, CI run, incident, dashboard, document or other) labelled self-reported or agent-reported, and a goal snapshot Align computes itself | Any claim that evidence is verified: Align labels it, it does not check it |\n| Product events: an event name, the workspace, a keyed hash of the person, the time and a few allowlisted properties | Emails, names, titles, URLs or tokens in those events |\n| Audit log: who did what to which object, and when | The content of goals or requests in the audit log |\n\n## Signing in\n\n- **Email one-time codes.** 6 digits, valid 5 minutes, 3 attempts, stored as a SHA-256 hash. Sends are limited\n  per address and per client, durably when hosted (see \"Rate limits\"). The answer to a send never says whether an\n  account exists. A code makes a new account only for a pending invite, an approved access request's creation code,\n  or the server's first owner. <!-- lib/v2/auth.ts -->\n- **Google and GitHub.** Standard OAuth sign-in through Better Auth, asking only for identity (Google `openid`,\n  `email`, `profile`; GitHub `read:user`, `user:email`). Accounts are linked only explicitly, from the account page,\n  never by a matching email. An account whose email the provider did not verify can't be taken over with an email\n  code. <!-- lib/v2/auth.ts -->\n- **Passkeys.** WebAuthn passkeys, added from the account page after a recent sign-in, with the public host as the\n  relying party. Signing in with a passkey is phishing-resistant. <!-- lib/v2/auth.ts passkey() -->\n- **No passwords.** A password sign-in exists only as a local test switch, which a hosted server refuses to start\n  with. <!-- lib/v2/config.ts v2Problems ALIGN_TEST_IDP -->\n- **Sessions.** A random token in a signed `HttpOnly`, `Secure`, `SameSite=Lax` cookie\n  (`__Secure-align_v2.session_token`), kept in the database as Better Auth issues it.\n  A session lasts 7 days, extended while it is used, and never more than 30 days after the sign-in that made it\n  (`ALIGN_SESSION_MAX_DAYS`, 1 to 365). **Sign out everywhere** ends all of a person's sessions and can also unpair\n  their devices and disconnect their AI apps. <!-- lib/v2/auth.ts; lib/v2/account.ts signOutEverywhere -->\n- **Recent sign-in for sensitive actions.** A sign-in from the last 15 minutes is needed to approve a device or an AI\n  app, change a role, remove a member, invite an owner, delete or restore a workspace, add a passkey, link an\n  account, sign out everywhere, and delete the account. <!-- lib/v2/config.ts RECENT_SIGN_IN_MS; requireRecentSignIn callers -->\n\nEmail codes alone are a single factor (NIST AAL1). People who want a phishing-resistant sign-in can add a passkey.\n\n## Who may do what\n\n- **Workspace roles.** Owners manage the workspace (invites, teams, roles, removal, deletion, the audit log);\n  members create goals and share sessions; viewers read. **Team roles:** leads manage their team's members and team\n  goals. <!-- lib/v2/policy.ts WORKSPACE_ROLE_ACTIONS, POD_ROLE_ACTIONS -->\n- **Goal visibility.** Private (its owner only), team, or workspace. A workspace owner does not read others' private\n  goals. <!-- lib/v2/policy.ts -->\n- **One decision point.** Every route asks the same policy module. Something the caller may not see answers 404, so\n  its existence does not leak; something visible but not allowed answers 403. <!-- lib/v2/policy.ts -->\n- **Leaving.** When a person leaves or is removed, their access ends at once: team places, device access and\n  connected AI apps for that workspace. <!-- lib/v2/lifecycle.ts -->\n\n## Tokens and keys\n\n| Credential | How it works |\n| --- | --- |\n| Device pairing (the `align` CLI) | A device makes an Ed25519 key pair and a person approves its code in the browser after a recent sign-in. Access tokens last 1 hour. Refresh tokens last 30 days, rotate on every use, and each refresh is signed with the device's private key. Presenting a refresh token that was already used revokes the device. Only SHA-256 hashes of tokens are stored. <!-- lib/v2/devices.ts --> |\n| Connected AI apps (OAuth 2.1) | Authorization code with PKCE (S256) only, public clients, refresh token rotation, resource binding. A person approves one app for one workspace after a recent sign-in. Access tokens last 1 hour and are checked against the grant and the person's membership on every call. Refresh tokens last 7 days from the grant and are never extended; reusing an old one deletes the grant. Refresh tokens are stored only as keyed hashes. <!-- lib/oauth/server.ts; lib/oauth/grants.ts --> |\n| What an app may do | Read only, through nine tools: goals, a goal, change requests, decision records, directives, goal limits, asks between teams, agent activity counts toward goals and a short brief. An app may add agent-reported evidence links to change requests through a tenth tool only if the person grants the separate `changes:evidence` scope, and each grant records the scopes it was given. <!-- lib/mcp/register.ts --> |\n| Invite links, device pairing secrets, creation codes | Stored only as hashes (creation codes as an HMAC under `ALIGN_SECRET`). <!-- lib/v2/db.ts token_hash, device_code_hash, code_hash --> |\n| Server secrets | Rotating `ALIGN_SECRET` ends every connected app and unused creation code; rotating `BETTER_AUTH_SECRET` signs everyone out. <!-- lib/secret.ts; docs/HOSTING.md --> |\n| Google and GitHub tokens | Better Auth keeps the access and refresh tokens the provider issued at sign-in or linking in the database, encrypted (XChaCha20-Poly1305 under the server's `BETTER_AUTH_SECRET`). An ID token (Google issues one: a signed, short-lived statement of who signed in) is stored as issued. Align does not use these tokens after sign-in, and no route returns them: Better Auth's routes that would hand out, refresh or describe them (and the one that unlinks a provider) are turned off. <!-- lib/v2/auth.ts account.encryptOAuthTokens, DISABLED_PATHS --> |\n\n## Requests from browsers and AI apps\n\n- A write made with the sign-in cookie must carry this server's exact `Origin`, so another site can't make one.\n  <!-- lib/v2/http.ts -->\n- Device and MCP routes refuse requests from browsers. <!-- lib/v2/http.ts; specs/align/mcp.md -->\n- The AI app consent page can't be framed, cached or leaked in a `Referer`. <!-- next.config.ts -->\n- Text written by people comes back to AI apps marked as untrusted, so an agent can tell data from instructions.\n  <!-- lib/mcp/register.ts -->\n- Align sends agents only facts and an enforced stop: no free-text instructions, and nothing wakes an idle agent.\n- When Align fetches an AI app's client document, it refuses private network addresses, limits size and time, and\n  caches the result. <!-- lib/oauth/clients.ts -->\n\n## Rate limits and abuse controls\n\n- Email-code sends: 3 per address per 10 minutes, 10 per client per hour, and, hosted, 5 per address per hour and\n  3 per client per minute, counted in the database so a restart doesn't reset them. <!-- lib/v2/auth.ts -->\n- Better Auth's own limits on sign-in routes when hosted, also counted in the database. <!-- lib/v2/auth.ts rateLimit -->\n- Limits on workspace creation, invites, device pairing and device-code lookups. <!-- specs/align/workspaces.md -->\n- Hosted workspace creation needs a single-use creation code by default, and the operator can close creation\n  entirely. Caps on workspaces (100), workspaces per person (2), members per workspace (25) and new shared sessions\n  per device per day (500), each configurable. <!-- lib/v2/config.ts caps(), creationMode() -->\n- Disposable email domains can't request access or create a workspace. <!-- lib/v2/disposable.ts -->\n- Cloudflare Turnstile on email-code sign-in, access requests and workspace creation, when its keys are set. A\n  hosted server without them starts and logs a warning. <!-- lib/v2/captcha.ts; lib/startup.ts -->\n\n## Logging and the audit log\n\n- When hosted, the server logs no request body, path, address, email or code. A server error logs only the error's\n  name. Email failures log only the HTTP status. The retention job logs counts only. <!-- lib/v2/http.ts; lib/v2/core.mts postEmail; lib/v2/retention.ts -->\n- Fly.io keeps the machine's log output on its platform for a limited time; Align keeps no copy.\n- Each workspace has an audit log of who did what to which object, and when: membership and roles, invites, teams,\n  goal versions, change requests and alignments and their decisions, devices, connected apps, passkeys, stopped\n  agents, deletions and restores. Owners can read it. It is kept 1 year. A change request approved without evidence\n  is recorded as such. <!-- lib/v2/db.ts v2_audit; docs/RETENTION.md -->\n- Content-free product events are kept 13 months and are visible to the operator only.\n\n## Backups and recovery\n\n- Fly.io takes a daily snapshot of the volume, kept 7 days. <!-- fly.toml scheduled_snapshots, snapshot_retention = 7 -->\n- Align makes no other backup, off-site or otherwise. Restoring from a snapshot would lose the changes since it was\n  taken, up to a day.\n- One machine in one region: if it fails, Align is down until it is restored. There is no standby.\n- Fly checks the server's health every 30 seconds. <!-- fly.toml http_service.checks -->\n\n## Deletion and retention\n\nThe full schedule is [RETENTION.md](../RETENTION.md). In short: shared session rows are rolled up without the person\nafter 13 months; the audit log is kept 1 year; removed members are shown as \"Former member\" after 30 days; a deleted\nworkspace can be restored for 30 days and is then purged, and is gone from every snapshot within 38 days; an account\ndeleted in the app is deleted at once. Approved and declined access requests are deleted 13 months after the\ndecision, pending ones 13 months after they were made. Product events are kept 13 months.\n\n## Local mode\n\nAlign also runs on a person's own machine (Mode L). The database stays in `data/v2/align.sqlite` there and nothing is\nsent to [LEGAL ENTITY]. The local server answers only to loopback host names, so another website can't reach it under\nits own name. It prints sign-in codes instead of emailing them. It reaches the internet only for Google or GitHub\nsign-in, if configured, and to read the client document of an AI app the person connects. <!-- proxy.ts; lib/v2/mail.ts -->\n\n## How the code is made\n\n- The code is in git. Dependencies are locked with `package-lock.json`, and the sign-in library (Better Auth and its\n  passkey plugin) is pinned to an exact version. <!-- package.json -->\n- Integration tests start real servers and cover sign-in, authorization, the hosted edge, connected apps and the\n  retention job (`scripts/test-v2.mjs`, `scripts/test-oauth.mjs`), and the hosted image has its own test\n  (`scripts/test-image.sh`). They are run by developers; no CI service runs them yet.\n\n## Reporting a vulnerability\n\nEmail [SECURITY CONTACT EMAIL]. See `SECURITY.md` in the repository for what to include and what to expect.\n\n## Not yet\n\nThese are not in place. Each is available to discuss for a specific customer.\n\n- No SOC 2 report and no ISO 27001 certification.\n- No independent penetration test.\n- No SSO (SAML or OIDC) and no SCIM provisioning. Available on request.\n- No per-workspace settings for session length or retention.\n- No customer-managed keys, and no encryption of the database beyond Fly's volume encryption, except Google and\n  GitHub access and refresh tokens, which are encrypted.\n- Browser session tokens are stored as issued, not hashed, and so is a Google ID token.\n- No off-site backups, no standby machine, and one region.\n- No site-wide Content-Security-Policy or HSTS header yet (the consent page has its own framing protections).\n- No automated dependency or secret scanning in CI, and no CI test run.\n- No bug bounty.\n- No written incident-response runbook; the commitment to customers is in the [DPA](dpa.md): notice within 72 hours.\n"
  },
  {
    "file": "docs/trust/subprocessors.md",
    "sha256": "fcab68fb44b4d7bf8d1d4e2724db8e473ac11804cc64db5e62c7391f2a123b73",
    "text": "# Subprocessors\n\n> Draft for counsel review, prepared 2026-10-30. It lists the services hosted Align uses to process personal data, as\n> the code and configuration in this repository set them up. [LEGAL ENTITY] publishes it; questions go to\n> [PRIVACY CONTACT EMAIL].\n\nA subprocessor is a company that processes personal data for Align when Align processes data for a customer. This page\ncovers hosted Align only. Align in local mode (Mode L) runs on your own machine, and Align sends nothing from it to\nanyone (see \"Local mode\" below).\n\n## Subprocessors\n\n| Subprocessor | What it does for Align | Personal data it processes | Location | When it is used |\n| --- | --- | --- | --- | --- |\n| Fly.io, Inc. | Hosting: runs Align's one server, stores its database on an encrypted volume with daily snapshots kept 7 days, terminates HTTPS at its edge, and keeps the machine's log output | Everything hosted Align stores (see the privacy policy) | United States: region `sjc`, San Jose, California | Always, when hosted <!-- fly.toml: primary_region = \"sjc\", [[mounts]] snapshot_retention = 7 --> |\n| The configured email API: Resend in the default configuration | Sends sign-in codes and creation-code messages | The recipient's email address and the message: a sign-in code and link, or a creation code with the recipient's name | United States | When the email settings are set (`ALIGN_EMAIL_API_URL`, `ALIGN_EMAIL_API_KEY`, `ALIGN_EMAIL_FROM`); the default configuration points at `https://api.resend.com/emails` <!-- fly.toml; lib/v2/core.mts postEmail --> |\n| Cloudflare, Inc. (Turnstile) | The check that a visitor is a person, on email-code sign-in, access requests and workspace creation | What the Turnstile widget collects in the browser, the token it issues, and the visitor's IP address, which Align passes with the token | Global network; Cloudflare, Inc. is in the United States | Only when both `ALIGN_TURNSTILE_SITE_KEY` and `ALIGN_TURNSTILE_SECRET_KEY` are set <!-- lib/v2/config.ts turnstile(); lib/v2/captcha.ts sends remoteip from Fly-Client-IP --> |\n\n## Authentication providers\n\nGoogle and GitHub are used for sign-in only, and only when a person chooses them. Align asks each for the person's\nidentity and nothing more: Google for `openid`, `email` and `profile`; GitHub for `read:user` and `user:email`\n(Better Auth's default scopes). Align receives a name, an email address, a profile picture address and the\nprovider's account id. It reads no other data from either service.\n\n| Provider | Used for | Hosts the server calls | When it is used |\n| --- | --- | --- | --- |\n| Google LLC | \"Continue with Google\" | `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com` | Only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set <!-- lib/v2/config.ts googleConfigured; @better-auth/core social-providers/google --> |\n| GitHub, Inc. | \"Continue with GitHub\" | `github.com`, `api.github.com` | Only when `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set <!-- lib/v2/config.ts githubConfigured; @better-auth/core social-providers/github --> |\n\n## Not subprocessors\n\n- **AI model providers.** Align's server calls no AI model: not Anthropic, not OpenAI, not any other. It sends no\n  workspace data to one, and it trains no model. <!-- no model-provider host anywhere in app/, lib/ or proxy.ts; test-v2 checks -->\n- **AI apps you connect.** When a person connects an AI app (Claude, ChatGPT, Claude Code, Codex) to Align, the app\n  reads one workspace through Align's MCP endpoint, as that person and with their permissions. The app is that\n  person's or their organization's own tool, under their own agreement with its maker, not a service Align uses.\n  To learn an app's name and its allowed return addresses, Align fetches the app's public client document from the\n  address the app gives (for Claude, an address on `claude.ai`). That request carries no personal data.\n  <!-- lib/oauth/clients.ts CIMD; specs/align/mcp.md -->\n- **Font hosting.** Align's fonts are downloaded when the app is built and served from Align's own address, so a\n  page view sends nothing to a font service. <!-- app/layout.tsx next/font/google self-hosts at build -->\n- **Analytics.** Align uses no third-party analytics, tracking or advertising service. Its product funnel events are\n  counted in its own database.\n\n## Every external host the hosted server can call\n\n| Host | Who | Why |\n| --- | --- | --- |\n| `api.resend.com` | Resend | Sending email, in the default configuration (any https email API can be configured instead) |\n| `challenges.cloudflare.com` | Cloudflare | Checking a Turnstile token (the browser also loads the widget from here) |\n| `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com` | Google | Google sign-in |\n| `github.com`, `api.github.com` | GitHub | GitHub sign-in |\n| The address an AI app names as its client document | The app's maker | Reading the app's public name and return addresses, never sending personal data |\n\n## Local mode\n\nIn local mode the database stays in `data/v2/align.sqlite` on the person's own machine. Sign-in codes are printed on\nthat machine, not emailed, and the bot check is off. The local server reaches the internet only to sign in with\nGoogle or GitHub, if the person configured them, and to read the client document of an AI app the person connects.\n[LEGAL ENTITY] receives nothing from a local server. <!-- lib/v2/mail.ts; lib/v2/config.ts turnstile() is hosted only -->\n\n## Changes to this list\n\n[LEGAL ENTITY] will update this page at least 30 days before a new subprocessor starts processing personal data, and\nwill email customers who have signed the DPA, or who ask for notice at [PRIVACY CONTACT EMAIL]. A customer may object\nwithin those 30 days, as the DPA describes. In an emergency (for example, to keep the service running when a\nprovider fails), a replacement may start sooner; customers are then told as soon as possible, with the same right to\nobject.\n"
  },
  {
    "file": "docs/RETENTION.md",
    "sha256": "bf3ffbcd0a357fea014b1b9df4d939492dd73977b5915187b078c58862174f9f",
    "text": "# How long Align keeps data\n\nThis is Align's published retention schedule. It describes what the code does: the retention job in\n`lib/v2/retention.ts`, account deletion in `lib/v2/account.ts`, workspace deletion in `lib/v2/workspaces.ts`, and the\nvolume snapshots in `fly.toml`. The contract is the \"Data retention\" requirement in `specs/align/workspaces.md`.\n\nAlign never stores prompt text, tool output or messages on the server. The `align` agent shares a session's harness, a\nhashed repository key, an optional repository alias, its times and state, its goal binding and its token usage and\nestimated cost. It sends no title.\n\n## The schedule\n\n| Data | Kept | Then |\n|---|---|---|\n| Prompt text, tool output, messages | Not stored on the server | Nothing to delete |\n| Shared sessions: harness, hashed repo key, repo alias, times, state, goal binding, binding periods, usage (model, tokens, estimated cost), the person who shared it | 13 months after the session ends: when sharing stopped, or else its last activity (its last upload, binding change or update) | Rolled up into totals per workspace, goal, UTC day, model and billing basis, with no person and no session. The raw rows (session, binding periods, usage, directive deliveries and receipts) are deleted |\n| Change-request evidence links (kind, URL, label, who added it, person or agent) and the snapshot Align records with each revision (the goal's 30-day spend, bound sessions, last activity) | The life of the change request | Deleted with the workspace. Whoever added a link becomes \"Former member #n\" like the rest of their rows |\n| Asks between teams (the team asked, the text, who asked as people said it, the meeting and date, who recorded and last decided it) and the times they came up again | Open and accepted ones while the workspace lives; a `done`, `declined` or `withdrawn` ask 13 months after its last change | Deleted by the daily job, with the times it came up again (`asks_deleted`), or with the workspace. Whoever recorded, decided or mentioned one becomes \"Former member #n\" like the rest of their rows |\n| Value reports on an approved change request (an estimate and an optional note of up to 500 characters, by one person) | 13 months after their last change | Deleted by the daily job (`value_reports_deleted`), with their change request, or with the workspace. Their author becomes \"Former member #n\" like the rest of their rows |\n| Requests to a goal's agents (type, goal and version, target goal, an optional note of up to 280 characters, who sent and cancelled it) and each session's answer | 13 months after it was sent | Deleted by the daily job (`requests_deleted`) with the directives that carried it, with their session (that session's answer), or with the workspace. Its sender becomes \"Former member #n\" like the rest of their rows |\n| The marker a deleted session's shared history leaves (a hash of the person who shared it and the session key, the workspace, the time; never the key or the person) | 13 months after the deletion | Deleted by the daily job (`deleted_session_markers_deleted`), or with the workspace. While it lasts, the account that shared the session is told its history is already deleted (410 `history_deleted`) when one of its devices asks to delete it again |\n| Goal holds (who held the goal, an optional reason of up to 280 characters, when) | While the goal is held | Deleted when it is released (by a person, or when the goal is achieved or dropped) or with the workspace; the audit log keeps the history. Whoever held it becomes \"Former member #n\" like the rest of their rows |\n| Spend roll-ups (no person, no session) | The life of the workspace | Deleted with the workspace |\n| Activity signals (in-flight edits, commits, tasks, claims) | 24 hours (claims 1 hour) | Deleted by the daily job, or with their session |\n| Workspace audit log | 1 year | Deleted |\n| A person who leaves or is removed | Their access ends at once: team places, device access and connected AI apps for that workspace. Their goals, sessions and history stay under their name for 30 days | After 30 days they are shown as \"Former member #n\" (numbered per workspace) in every row of that workspace, the audit log included; their sessions no longer point at their device, invites to or accepted by them are deleted, so their email leaves the workspace, and the keyed hash that stood for them is cleared from that workspace's product events. Their account stays until they delete it |\n| Sessions of a removed member, if the owner ticks \"Also delete their shared sessions in this workspace now\" | Deleted at removal | Spend already rolled up stays |\n| An account, when its owner deletes it (`/app/account`) | Deleted at once | Their memberships end as above, and in every workspace their rows become \"Former member #n\" at once. Their product events lose the keyed hash that stood for them. Their devices, sign-in sessions, linked sign-in methods, passkeys (with when each was last used), their answer to the \"add a passkey\" prompt, codes, access requests, unused creation codes bound to their email, email-keyed rate-limit counters and the account are deleted. A workspace where they were the only member is deleted with it (see the next row). The audit records that an account was deleted, with no name or email. Refused while they are the only owner of a workspace that has other members |\n| A deleted workspace (by an owner, with the account of its only member, or by the operator) | 30 days, during which its owners can restore it from Your workspaces | Every row is deleted by the daily job on day 30 or within the 24 hours after, its audit included (its content-free product events stay, under a random id, until their own 13 months are up). The operator can erase one at once (`align-admin workspaces delete <ws> --purge --yes`) |\n| Fly.io volume snapshots (hosted) | Daily snapshots, each kept 7 days (`fly.toml`: `scheduled_snapshots = true`, `snapshot_retention = 7`) | Expire, so deleted data leaves the snapshots within 7 days. A purged workspace is gone from every copy within 38 days of its deletion |\n| Off-site backups | None are made | |\n| Email sign-in codes | 5 minutes, 3 attempts | Deleted by the daily job once expired |\n| Sign-in sessions (with the client IP address and user agent when hosted) | 7 days, extended while used, and never more than 30 days after the sign-in (`ALIGN_SESSION_MAX_DAYS`). Signing out everywhere ends them all at once | A session past the 30 days is deleted when it is next presented; the daily job deletes the rest once expired or past the 30 days |\n| Pending invites | 7 days | Deleted 7 days after they expire. An accepted invite is kept while the person is a member, and deleted when they become a former member or with the workspace |\n| Passkeys (name, public key, when added and last used) | Until the person deletes the passkey | Deleted at once, or with the account |\n| Access requests (`/app/request-access`: email, name, company, team size, what for, interest) | 13 months after the operator approved or declined it, or, while still pending, 13 months after it was made | Deleted by the daily job, or at once when that email's Align account is deleted |\n| Creation codes (an HMAC of the code, the email it is bound to, dates, the workspace it created) | Kept as the record of who could create what | An unused code bound to an account's email is deleted with that account; a used one then keeps no email or redeemer. Purging a workspace clears the code's workspace |\n| Product events (`v2_events`: an event name such as \"workspace created\" or \"first session bound to a goal\", the workspace id, a keyed hash of the person, the time, and a few allowlisted kinds or counts; never an email, name, title, goal text, URL, repository, code or token) | 13 months | Deleted by the daily job. When a person deletes their account, their keyed hash is cleared from every event at once, so no event can be tied to them (the event itself stays, without a person). When a workspace is purged, its events stay with its id replaced by a random one (`wsx_\u2026`) that names nothing. When a person who left or was removed becomes \"Former member #n\" in a workspace (30 days on), their hash is cleared from that workspace's events the same way |\n| Durable rate-limit counters (an HMAC of an email address or a client address, and a time) | 24 hours | Pruned as new calls are counted; the ones keyed by an account's email are deleted with the account |\n| Paired devices (name, public key, last seen) | Until the person revokes the device; a revoked device's row stays, without working tokens | Deleted with the account |\n| AI apps that registered themselves (`_oauth_clients.json`: an app's name and redirect addresses, nothing about people) | Kept | |\n| Server logs | When hosted, Align logs no request body, path, address, email or code; a server error logs only its error name, and the retention job logs counts only | Fly.io keeps a machine's log output on its platform for a limited time; Align keeps no copy |\n| Email provider message logs | The provider's own retention (set it to the shortest it offers) | The provider deletes them |\n| Local mode (Mode L) | Everything stays in `data/v2/align.sqlite` on the person's own machine; nothing is sent to Align | The same job runs there, on that machine |\n\n## When the job runs\n\n- At every server start, and then every 24 hours while the server runs (`instrumentation.ts`). It never runs during a\n  build.\n- By hand, with the operator script: `node scripts/align-admin.mjs retention run` runs it now and prints what it did;\n  `--dry-run` prints what it would do and changes nothing (`node scripts/retention.mjs [--dry-run]` is the same\n  command). It reads `ALIGN_DATA_DIR` (default `./data`) and runs the same code as the server\n  (`lib/v2/retention-core.mts`). Run it with the server's environment, because it reads `ALIGN_SESSION_MAX_DAYS` the\n  way the server does: on the hosted machine, `fly ssh console -C \"node scripts/align-admin.mjs retention run\"` (the\n  image carries the script) has that environment.\n- The operator can also erase one workspace at once, without waiting for its restore window:\n  `node scripts/align-admin.mjs workspaces delete <ws> --purge --yes`, the same purge the job does on day 30.\n- Each step is its own short transaction and running the job again changes nothing.\n\nDeleted data can't be recovered by Align once the job has removed it: Align keeps no other copy than the volume\nsnapshots above.\n"
  }
];
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

};

// Private verifier module: /__private__/trust-text-parser/slug.js
modules["/__private__/trust-text-parser/slug.js"] = function(require,module,exports,__filename,__dirname) {
'use strict';
function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-') || 'section';
}
module.exports = { slug };

};

// Private verifier module: /__private__/trust-text-parser/safe_href.js
modules["/__private__/trust-text-parser/safe_href.js"] = function(require,module,exports,__filename,__dirname) {
'use strict';
const { slug } = require('./slug.js');
function safe_href(href, opts) {
  const h = href.trim();
  if (!h || /[\u0000-\u001F\u007F\s]/.test(h)) return null;
  if (/^https?:\/\/[^/]/i.test(h) || /^mailto:[^:]+@/i.test(h)) return h;
  if (h[0] === '#') return h.length > 1 ? '#' + opts.prefix + '-' + slug(h.slice(1)) : null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith('//')) return null;
  let [path, frag] = h.split('#', 2);
  path = path.replace(/^\.\//, '');
  const place = opts.resolve == null ? null : opts.resolve(path);
  if (!place) return null;
  return place.page + '#' + (frag ? place.prefix + '-' + slug(frag) : place.prefix);
}
module.exports = { safe_href };

};

// Private verifier module: /__private__/trust-text-parser/plain.js
modules["/__private__/trust-text-parser/plain.js"] = function(require,module,exports,__filename,__dirname) {
'use strict';
function plain(content) {
  return content.map(node => node.t === 'text' || node.t === 'code' ? node.v : plain(node.c)).join('');
}
module.exports = { plain };

};

// Private verifier module: /__private__/trust-text-parser/fixture.cjs
modules["/__private__/trust-text-parser/fixture.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
const assert=require('node:assert/strict'),h=require('./legacy-observations.cjs');
const {slug}=require('./slug.js'),{safe_href:safeHref}=require('./safe_href.js'),{plain}=require('./plain.js');
const plans=require('./historical-plans.json'),docs=require('./current-documents.json');
const resources={slug,safeHref,plain};
function blockText(blocks){return blocks.map(b=>b.t==='list'?b.items.map(i=>plain(i.c)+(i.sub?blockText([i.sub]):'')).join(' '):b.t==='quote'?blockText(b.c):b.t==='table'?[...b.head,...b.rows.flat()].map(plain).join(' '):b.c?plain(b.c):b.v??'').join(' ');}
async function run(make){
 const api=make(resources);assert.deepEqual(Object.keys(api),['parseInline','parseMarkdown']);assert.equal(api.parseInline.length,2);assert.equal(api.parseMarkdown.length,2);const methods={slug,safeHref,plain,parseInline:api.parseInline,parseMarkdown:api.parseMarkdown},records=[];
 for(const p of plans){const value=h.runBatch(methods,...p.arguments,true);assert.deepEqual(value,p.expected_result,p.case_id);records.push({name:p.case_id,result:value});}
 const cases=[
  ['entity-period','[LEGAL ENTITY].',{'[LEGAL ENTITY]':'Liminal Works, Inc.'},'Liminal Works, Inc.'],
  ['entity-next-sentence','[LEGAL ENTITY]. Write to us.',{'[LEGAL ENTITY]':'Liminal Works, Inc.'},'Liminal Works, Inc. Write to us.'],
  ['consume-only-one-following-period','[T]..',{'[T]':'Name.'},'Name..'],
  ['literal-duplicate-periods-stay','Liminal Works, Inc..',{'[LEGAL ENTITY]':'Liminal Works, Inc.'},'Liminal Works, Inc..'],
  ['replacement-without-period','[T].',{'[T]':'Name'},'Name.'],
  ['without-period-preserves-two','[T]..',{'[T]':'Name'},'Name..'],
  ['prefix-and-suffix','prefix [T].suffix',{'[T]':'Name.'},'prefix Name.suffix'],
  ['two-replacements','[T]. [T].',{'[T]':'Name.'},'Name. Name.'],
  ['adjacent-replacements','[T][U].',{'[T]':'Name.','[U]':'Other.'},'Name.Other.'],
  ['email-keeps-sentence-period','[MAIL].',{'[MAIL]':'ops@example.invalid'},'ops@example.invalid.'],
  ['empty-replacement','[T].',{'[T]':''},'.'],
  ['inline-code-is-not-filled','`[T].` [T].',{'[T]':'Name.'},'[T]. Name.'],
  ['filled-link-label','[ORG.](https://example.test/Inc..)',{'ORG':'Name.'},'Name.'],
  ['filled-bold','**[T].**',{'[T]':'Name.'},'Name.'],
  ['filled-emphasis','*[T].*',{'[T]':'Name.'},'Name.'],
  ['escaped-placeholder-bracket','\\[T].',{'[T]':'Name.'},'Name.'],
  ['unicode-period','[T].',{'[T]':'法人.'},'法人.'],
  ['literal-regex-key','xa.b.',{'a.b':'Name.'},'xName.'],
  ['already-two-replacement-periods','[T].',{'[T]':'Name..'},'Name..'],
  ['no-following-dot','[T] hello',{'[T]':'Name.'},'Name. hello'],
 ];
 for(const [name,text,fill,expected]of cases){const opts={prefix:'current',fill},before=h.encode(opts),value=api.parseInline(text,opts);assert.equal(plain(value),expected,name);assert.deepEqual(h.encode(opts),before,name+' mutation');records.push({name:'current-fill-'+name,result:h.encode(value)});}
 const special=[['empty-key', '.',{'':'Name.'}],['overlap-left-first','[T].',{'[':'Left.','[T]':'Right.'}],['overlap-long-first','[T].',{'[T]':'Right.','[':'Left.'}]];
 for(const [name,text,fill]of special){const opts={prefix:'current',fill},before=h.encode(opts),value=api.parseInline(text,opts);assert.deepEqual(h.encode(opts),before);records.push({name:'current-fill-'+name,result:h.encode(value)});}
 for(const indent of [0,1,2,4]){const root=' '.repeat(indent),nested=' '.repeat(Math.max(2,indent+2)),text=root+'- first\n'+nested+'- nested\n'+root+'- second',value=api.parseMarkdown(text,{prefix:'lists'});assert.equal(value.length,1);assert.equal(value[0].t,'list');assert.equal(value[0].items.length,2);assert.equal(value[0].items[0].sub.items.length,1);records.push({name:'current-indented-root-'+indent,result:h.encode(value)});}
 const fill={'[LEGAL ENTITY]':'Liminal Works, Inc.','[PRIVACY CONTACT EMAIL]':'ops@theliminalspace.io','[SECURITY CONTACT EMAIL]':'ops@theliminalspace.io'};
 for(const d of docs){const value=api.parseMarkdown(d.text,{prefix:'current-doc',fill,resolve:()=>({page:'/trust',prefix:'owned'})});assert(!blockText(value).includes('Liminal Works, Inc..'),d.file);records.push({name:'current-trust-document-'+d.file,result:h.encode(value)});}
 const fenced=api.parseMarkdown('```\n[LEGAL ENTITY].\n```',{prefix:'current',fill});assert.equal(fenced[0].v,'[LEGAL ENTITY].');records.push({name:'current-fence-preserves-raw-placeholder',result:h.encode(fenced)});

 // Original-backed callback order, including its exception boundary.
 for(const [name,text,expected] of [
  ['nested-before-root','- [root](r)\n  - [child](c)\n- [last](l)',['c','r','l']],
  ['all-nested-siblings-before-root','- [root1](r1)\n  - [child1](c1)\n    - [child2](c2)\n- [root2](r2)\n  - [child3](c3)',['c1','c2','r1','c3','r2']],
 ]) {
  const calls=[],opts={prefix:'order',resolve(path){calls.push(path);return null;}};
  const value=api.parseMarkdown(text,opts);assert.deepEqual(calls,expected,name);
  records.push({name:'current-callback-order-'+name,result:{calls,nodes:h.encode(value)}});
 }
 {
  const calls=[],sentinel={owned:'callback-error'},opts={prefix:'order',resolve(path){calls.push(path);if(path==='c')throw sentinel;return null;}};
  let caught;try{api.parseMarkdown('- [root](r)\n  - [child](c)\n- [last](l)',opts);}catch(error){caught=error;}
  assert.strictEqual(caught,sentinel);assert.deepEqual(calls,['c']);
  records.push({name:'current-callback-order-child-throw-before-root',result:{calls,original_thrown_value_preserved:caught===sentinel}});
 }
 assert.equal(records.length,45);return {schema:'align/current-trust-parser-original-observations@1',records,historical_parser_observations:27682,new_observations:37};
}
module.exports={run,resources};

};

// Private verifier module: /__private__/trust-text-parser/qualification-fixture.cjs
modules["/__private__/trust-text-parser/qualification-fixture.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
const assert=require('node:assert/strict'),previous=require('./fixture.cjs');
const recorded=new WeakMap();
function semanticBatches(){return [Array.from({length:45},(_,index)=>({operation:0,settings:{index}}))];}
function fixture({index}){return {async run(factory){if(!recorded.has(factory))recorded.set(factory,previous.run(factory).then(value=>{assert.equal(value.records.length,45);return value.records;}));const rows=await recorded.get(factory);assert(Number.isInteger(index)&&index>=0&&index<rows.length);return rows[index];}};}
module.exports={semanticBatches,fixture};

};

// Private JSON data, rendered as literal objects for inspection.
const jsonData = {
  "/__private__/trust-text-parser/historical-plans.json": [
    {
      "case_id": "trust-markdown.parse-inline-000",
      "arguments": [
        "parseInline",
        0,
        4096
      ],
      "expected_result": {
        "observations": 4096,
        "sha256": "15c2ce76522f341abd7249a146605a214d564d4058db857b3f4050975ab50887"
      }
    },
    {
      "case_id": "trust-markdown.parse-inline-001",
      "arguments": [
        "parseInline",
        4096,
        4096
      ],
      "expected_result": {
        "observations": 4096,
        "sha256": "9b0d8adbc3fdffc0fb2c6a8205cc34acb55c758159cda52798b41f0293758faa"
      }
    },
    {
      "case_id": "trust-markdown.parse-inline-002",
      "arguments": [
        "parseInline",
        8192,
        4096
      ],
      "expected_result": {
        "observations": 4096,
        "sha256": "3b5f396d1d94c039e696429d2822353ffa2e4831a70753d2ddae5099fed0ea78"
      }
    },
    {
      "case_id": "trust-markdown.parse-inline-003",
      "arguments": [
        "parseInline",
        12288,
        1954
      ],
      "expected_result": {
        "observations": 1954,
        "sha256": "40f3ab809b4ef704a2cbe8a38a7c386487a142a8bd03474aa50a2748056fb4b7"
      }
    },
    {
      "case_id": "trust-markdown.parse-markdown-000",
      "arguments": [
        "parseMarkdown",
        0,
        4096
      ],
      "expected_result": {
        "observations": 4096,
        "sha256": "51d3698f6c4ad01d46299138846a5d7587cd5b3f8c46568087ecaf146eccf8bb"
      }
    },
    {
      "case_id": "trust-markdown.parse-markdown-001",
      "arguments": [
        "parseMarkdown",
        4096,
        4096
      ],
      "expected_result": {
        "observations": 4096,
        "sha256": "2b95b399ddb0d51ae5cbd25bc6be2ff5226ff98df9aefe395f1576a7588d80de"
      }
    },
    {
      "case_id": "trust-markdown.parse-markdown-002",
      "arguments": [
        "parseMarkdown",
        8192,
        4096
      ],
      "expected_result": {
        "observations": 4096,
        "sha256": "92cbc6ada560fb8fe0b2700ab902f0f49160c2bce6581fb01e9d20c6d3897b77"
      }
    },
    {
      "case_id": "trust-markdown.parse-markdown-003",
      "arguments": [
        "parseMarkdown",
        12288,
        1302
      ],
      "expected_result": {
        "observations": 1302,
        "sha256": "b93f37493198045e8e8befa2bf60af18f89eaa9001849c31583df514ff1a44fa"
      }
    }
  ],
  "/__private__/trust-text-parser/current-documents.json": [
    {
      "file": "privacy-policy.md",
      "text": "# Privacy policy\n\n> **Draft for counsel review.** Prepared 2026-10-30 from the code and configuration of Align. It is not legal advice\n> and is not yet in force. The bracketed placeholders are filled in when it is published.\n\nThis policy explains what personal data Align collects, why, how long it is kept, who else handles it, and the\nchoices and rights you have. \"Align\", \"we\" and \"us\" mean [LEGAL ENTITY]. Write to us at\n[PRIVACY CONTACT EMAIL].\n\n<!-- Counsel: decide whether an EU (GDPR Art. 27) or UK representative is needed, and add it here. -->\n\n## Our two roles\n\n- **Controller** for your account, for this website and its sign-in, for the request-access form, for security and\n  abuse prevention, and for product events. We decide why and how that data is used, and this policy covers it.\n- **Processor** for workspace data: the goals, members, teams, change requests, shared sessions and everything else\n  people put in a workspace. We process it on behalf of the organization the workspace belongs to (our customer),\n  under our agreement with them and the [data processing agreement](dpa.md). That organization's own privacy notice\n  governs it; we help them answer requests about it.\n- **Local mode.** Align can run on your own computer instead of on our servers. Then everything stays on your\n  computer, and we receive none of it.\n\n## What we collect\n\n| Data | What it is | Where it comes from |\n| --- | --- | --- |\n| Account | Your email address and name; if you sign in with Google or GitHub, the provider's account id, your profile picture address and the tokens the provider issued at sign-in (kept by our sign-in software, the access and refresh tokens encrypted; we do not use them afterwards). If you sign in with an email code and give no name, your name starts as the part of your email before the @ | You, Google or GitHub <!-- lib/v2/auth.ts; Better Auth ba_user, ba_account --> |\n| Passkeys | Each passkey's public key, its name, when it was added and when it was last used, and whether you dismissed the \"add a passkey\" prompt | You <!-- lib/v2/account.ts --> |\n| Sign-in sessions | A session token in a cookie and, on our servers, your IP address and browser's user agent | Your browser <!-- docs/RETENTION.md --> |\n| Email sign-in codes | A hash of each code, for 5 minutes | Us <!-- lib/v2/auth.ts --> |\n| Devices | The name you give a computer that runs the `align` agent, its public key, when it was last seen, and hashes of its tokens | You <!-- lib/v2/devices.ts --> |\n| Connected AI apps | For each app you connect: its name and return address as it gives them, the workspace, when you connected it and last used it, a hash of its refresh token, and the scopes you granted | You and the app <!-- lib/oauth/grants.ts --> |\n| Workspace data (we are processor) | Workspace name, members and their roles, teams, invites (the invitee's email), goals and their versions, alignments, change requests with their notes and decisions, evidence links on change requests, labelled self-reported or agent-reported, and goal snapshots Align computes, directives, and the audit log | People in the workspace <!-- lib/v2/db.ts --> |\n| Shared sessions (we are processor) | For each agent session a person chooses to share: which agent it was (Claude Code or Codex), a hashed repository key, an optional repository alias, times, state, the goal it works toward, and token usage with estimated cost | The `align` agent on the person's computer <!-- docs/RETENTION.md --> |\n| Work signals (we are processor) | For 24 hours: hashes of files a shared session touched, and, only if the person turns on \"share work signals\", file paths and short text such as a task or commit title | The `align` agent <!-- lib/v2/activity.ts --> |\n| Access requests | Email, name, company, team size, what you want to use Align for, and your interest (try or evaluate) | You, on the request-access form <!-- app/app/request-access/view.tsx --> |\n| Creation codes | A keyed hash of each code, the email it is for, its dates, and the workspace it created | Us <!-- lib/v2/db.ts v2_creation_codes --> |\n| Abuse prevention | Rate-limit counters keyed by a keyed hash of an email address or network address; when the bot check is on, what Cloudflare Turnstile collects in your browser and your IP address | Your browser <!-- lib/v2/limits.ts; lib/v2/captcha.ts --> |\n| Product events | An event name (such as \"workspace created\" or \"first session shared\"), the workspace, a keyed hash that stands for the person, the time, and a few allowlisted properties such as the interest chosen on the request form. Never an email, name, title, address or token | Our server |\n| Messages we send | Sign-in codes and creation codes, sent to your email address | Us |\n\n**What we never collect on our servers:** the prompts you or your colleagues write to coding agents, the agents'\nreplies and tool output, your code and file contents, or a session's title. **Cookies:** only the ones needed to\nsign in: your session cookie and short-lived cookies set during a Google, GitHub or passkey sign-in. We use no\nanalytics, advertising or tracking cookies and no third-party analytics.\n\n## Why we use it, and our legal bases\n\n| Purpose | Data | Legal basis (EU and UK GDPR) |\n| --- | --- | --- |\n| Create your account, sign you in, keep you signed in | Account, passkeys, sessions, codes, devices | Contract |\n| Provide workspaces to our customers | Workspace data, shared sessions, work signals, connected apps | Contract with our customer (as processor, on their instructions) |\n| Answer a request for access and send a creation code | Access requests, creation codes | Steps before a contract, at your request; legitimate interests in choosing whom to onboard |\n| Keep Align secure and stop abuse | Sessions (IP address, user agent), rate-limit counters, the bot check, the audit log | Legitimate interests in security, and the customer's interest in an audit trail |\n| Understand whether people get value from Align, in aggregate | Product events, which hold no content and no direct identifiers | Legitimate interests in improving the product |\n| Meet legal obligations | Any of the above, as required | Legal obligation |\n\nWe do not sell personal data, share it for advertising, or use it to train AI models. Align's server sends no data to\nany AI model provider.\n\n## Who else handles it\n\n- **Our subprocessors**: Fly.io (hosting), our email provider (Resend in the default configuration) and, when the bot\n  check is on, Cloudflare Turnstile. See the [subprocessor list](subprocessors.md).\n- **Google and GitHub**, if you choose to sign in with them.\n- **People in your workspace**, according to their role and the visibility of each goal.\n- **AI apps you connect**, which read one workspace as you, with your permissions. You choose them, and their makers\n  handle what they read under their own terms.\n- **Authorities**, when the law requires it, and a successor if [LEGAL ENTITY] is merged or sold, under this policy.\n\n## How long we keep it\n\nOur full retention schedule is published at [RETENTION.md](../RETENTION.md) and applied by a daily job. In short:\n\n- Sign-in sessions: 7 days from last use, never more than 30 days from sign-in. Email codes: 5 minutes.\n- Shared session details: 13 months after the session ends, then only totals with no person attached.\n- Work signals: 24 hours.\n- Workspace audit log: 1 year.\n- People who leave a workspace: shown as \"Former member\" there after 30 days.\n- A deleted workspace: restorable for 30 days, then deleted, and gone from our backups within 38 days.\n- Access requests: deleted 13 months after we approve or decline them, or 13 months after they were made if still\n  pending.\n- Product events: 13 months.\n- Your account: until you delete it.\n- Backups: daily snapshots of our database, each kept 7 days.\n\n## Your rights\n\nYou can ask us for a copy of your personal data, to correct it, to delete it, to restrict or object to its use, and\nto receive it in a portable form; where we rely on consent, you can withdraw it. You can also complain to your data\nprotection authority.\n\n- **Delete your account yourself** at `/app/account` (it asks you to sign in again first). The account, its devices,\n  sessions, passkeys and sign-in methods are deleted at once, and your name is replaced with \"Former member\" in every\n  workspace you belonged to. Your access requests are deleted with it. If you are the only owner of a workspace that\n  has other members, make someone else an owner or delete the workspace first. <!-- lib/v2/account.ts deleteAccount -->\n- **Everything else:** email [PRIVACY CONTACT EMAIL]. We answer within one month.\n- **Workspace data:** ask the organization that owns the workspace; we will help them answer.\n\nIf you live in California, you have similar rights to know, delete and correct, and we do not sell or share your\npersonal information as California law defines those terms.\n\n## International transfers\n\nHosted Align runs in the United States (Fly.io region `sjc`), and our subprocessors are in the United States. When we\ntransfer personal data from the EEA, the UK or Switzerland, we rely on the European Commission's 2021 Standard\nContractual Clauses, with the UK Addendum and the Swiss adjustments, as the [DPA](dpa.md) sets out.\n\n## Security\n\nHow we protect data is described in our [security overview](security-overview.md).\n\n## Children\n\nAlign is a tool for work. It is not meant for anyone under 16, and we do not knowingly collect their data. If you\nthink a child has given us personal data, write to [PRIVACY CONTACT EMAIL] and we will delete it.\n\n## Changes to this policy\n\nWe will post any change here with a new date. If a change matters to how we use your data, we will tell account\nholders by email before it takes effect.\n\n## Contact\n\n[LEGAL ENTITY]. Privacy questions and requests: [PRIVACY CONTACT EMAIL].\n"
    },
    {
      "file": "security-overview.md",
      "text": "# Security overview\n\n> Prepared 2026-10-30 from the code and configuration in this repository, for review before it is published. It says\n> what Align does today and, at the end, what it does not do yet. [LEGAL ENTITY] publishes it. Report a security\n> problem to [SECURITY CONTACT EMAIL].\n\nAlign keeps goals, who may change them, and the coding agents working toward them in step. It never needs to see\nwhat people say to their agents: the server stores no prompt text, tool output, messages or code.\n\n## In short\n\n- One server on one Fly.io machine, behind Fly's HTTPS edge, with one SQLite database on a Fly volume that Fly\n  encrypts at rest.\n- No prompts, tool output, messages, code or file contents are stored on the server.\n- People sign in as themselves: an emailed one-time code, Google, GitHub, or a passkey. There are no passwords.\n- Sessions last 7 days from last use and never more than 30 days from sign-in. Sensitive actions need a sign-in from\n  the last 15 minutes. \"Sign out everywhere\" ends every session at once.\n- Every request is authorized in one policy module by workspace role, team role and goal visibility.\n- Device, AI app and invite tokens are stored only as hashes. Refresh tokens rotate, and reusing an old one revokes\n  the device or the app.\n- Connected AI apps get read-only access to one workspace, as the person who connected them; adding evidence links\n  needs a separate scope.\n- Data is deleted on a published schedule ([retention](../RETENTION.md)), and an account can be deleted in the app.\n- Local mode keeps everything on the person's own machine.\n- Not yet: SOC 2, ISO 27001, a penetration test, SSO/SAML/SCIM. See \"Not yet\" below.\n\n## Architecture\n\n| Part | What it is |\n| --- | --- |\n| Server | One Next.js process on one Fly.io machine (region `sjc`, San Jose, California), 1 CPU and 1 GB. A second server on the same data refuses to start. <!-- fly.toml; lib/startup.ts pid file --> |\n| Edge | Fly's proxy terminates TLS and redirects plain HTTP to HTTPS. Align answers only for its own host names, only for requests that came through Fly's edge over HTTPS, and only on an allowlist of paths: everything else is 404, so a route added later stays closed until it is listed. <!-- fly.toml force_https; proxy.ts --> |\n| Database | One SQLite file, `/data/v2/align.sqlite`, file mode 0600 in a 0700 directory, on a Fly volume. Fly states that volumes are created with encryption at rest by default; that is Fly's control, not Align's. <!-- lib/v2/db.ts; https://fly.io/docs/volumes/overview/ --> |\n| Image | Built from an allowlisted context: no tests, docs, local agent packages or `.env` files reach the image. It runs as the unprivileged `node` user. <!-- Dockerfile; .dockerignore --> |\n| Secrets | `ALIGN_SECRET`, `BETTER_AUTH_SECRET` (32+ characters each), the email API key and any Google, GitHub or Turnstile secrets are set with `fly secrets`, never in the repository or the image. A server missing a required setting refuses to start. <!-- lib/config.ts; lib/v2/config.ts v2Problems --> |\n| Outside services | Fly.io, the configured email API (Resend by default), Cloudflare Turnstile when enabled, and Google and GitHub for sign-in when configured. No AI model provider. See [subprocessors](subprocessors.md). |\n\n## What Align stores, and what it does not\n\n| Stored | Not stored |\n| --- | --- |\n| Account: email, name, profile picture address from Google or GitHub, linked sign-in methods, passkeys (public keys) | Passwords (there are none) |\n| Workspace: members and roles, teams, invites, goals and their versions, alignments, change requests and decisions, directives | Prompt text, tool output, messages, code, file contents |\n| Shared sessions: harness, a hashed repository key, an optional repository alias, times, state, goal binding, token usage and estimated cost | A session title: the `align` agent sends none <!-- docs/RETENTION.md --> |\n| Work signals for 24 hours: keyed hashes of files touched; file paths and short text only if the person turns on \"share work signals\" | Anything from a session the person did not choose to share |\n| Change request evidence: typed links (pull request, CI run, incident, dashboard, document or other) labelled self-reported or agent-reported, and a goal snapshot Align computes itself | Any claim that evidence is verified: Align labels it, it does not check it |\n| Product events: an event name, the workspace, a keyed hash of the person, the time and a few allowlisted properties | Emails, names, titles, URLs or tokens in those events |\n| Audit log: who did what to which object, and when | The content of goals or requests in the audit log |\n\n## Signing in\n\n- **Email one-time codes.** 6 digits, valid 5 minutes, 3 attempts, stored as a SHA-256 hash. Sends are limited\n  per address and per client, durably when hosted (see \"Rate limits\"). The answer to a send never says whether an\n  account exists. A code makes a new account only for a pending invite, an approved access request's creation code,\n  or the server's first owner. <!-- lib/v2/auth.ts -->\n- **Google and GitHub.** Standard OAuth sign-in through Better Auth, asking only for identity (Google `openid`,\n  `email`, `profile`; GitHub `read:user`, `user:email`). Accounts are linked only explicitly, from the account page,\n  never by a matching email. An account whose email the provider did not verify can't be taken over with an email\n  code. <!-- lib/v2/auth.ts -->\n- **Passkeys.** WebAuthn passkeys, added from the account page after a recent sign-in, with the public host as the\n  relying party. Signing in with a passkey is phishing-resistant. <!-- lib/v2/auth.ts passkey() -->\n- **No passwords.** A password sign-in exists only as a local test switch, which a hosted server refuses to start\n  with. <!-- lib/v2/config.ts v2Problems ALIGN_TEST_IDP -->\n- **Sessions.** A random token in a signed `HttpOnly`, `Secure`, `SameSite=Lax` cookie\n  (`__Secure-align_v2.session_token`), kept in the database as Better Auth issues it.\n  A session lasts 7 days, extended while it is used, and never more than 30 days after the sign-in that made it\n  (`ALIGN_SESSION_MAX_DAYS`, 1 to 365). **Sign out everywhere** ends all of a person's sessions and can also unpair\n  their devices and disconnect their AI apps. <!-- lib/v2/auth.ts; lib/v2/account.ts signOutEverywhere -->\n- **Recent sign-in for sensitive actions.** A sign-in from the last 15 minutes is needed to approve a device or an AI\n  app, change a role, remove a member, invite an owner, delete or restore a workspace, add a passkey, link an\n  account, sign out everywhere, and delete the account. <!-- lib/v2/config.ts RECENT_SIGN_IN_MS; requireRecentSignIn callers -->\n\nEmail codes alone are a single factor (NIST AAL1). People who want a phishing-resistant sign-in can add a passkey.\n\n## Who may do what\n\n- **Workspace roles.** Owners manage the workspace (invites, teams, roles, removal, deletion, the audit log);\n  members create goals and share sessions; viewers read. **Team roles:** leads manage their team's members and team\n  goals. <!-- lib/v2/policy.ts WORKSPACE_ROLE_ACTIONS, POD_ROLE_ACTIONS -->\n- **Goal visibility.** Private (its owner only), team, or workspace. A workspace owner does not read others' private\n  goals. <!-- lib/v2/policy.ts -->\n- **One decision point.** Every route asks the same policy module. Something the caller may not see answers 404, so\n  its existence does not leak; something visible but not allowed answers 403. <!-- lib/v2/policy.ts -->\n- **Leaving.** When a person leaves or is removed, their access ends at once: team places, device access and\n  connected AI apps for that workspace. <!-- lib/v2/lifecycle.ts -->\n\n## Tokens and keys\n\n| Credential | How it works |\n| --- | --- |\n| Device pairing (the `align` CLI) | A device makes an Ed25519 key pair and a person approves its code in the browser after a recent sign-in. Access tokens last 1 hour. Refresh tokens last 30 days, rotate on every use, and each refresh is signed with the device's private key. Presenting a refresh token that was already used revokes the device. Only SHA-256 hashes of tokens are stored. <!-- lib/v2/devices.ts --> |\n| Connected AI apps (OAuth 2.1) | Authorization code with PKCE (S256) only, public clients, refresh token rotation, resource binding. A person approves one app for one workspace after a recent sign-in. Access tokens last 1 hour and are checked against the grant and the person's membership on every call. Refresh tokens last 7 days from the grant and are never extended; reusing an old one deletes the grant. Refresh tokens are stored only as keyed hashes. <!-- lib/oauth/server.ts; lib/oauth/grants.ts --> |\n| What an app may do | Read only, through nine tools: goals, a goal, change requests, decision records, directives, goal limits, asks between teams, agent activity counts toward goals and a short brief. An app may add agent-reported evidence links to change requests through a tenth tool only if the person grants the separate `changes:evidence` scope, and each grant records the scopes it was given. <!-- lib/mcp/register.ts --> |\n| Invite links, device pairing secrets, creation codes | Stored only as hashes (creation codes as an HMAC under `ALIGN_SECRET`). <!-- lib/v2/db.ts token_hash, device_code_hash, code_hash --> |\n| Server secrets | Rotating `ALIGN_SECRET` ends every connected app and unused creation code; rotating `BETTER_AUTH_SECRET` signs everyone out. <!-- lib/secret.ts; docs/HOSTING.md --> |\n| Google and GitHub tokens | Better Auth keeps the access and refresh tokens the provider issued at sign-in or linking in the database, encrypted (XChaCha20-Poly1305 under the server's `BETTER_AUTH_SECRET`). An ID token (Google issues one: a signed, short-lived statement of who signed in) is stored as issued. Align does not use these tokens after sign-in, and no route returns them: Better Auth's routes that would hand out, refresh or describe them (and the one that unlinks a provider) are turned off. <!-- lib/v2/auth.ts account.encryptOAuthTokens, DISABLED_PATHS --> |\n\n## Requests from browsers and AI apps\n\n- A write made with the sign-in cookie must carry this server's exact `Origin`, so another site can't make one.\n  <!-- lib/v2/http.ts -->\n- Device and MCP routes refuse requests from browsers. <!-- lib/v2/http.ts; specs/align/mcp.md -->\n- The AI app consent page can't be framed, cached or leaked in a `Referer`. <!-- next.config.ts -->\n- Text written by people comes back to AI apps marked as untrusted, so an agent can tell data from instructions.\n  <!-- lib/mcp/register.ts -->\n- Align sends agents only facts and an enforced stop: no free-text instructions, and nothing wakes an idle agent.\n- When Align fetches an AI app's client document, it refuses private network addresses, limits size and time, and\n  caches the result. <!-- lib/oauth/clients.ts -->\n\n## Rate limits and abuse controls\n\n- Email-code sends: 3 per address per 10 minutes, 10 per client per hour, and, hosted, 5 per address per hour and\n  3 per client per minute, counted in the database so a restart doesn't reset them. <!-- lib/v2/auth.ts -->\n- Better Auth's own limits on sign-in routes when hosted, also counted in the database. <!-- lib/v2/auth.ts rateLimit -->\n- Limits on workspace creation, invites, device pairing and device-code lookups. <!-- specs/align/workspaces.md -->\n- Hosted workspace creation needs a single-use creation code by default, and the operator can close creation\n  entirely. Caps on workspaces (100), workspaces per person (2), members per workspace (25) and new shared sessions\n  per device per day (500), each configurable. <!-- lib/v2/config.ts caps(), creationMode() -->\n- Disposable email domains can't request access or create a workspace. <!-- lib/v2/disposable.ts -->\n- Cloudflare Turnstile on email-code sign-in, access requests and workspace creation, when its keys are set. A\n  hosted server without them starts and logs a warning. <!-- lib/v2/captcha.ts; lib/startup.ts -->\n\n## Logging and the audit log\n\n- When hosted, the server logs no request body, path, address, email or code. A server error logs only the error's\n  name. Email failures log only the HTTP status. The retention job logs counts only. <!-- lib/v2/http.ts; lib/v2/core.mts postEmail; lib/v2/retention.ts -->\n- Fly.io keeps the machine's log output on its platform for a limited time; Align keeps no copy.\n- Each workspace has an audit log of who did what to which object, and when: membership and roles, invites, teams,\n  goal versions, change requests and alignments and their decisions, devices, connected apps, passkeys, stopped\n  agents, deletions and restores. Owners can read it. It is kept 1 year. A change request approved without evidence\n  is recorded as such. <!-- lib/v2/db.ts v2_audit; docs/RETENTION.md -->\n- Content-free product events are kept 13 months and are visible to the operator only.\n\n## Backups and recovery\n\n- Fly.io takes a daily snapshot of the volume, kept 7 days. <!-- fly.toml scheduled_snapshots, snapshot_retention = 7 -->\n- Align makes no other backup, off-site or otherwise. Restoring from a snapshot would lose the changes since it was\n  taken, up to a day.\n- One machine in one region: if it fails, Align is down until it is restored. There is no standby.\n- Fly checks the server's health every 30 seconds. <!-- fly.toml http_service.checks -->\n\n## Deletion and retention\n\nThe full schedule is [RETENTION.md](../RETENTION.md). In short: shared session rows are rolled up without the person\nafter 13 months; the audit log is kept 1 year; removed members are shown as \"Former member\" after 30 days; a deleted\nworkspace can be restored for 30 days and is then purged, and is gone from every snapshot within 38 days; an account\ndeleted in the app is deleted at once. Approved and declined access requests are deleted 13 months after the\ndecision, pending ones 13 months after they were made. Product events are kept 13 months.\n\n## Local mode\n\nAlign also runs on a person's own machine (Mode L). The database stays in `data/v2/align.sqlite` there and nothing is\nsent to [LEGAL ENTITY]. The local server answers only to loopback host names, so another website can't reach it under\nits own name. It prints sign-in codes instead of emailing them. It reaches the internet only for Google or GitHub\nsign-in, if configured, and to read the client document of an AI app the person connects. <!-- proxy.ts; lib/v2/mail.ts -->\n\n## How the code is made\n\n- The code is in git. Dependencies are locked with `package-lock.json`, and the sign-in library (Better Auth and its\n  passkey plugin) is pinned to an exact version. <!-- package.json -->\n- Integration tests start real servers and cover sign-in, authorization, the hosted edge, connected apps and the\n  retention job (`scripts/test-v2.mjs`, `scripts/test-oauth.mjs`), and the hosted image has its own test\n  (`scripts/test-image.sh`). They are run by developers; no CI service runs them yet.\n\n## Reporting a vulnerability\n\nEmail [SECURITY CONTACT EMAIL]. See `SECURITY.md` in the repository for what to include and what to expect.\n\n## Not yet\n\nThese are not in place. Each is available to discuss for a specific customer.\n\n- No SOC 2 report and no ISO 27001 certification.\n- No independent penetration test.\n- No SSO (SAML or OIDC) and no SCIM provisioning. Available on request.\n- No per-workspace settings for session length or retention.\n- No customer-managed keys, and no encryption of the database beyond Fly's volume encryption, except Google and\n  GitHub access and refresh tokens, which are encrypted.\n- Browser session tokens are stored as issued, not hashed, and so is a Google ID token.\n- No off-site backups, no standby machine, and one region.\n- No site-wide Content-Security-Policy or HSTS header yet (the consent page has its own framing protections).\n- No automated dependency or secret scanning in CI, and no CI test run.\n- No bug bounty.\n- No written incident-response runbook; the commitment to customers is in the [DPA](dpa.md): notice within 72 hours.\n"
    },
    {
      "file": "subprocessors.md",
      "text": "# Subprocessors\n\n> Draft for counsel review, prepared 2026-10-30. It lists the services hosted Align uses to process personal data, as\n> the code and configuration in this repository set them up. [LEGAL ENTITY] publishes it; questions go to\n> [PRIVACY CONTACT EMAIL].\n\nA subprocessor is a company that processes personal data for Align when Align processes data for a customer. This page\ncovers hosted Align only. Align in local mode (Mode L) runs on your own machine, and Align sends nothing from it to\nanyone (see \"Local mode\" below).\n\n## Subprocessors\n\n| Subprocessor | What it does for Align | Personal data it processes | Location | When it is used |\n| --- | --- | --- | --- | --- |\n| Fly.io, Inc. | Hosting: runs Align's one server, stores its database on an encrypted volume with daily snapshots kept 7 days, terminates HTTPS at its edge, and keeps the machine's log output | Everything hosted Align stores (see the privacy policy) | United States: region `sjc`, San Jose, California | Always, when hosted <!-- fly.toml: primary_region = \"sjc\", [[mounts]] snapshot_retention = 7 --> |\n| The configured email API: Resend in the default configuration | Sends sign-in codes and creation-code messages | The recipient's email address and the message: a sign-in code and link, or a creation code with the recipient's name | United States | When the email settings are set (`ALIGN_EMAIL_API_URL`, `ALIGN_EMAIL_API_KEY`, `ALIGN_EMAIL_FROM`); the default configuration points at `https://api.resend.com/emails` <!-- fly.toml; lib/v2/core.mts postEmail --> |\n| Cloudflare, Inc. (Turnstile) | The check that a visitor is a person, on email-code sign-in, access requests and workspace creation | What the Turnstile widget collects in the browser, the token it issues, and the visitor's IP address, which Align passes with the token | Global network; Cloudflare, Inc. is in the United States | Only when both `ALIGN_TURNSTILE_SITE_KEY` and `ALIGN_TURNSTILE_SECRET_KEY` are set <!-- lib/v2/config.ts turnstile(); lib/v2/captcha.ts sends remoteip from Fly-Client-IP --> |\n\n## Authentication providers\n\nGoogle and GitHub are used for sign-in only, and only when a person chooses them. Align asks each for the person's\nidentity and nothing more: Google for `openid`, `email` and `profile`; GitHub for `read:user` and `user:email`\n(Better Auth's default scopes). Align receives a name, an email address, a profile picture address and the\nprovider's account id. It reads no other data from either service.\n\n| Provider | Used for | Hosts the server calls | When it is used |\n| --- | --- | --- | --- |\n| Google LLC | \"Continue with Google\" | `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com` | Only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set <!-- lib/v2/config.ts googleConfigured; @better-auth/core social-providers/google --> |\n| GitHub, Inc. | \"Continue with GitHub\" | `github.com`, `api.github.com` | Only when `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set <!-- lib/v2/config.ts githubConfigured; @better-auth/core social-providers/github --> |\n\n## Not subprocessors\n\n- **AI model providers.** Align's server calls no AI model: not Anthropic, not OpenAI, not any other. It sends no\n  workspace data to one, and it trains no model. <!-- no model-provider host anywhere in app/, lib/ or proxy.ts; test-v2 checks -->\n- **AI apps you connect.** When a person connects an AI app (Claude, ChatGPT, Claude Code, Codex) to Align, the app\n  reads one workspace through Align's MCP endpoint, as that person and with their permissions. The app is that\n  person's or their organization's own tool, under their own agreement with its maker, not a service Align uses.\n  To learn an app's name and its allowed return addresses, Align fetches the app's public client document from the\n  address the app gives (for Claude, an address on `claude.ai`). That request carries no personal data.\n  <!-- lib/oauth/clients.ts CIMD; specs/align/mcp.md -->\n- **Font hosting.** Align's fonts are downloaded when the app is built and served from Align's own address, so a\n  page view sends nothing to a font service. <!-- app/layout.tsx next/font/google self-hosts at build -->\n- **Analytics.** Align uses no third-party analytics, tracking or advertising service. Its product funnel events are\n  counted in its own database.\n\n## Every external host the hosted server can call\n\n| Host | Who | Why |\n| --- | --- | --- |\n| `api.resend.com` | Resend | Sending email, in the default configuration (any https email API can be configured instead) |\n| `challenges.cloudflare.com` | Cloudflare | Checking a Turnstile token (the browser also loads the widget from here) |\n| `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com` | Google | Google sign-in |\n| `github.com`, `api.github.com` | GitHub | GitHub sign-in |\n| The address an AI app names as its client document | The app's maker | Reading the app's public name and return addresses, never sending personal data |\n\n## Local mode\n\nIn local mode the database stays in `data/v2/align.sqlite` on the person's own machine. Sign-in codes are printed on\nthat machine, not emailed, and the bot check is off. The local server reaches the internet only to sign in with\nGoogle or GitHub, if the person configured them, and to read the client document of an AI app the person connects.\n[LEGAL ENTITY] receives nothing from a local server. <!-- lib/v2/mail.ts; lib/v2/config.ts turnstile() is hosted only -->\n\n## Changes to this list\n\n[LEGAL ENTITY] will update this page at least 30 days before a new subprocessor starts processing personal data, and\nwill email customers who have signed the DPA, or who ask for notice at [PRIVACY CONTACT EMAIL]. A customer may object\nwithin those 30 days, as the DPA describes. In an emergency (for example, to keep the service running when a\nprovider fails), a replacement may start sooner; customers are then told as soon as possible, with the same right to\nobject.\n"
    },
    {
      "file": "dpa.md",
      "text": "# Data processing agreement\n\n> **Draft for counsel review.** Prepared 2026-10-30. It is not legal advice and is not yet offered for signature. The\n> bracketed placeholders are filled in when it is.\n\nAlign adopts the **Common Paper Data Processing Agreement, version 1.1**, as its DPA. The agreement is this Cover Page\nplus the Common Paper DPA Standard Terms, published at\n<https://commonpaper.com/standards/data-processing-agreement/>. This page does not copy the Standard Terms; it fills in\nthe Cover Page for hosted Align. Common Paper's standard agreements are licensed under\n[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Align refers to the Standard Terms as Common Paper\npublishes them; the Cover Page and the changes listed under \"Changes to the Standard Terms\" below are Align's.\n\nThe Standard Terms incorporate the European Commission's 2021 Standard Contractual Clauses (Decision 2021/914) for\ntransfers from the EEA, the UK Addendum to them for transfers from the UK, and adjustments for transfers under Swiss\nlaw. To sign, write to [PRIVACY CONTACT EMAIL].\n\n## Cover Page\n\n| Key term | Align's entry |\n| --- | --- |\n| Agreement | The agreement under which the Customer uses hosted Align, named when the DPA is signed |\n| Provider | [LEGAL ENTITY] |\n| Provider Security Contact | [SECURITY CONTACT EMAIL] |\n| Approved Subprocessors | The [subprocessor list](subprocessors.md): Fly.io (hosting, United States), the configured email API (Resend in the default configuration, United States), and Cloudflare Turnstile (bot check, when enabled) |\n| Security Policy | The [security overview](security-overview.md), summarized in Annex II below. Certifications: none |\n| Governing Law and Chosen Courts | To be set by counsel |\n| Service Provider Relationship (CCPA) | Applies: Align acts as a service provider and does not sell or share Customer Personal Data |\n| Restricted Transfers: Governing Member State | To be set by counsel |\n\n## Changes to the Standard Terms\n\nThese change the Standard Terms in the Customer's favour or say how they apply to Align. Counsel to confirm the\nwording.\n\n- **Subprocessor notice.** Align gives at least **30 days'** written notice before a new subprocessor starts processing\n  Customer Personal Data, in place of the Standard Terms' 10 business days, and the Customer may object within those\n  30 days under the Standard Terms' objection process. If the objection can't be resolved, the Customer may stop\n  using hosted Align and delete its workspaces.\n- **Security incidents.** Align notifies the Customer within **72 hours** of becoming aware of a Security Incident, as\n  the Standard Terms require, and without undue delay where it can be sooner.\n- **Deletion on termination.** Customer Personal Data is deleted as the [retention schedule](../RETENTION.md)\n  describes: an owner can delete a workspace at any time; it can be restored for 30 days, is then purged by a daily\n  job, and leaves the 7-day volume snapshots within 38 days of its deletion. On request, Align purges a workspace at\n  once. Align keeps no other copy.\n- **Audits.** Align has no third-party audit report to provide. It meets audit requests by answering security and\n  audit questionnaires and providing documentation (see the [questionnaire answers](questionnaire.md)), at most once\n  a year unless a Security Incident or a supervisory authority requires more. Any inspection beyond that is on\n  reasonable notice and agreed in advance.\n\n## Annex I(A): Parties\n\n| | Data exporter | Data importer |\n| --- | --- | --- |\n| Who | The Customer, as named when the DPA is signed | [LEGAL ENTITY] |\n| Contact | The Customer's contact, as named when signed | [PRIVACY CONTACT EMAIL] |\n| Role | Controller (or processor, for its own customers) | Processor (or subprocessor) |\n\n## Annex I(B): Processing details\n\n| Item | Details |\n| --- | --- |\n| Service | Hosted Align: goals with owners and approval, the coding-agent sessions people choose to share toward them, and connected AI apps that read them |\n| Subject matter | Customer Personal Data in the Customer's Align workspaces |\n| Categories of data subjects | The Customer's personnel and contractors who use its workspaces, and people they invite by email |\n| Categories of personal data | Names, email addresses and roles; goals, change requests and decisions and who made them; evidence links on change requests; for shared agent sessions, the agent used, a hashed repository key, an optional repository alias, times, the goal it works toward, and token usage and estimated cost; for 24 hours, hashes of files touched (and, only if a person turns it on, file paths and short task text); paired device names; connected app names; audit log entries |\n| Not processed | Prompt text, agent replies and tool output, code and file contents |\n| Special category data | No |\n| Frequency of transfer | Continuous, while the Customer uses the Service |\n| Nature of processing | Storing, organizing, showing to authorized people, sending to the Customer's paired devices and connected AI apps, rolling up into totals, and deleting |\n| Purpose of processing | Providing the Service to the Customer |\n| Duration of processing | The term of the Agreement, then until deletion as described above |\n\n## Annex I(C): Competent supervisory authority\n\nAs the Standard Terms set out.\n\n## Annex II: Technical and organizational measures\n\nA summary of the [security overview](security-overview.md):\n\n- **Encryption.** HTTPS at the hosting provider's edge; the database volume is encrypted at rest by the hosting\n  provider.\n- **Access control.** People sign in individually (email codes, Google, GitHub or passkeys; no passwords). Sessions\n  last 7 days from last use and at most 30 days. Sensitive actions require a sign-in from the last 15 minutes. Every\n  request is authorized by workspace role, team role and goal visibility.\n- **Credentials.** Device, AI app and invite tokens are stored as hashes; refresh tokens rotate and reuse revokes them; devices hold their own\n  keys; connected AI apps are read-only and limited to one workspace, except for adding agent-reported evidence links\n  with the separate `changes:evidence` scope.\n- **Data minimization.** No prompts, agent output or code on the server.\n- **Abuse prevention.** Rate limits, creation codes and caps, a disposable-domain block, and a bot check.\n- **Logging.** A per-workspace audit log kept 1 year; server logs hold no request bodies, addresses, emails or codes.\n- **Availability.** Daily volume snapshots kept 7 days and a health check every 30 seconds.\n- **Deletion.** A published retention schedule applied by a daily job, and in-app deletion of accounts and\n  workspaces.\n- **Subprocessors.** A published list with 30 days' notice of changes.\n"
    },
    {
      "file": "questionnaire.md",
      "text": "# Security questionnaire answers\n\n> Prepared 2026-10-30, for review before it is sent or published. These answer common questions from CAIQ-Lite and\n> VSA Core style questionnaires about hosted Align, each with a pointer to where it is shown. \"No\" means no.\n> [LEGAL ENTITY] publishes these answers; questions go to [SECURITY CONTACT EMAIL].\n\nThe pointers name sections of the [security overview](security-overview.md), the [privacy policy](privacy-policy.md),\nthe [subprocessor list](subprocessors.md), the [retention schedule](../RETENTION.md) and the [DPA note](dpa.md).\n\n## Governance and assurance\n\n| # | Question | Answer | Detail |\n| --- | --- | --- | --- |\n| 1 | Do you hold a SOC 2 report or ISO 27001 certification? | No | Neither yet. A SOC 2 Type I would start when a customer requires it. Security overview, \"Not yet\". |\n| 2 | Has an independent penetration test been performed? | No | Not yet. Security overview, \"Not yet\". |\n| 3 | Do you have documented security policies? | Partial | This answer set, the security overview, the retention schedule, the privacy policy and the DPA. No separate policy set. |\n| 4 | Is someone accountable for security? | Yes | [LEGAL ENTITY]; security reports go to [SECURITY CONTACT EMAIL]. |\n| 5 | Do staff have background checks and security training? | Partial | No background checks. Security work is led by our Security Advisor, who holds OSCE3, OSCP and CISSP. |\n| 6 | Do you have a vulnerability disclosure process? | Yes | `SECURITY.md` and [SECURITY CONTACT EMAIL]. No bug bounty. |\n\n## Data\n\n| # | Question | Answer | Detail |\n| --- | --- | --- | --- |\n| 7 | Do you have an inventory of the customer data you hold? | Yes | Privacy policy, \"What we collect\"; security overview, \"What Align stores\". |\n| 8 | Do you store customer source code, prompts or AI conversations? | No | The server stores no prompt text, tool output, messages, code or file contents. <!-- docs/RETENTION.md; lib/v2/db.ts --> |\n| 9 | Do you process special categories of personal data? | No | Not by design. Align holds account details, workspace structure and usage metadata. |\n| 10 | Is customer data used to train AI models? | No | Align's server calls no AI model provider and trains no model. Subprocessors, \"Not subprocessors\". |\n| 11 | Is there a published retention schedule? | Yes | [RETENTION.md](../RETENTION.md), applied by a daily job. |\n| 12 | Can customers delete their data? | Yes | People delete their accounts in the app; owners delete workspaces (30-day restore, then purged; gone from snapshots within 38 days). The operator can purge a workspace at once on request. |\n| 13 | Is customer data logically separated between customers? | Yes | Workspace data is keyed by workspace, and every request is authorized against the caller's membership in one policy module; a workspace the caller can't see answers 404. <!-- lib/v2/policy.ts --> |\n| 14 | Is customer data stored in a known location? | Yes | United States: one Fly.io machine and volume in region `sjc` (San Jose, California). No choice of region yet. |\n\n## Identity and access\n\n| # | Question | Answer | Detail |\n| --- | --- | --- | --- |\n| 15 | Does the product support SSO (SAML or OIDC)? | No | Google and GitHub sign-in are supported; enterprise SSO is available on request. |\n| 16 | Does the product support SCIM provisioning? | No | Available on request. |\n| 17 | Does the product support MFA or phishing-resistant sign-in? | Partial | Passkeys (WebAuthn) are supported and phishing-resistant. MFA cannot be required per workspace yet. |\n| 18 | Does the product store passwords? | No | Sign-in is by email code, Google, GitHub or passkey. |\n| 19 | Are sessions limited in time? | Yes | 7 days from last use, never more than 30 days from sign-in; sign out everywhere. Security overview, \"Signing in\". |\n| 20 | Do sensitive actions require re-authentication? | Yes | A sign-in from the last 15 minutes for device and app approval, role changes, removal, deletion, passkeys and more. |\n| 21 | Is access role-based with least privilege? | Yes | Workspace roles (owner, member, viewer), team roles (lead, member) and goal visibility (private, team, workspace). |\n| 22 | Is access removed promptly when someone leaves? | Yes | Removal ends workspace access, team places, device access and connected apps at once. <!-- lib/v2/lifecycle.ts --> |\n| 23 | Is production access restricted and protected by MFA? | Yes | Production is reached only through the Fly.io account. Fly.io sign-in uses Google accounts with 2-Step Verification, and the GitHub accounts have two-factor enabled. |\n\n## Encryption and secrets\n\n| # | Question | Answer | Detail |\n| --- | --- | --- | --- |\n| 24 | Is data encrypted in transit? | Yes | HTTPS at Fly's edge, with plain HTTP redirected; calls to the email API and Turnstile are HTTPS. No HSTS header yet. |\n| 25 | Is data encrypted at rest? | Yes | By Fly.io: volumes are encrypted at rest by default (Fly's control). In the application, Google and GitHub access and refresh tokens are also encrypted (XChaCha20-Poly1305); nothing else is encrypted at the application level. |\n| 26 | Are credentials and tokens stored hashed? | Partial | Email codes, device tokens, refresh tokens, invite links and creation codes are stored only as hashes. Google and GitHub access and refresh tokens from sign-in are stored encrypted, though Align does not use them. Browser session tokens are stored as issued (Better Auth's default), and so is a Google ID token. |\n| 27 | Are secrets kept out of source code? | Yes | Set with `fly secrets`; the image is built from an allowlisted context. |\n| 28 | Are customer-managed encryption keys supported? | No | |\n\n## Application security\n\n| # | Question | Answer | Detail |\n| --- | --- | --- | --- |\n| 29 | Are requests protected against cross-site request forgery? | Yes | Cookie-authenticated writes must carry the server's exact `Origin`; cookies are `SameSite=Lax`. |\n| 30 | Is there rate limiting and abuse protection? | Yes | Durable limits on sign-in codes, limits on creation, invites and pairing, caps, a disposable-domain block, and Cloudflare Turnstile when enabled. |\n| 31 | Are dependencies locked and tracked? | Partial | `package-lock.json`, with the sign-in library pinned exactly; no automated dependency scanning yet. |\n| 32 | Is code tested before release? | Partial | Integration tests start real servers and cover sign-in, authorization, the hosted edge and connected apps; they are run by developers, not yet in CI. |\n| 33 | Is the access of connected AI apps limited? | Yes | Read one workspace, as the person who connected them, through nine read-only tools. With the separate `changes:evidence` scope an app may also add agent-reported evidence links. |\n| 34 | Are AI-agent prompt-injection risks addressed? | Partial | Text written by people is marked untrusted for AI apps; Align sends agents only facts and an enforced stop, and never wakes an idle agent. |\n\n## Operations, logging and resilience\n\n| # | Question | Answer | Detail |\n| --- | --- | --- | --- |\n| 35 | Are security events logged? | Yes | A per-workspace audit log (who, what, when), kept 1 year and readable by owners; it records approvals made without evidence. |\n| 36 | Do logs avoid personal and secret data? | Yes | When hosted, the server logs no request body, path, address, email or code. |\n| 37 | Are there backups? | Yes | Daily Fly.io volume snapshots, kept 7 days. No off-site backups. |\n| 38 | Is there high availability or a disaster recovery plan? | No | One machine in one region, no standby; recovery is a restore from the latest snapshot. |\n| 39 | Is there monitoring and alerting? | Partial | Fly checks the server's health every 30 seconds. No alerting on top of it yet. |\n\n## Incidents, vendors and privacy\n\n| # | Question | Answer | Detail |\n| --- | --- | --- | --- |\n| 40 | Do you notify customers of a personal data breach? | Yes | Within 72 hours of becoming aware, under the DPA. No written incident runbook yet. |\n| 41 | Do you publish your subprocessors and give notice of changes? | Yes | [Subprocessors](subprocessors.md); 30 days' notice with a right to object. |\n| 42 | Do you offer a DPA with Standard Contractual Clauses? | Yes | The Common Paper DPA with the 2021 EU SCCs and the UK Addendum. [DPA note](dpa.md). |\n| 43 | Do you use third-party analytics or advertising trackers? | No | Product events are content-free and kept in Align's own database for 13 months, for the operator only. |\n| 44 | Can the product run without sending data to you? | Yes | Local mode keeps everything on the person's own machine. |\n"
    },
    {
      "file": "RETENTION.md",
      "text": "# How long Align keeps data\n\nThis is Align's published retention schedule. It describes what the code does: the retention job in\n`lib/v2/retention.ts`, account deletion in `lib/v2/account.ts`, workspace deletion in `lib/v2/workspaces.ts`, and the\nvolume snapshots in `fly.toml`. The contract is the \"Data retention\" requirement in `specs/align/workspaces.md`.\n\nAlign never stores prompt text, tool output or messages on the server. The `align` agent shares a session's harness, a\nhashed repository key, an optional repository alias, its times and state, its goal binding and its token usage and\nestimated cost. It sends no title.\n\n## The schedule\n\n| Data | Kept | Then |\n|---|---|---|\n| Prompt text, tool output, messages | Not stored on the server | Nothing to delete |\n| Shared sessions: harness, hashed repo key, repo alias, times, state, goal binding, binding periods, usage (model, tokens, estimated cost), the person who shared it | 13 months after the session ends: when sharing stopped, or else its last activity (its last upload, binding change or update) | Rolled up into totals per workspace, goal, UTC day, model and billing basis, with no person and no session. The raw rows (session, binding periods, usage, directive deliveries and receipts) are deleted |\n| Change-request evidence links (kind, URL, label, who added it, person or agent) and the snapshot Align records with each revision (the goal's 30-day spend, bound sessions, last activity) | The life of the change request | Deleted with the workspace. Whoever added a link becomes \"Former member #n\" like the rest of their rows |\n| Asks between teams (the team asked, the text, who asked as people said it, the meeting and date, who recorded and last decided it) and the times they came up again | Open and accepted ones while the workspace lives; a `done`, `declined` or `withdrawn` ask 13 months after its last change | Deleted by the daily job, with the times it came up again (`asks_deleted`), or with the workspace. Whoever recorded, decided or mentioned one becomes \"Former member #n\" like the rest of their rows |\n| Value reports on an approved change request (an estimate and an optional note of up to 500 characters, by one person) | 13 months after their last change | Deleted by the daily job (`value_reports_deleted`), with their change request, or with the workspace. Their author becomes \"Former member #n\" like the rest of their rows |\n| Requests to a goal's agents (type, goal and version, target goal, an optional note of up to 280 characters, who sent and cancelled it) and each session's answer | 13 months after it was sent | Deleted by the daily job (`requests_deleted`) with the directives that carried it, with their session (that session's answer), or with the workspace. Its sender becomes \"Former member #n\" like the rest of their rows |\n| The marker a deleted session's shared history leaves (a hash of the person who shared it and the session key, the workspace, the time; never the key or the person) | 13 months after the deletion | Deleted by the daily job (`deleted_session_markers_deleted`), or with the workspace. While it lasts, the account that shared the session is told its history is already deleted (410 `history_deleted`) when one of its devices asks to delete it again |\n| Goal holds (who held the goal, an optional reason of up to 280 characters, when) | While the goal is held | Deleted when it is released (by a person, or when the goal is achieved or dropped) or with the workspace; the audit log keeps the history. Whoever held it becomes \"Former member #n\" like the rest of their rows |\n| Spend roll-ups (no person, no session) | The life of the workspace | Deleted with the workspace |\n| Activity signals (in-flight edits, commits, tasks, claims) | 24 hours (claims 1 hour) | Deleted by the daily job, or with their session |\n| Workspace audit log | 1 year | Deleted |\n| A person who leaves or is removed | Their access ends at once: team places, device access and connected AI apps for that workspace. Their goals, sessions and history stay under their name for 30 days | After 30 days they are shown as \"Former member #n\" (numbered per workspace) in every row of that workspace, the audit log included; their sessions no longer point at their device, invites to or accepted by them are deleted, so their email leaves the workspace, and the keyed hash that stood for them is cleared from that workspace's product events. Their account stays until they delete it |\n| Sessions of a removed member, if the owner ticks \"Also delete their shared sessions in this workspace now\" | Deleted at removal | Spend already rolled up stays |\n| An account, when its owner deletes it (`/app/account`) | Deleted at once | Their memberships end as above, and in every workspace their rows become \"Former member #n\" at once. Their product events lose the keyed hash that stood for them. Their devices, sign-in sessions, linked sign-in methods, passkeys (with when each was last used), their answer to the \"add a passkey\" prompt, codes, access requests, unused creation codes bound to their email, email-keyed rate-limit counters and the account are deleted. A workspace where they were the only member is deleted with it (see the next row). The audit records that an account was deleted, with no name or email. Refused while they are the only owner of a workspace that has other members |\n| A deleted workspace (by an owner, with the account of its only member, or by the operator) | 30 days, during which its owners can restore it from Your workspaces | Every row is deleted by the daily job on day 30 or within the 24 hours after, its audit included (its content-free product events stay, under a random id, until their own 13 months are up). The operator can erase one at once (`align-admin workspaces delete <ws> --purge --yes`) |\n| Fly.io volume snapshots (hosted) | Daily snapshots, each kept 7 days (`fly.toml`: `scheduled_snapshots = true`, `snapshot_retention = 7`) | Expire, so deleted data leaves the snapshots within 7 days. A purged workspace is gone from every copy within 38 days of its deletion |\n| Off-site backups | None are made | |\n| Email sign-in codes | 5 minutes, 3 attempts | Deleted by the daily job once expired |\n| Sign-in sessions (with the client IP address and user agent when hosted) | 7 days, extended while used, and never more than 30 days after the sign-in (`ALIGN_SESSION_MAX_DAYS`). Signing out everywhere ends them all at once | A session past the 30 days is deleted when it is next presented; the daily job deletes the rest once expired or past the 30 days |\n| Pending invites | 7 days | Deleted 7 days after they expire. An accepted invite is kept while the person is a member, and deleted when they become a former member or with the workspace |\n| Passkeys (name, public key, when added and last used) | Until the person deletes the passkey | Deleted at once, or with the account |\n| Access requests (`/app/request-access`: email, name, company, team size, what for, interest) | 13 months after the operator approved or declined it, or, while still pending, 13 months after it was made | Deleted by the daily job, or at once when that email's Align account is deleted |\n| Creation codes (an HMAC of the code, the email it is bound to, dates, the workspace it created) | Kept as the record of who could create what | An unused code bound to an account's email is deleted with that account; a used one then keeps no email or redeemer. Purging a workspace clears the code's workspace |\n| Product events (`v2_events`: an event name such as \"workspace created\" or \"first session bound to a goal\", the workspace id, a keyed hash of the person, the time, and a few allowlisted kinds or counts; never an email, name, title, goal text, URL, repository, code or token) | 13 months | Deleted by the daily job. When a person deletes their account, their keyed hash is cleared from every event at once, so no event can be tied to them (the event itself stays, without a person). When a workspace is purged, its events stay with its id replaced by a random one (`wsx_\u2026`) that names nothing. When a person who left or was removed becomes \"Former member #n\" in a workspace (30 days on), their hash is cleared from that workspace's events the same way |\n| Durable rate-limit counters (an HMAC of an email address or a client address, and a time) | 24 hours | Pruned as new calls are counted; the ones keyed by an account's email are deleted with the account |\n| Paired devices (name, public key, last seen) | Until the person revokes the device; a revoked device's row stays, without working tokens | Deleted with the account |\n| AI apps that registered themselves (`_oauth_clients.json`: an app's name and redirect addresses, nothing about people) | Kept | |\n| Server logs | When hosted, Align logs no request body, path, address, email or code; a server error logs only its error name, and the retention job logs counts only | Fly.io keeps a machine's log output on its platform for a limited time; Align keeps no copy |\n| Email provider message logs | The provider's own retention (set it to the shortest it offers) | The provider deletes them |\n| Local mode (Mode L) | Everything stays in `data/v2/align.sqlite` on the person's own machine; nothing is sent to Align | The same job runs there, on that machine |\n\n## When the job runs\n\n- At every server start, and then every 24 hours while the server runs (`instrumentation.ts`). It never runs during a\n  build.\n- By hand, with the operator script: `node scripts/align-admin.mjs retention run` runs it now and prints what it did;\n  `--dry-run` prints what it would do and changes nothing (`node scripts/retention.mjs [--dry-run]` is the same\n  command). It reads `ALIGN_DATA_DIR` (default `./data`) and runs the same code as the server\n  (`lib/v2/retention-core.mts`). Run it with the server's environment, because it reads `ALIGN_SESSION_MAX_DAYS` the\n  way the server does: on the hosted machine, `fly ssh console -C \"node scripts/align-admin.mjs retention run\"` (the\n  image carries the script) has that environment.\n- The operator can also erase one workspace at once, without waiting for its restore window:\n  `node scripts/align-admin.mjs workspaces delete <ws> --purge --yes`, the same purge the job does on day 30.\n- Each step is its own short transaction and running the job again changes nothing.\n\nDeleted data can't be recovered by Align once the job has removed it: Align keeps no other copy than the volume\nsnapshots above.\n"
    }
  ],
  "/__private__/trust-text-parser/characterization.json": {
    "batches": [
      {
        "batch": 0,
        "records": 45,
        "sha256": "a16f65beff23585c289f3411c74f8da2d86b699c8b076bd3c140eddc6b745438"
      },
      {
        "batch": 1,
        "records": 0,
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      },
      {
        "batch": 2,
        "records": 0,
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      }
    ],
    "fault_paths": []
  }
};
const fileNames = {
  "legacy-observations.cjs": "/__private__/trust-text-parser/legacy-observations.cjs",
  "historical-plans.json": "/__private__/trust-text-parser/historical-plans.json",
  "current-documents.json": "/__private__/trust-text-parser/current-documents.json",
  "slug.js": "/__private__/trust-text-parser/slug.js",
  "safe_href.js": "/__private__/trust-text-parser/safe_href.js",
  "plain.js": "/__private__/trust-text-parser/plain.js",
  "fixture.cjs": "/__private__/trust-text-parser/fixture.cjs",
  "qualification-fixture.cjs": "/__private__/trust-text-parser/qualification-fixture.cjs",
  "characterization.json": "/__private__/trust-text-parser/characterization.json"
};
const manifest = {
  "schema": "align/readable-private-qualification@1",
  "component": "trust-text-parser",
  "package": "trust_text_parser",
  "package_files": [
    "package.json",
    "create_trust_text_parser.js"
  ],
  "package_exports": {
    "./create_trust_text_parser": "./create_trust_text_parser.js"
  },
  "capabilities": [
    {
      "id": "trust-text-parser.create-trust-text-parser",
      "symbol": "create_trust_text_parser",
      "module": "create_trust_text_parser.js",
      "fixture": "qualification-fixture.cjs",
      "cases": "qualification-fixture.cjs",
      "characterization": "characterization.json",
      "resource_count": 0,
      "default_operation": 0,
      "runner": false
    }
  ],
  "plans": [
    {
      "capability": "trust-text-parser.create-trust-text-parser",
      "batch": 0,
      "expected_result": {
        "batch": 0,
        "records": 45,
        "sha256": "a16f65beff23585c289f3411c74f8da2d86b699c8b076bd3c140eddc6b745438"
      }
    }
  ],
  "files": [
    {
      "name": "legacy-observations.cjs",
      "path": "tools/native-rewrite/qualification/trust-text-parser-v2/legacy-observations.cjs",
      "sha256": "fa4291f0861e41e5a2a523770aad97f91f4d04f441ffdf3d69ca3f24206bf22a",
      "size": 39946
    },
    {
      "name": "historical-plans.json",
      "path": "tools/native-rewrite/qualification/trust-text-parser-v2/historical-plans.json",
      "sha256": "98b7b7a4b9390aba29ef03e69597d221d82dc63c3fdbf984955d7e8ea5d2c06b",
      "size": 2183
    },
    {
      "name": "current-documents.json",
      "path": "tools/native-rewrite/qualification/trust-text-parser-v2/current-documents.json",
      "sha256": "5f5eb3732d4802c4d45b6fcb7ed65ed0cc5a2e9624bc5a554f82db2448120d2f",
      "size": 58797
    },
    {
      "name": "slug.js",
      "path": "tools/native-rewrite/qualification/trust-text-parser-v2/slug.js",
      "sha256": "7089d35748eb8f7bce4647a5ba71e89fc958b62d2a51ab8a9e898a2aeec7b291",
      "size": 167
    },
    {
      "name": "safe_href.js",
      "path": "tools/native-rewrite/qualification/trust-text-parser-v2/safe_href.js",
      "sha256": "4c9942e8e5c52675bad6e91d33b899dfc2c650174c814357fe3936dded19cb29",
      "size": 697
    },
    {
      "name": "plain.js",
      "path": "tools/native-rewrite/qualification/trust-text-parser-v2/plain.js",
      "sha256": "496971ba443f200c2ddf904ef39567417cb0e30fa507b2e62d9f813a417b5d70",
      "size": 174
    },
    {
      "name": "fixture.cjs",
      "path": "tools/native-rewrite/qualification/trust-text-parser-v2/fixture.cjs",
      "sha256": "549666481d977185179b836a972521a1f5d213311a2c7efbbacf26783aefc0d9",
      "size": 5715
    },
    {
      "name": "qualification-fixture.cjs",
      "path": "tools/native-rewrite/qualification/trust-text-parser-v2/qualification-fixture.cjs",
      "sha256": "467ecde9158f977b390f0962b8049864d9d23859b9bc020bae6babe1f2628c6c",
      "size": 592
    },
    {
      "name": "characterization.json",
      "path": "tools/native-rewrite/qualification/trust-text-parser-v2/characterization.json",
      "sha256": "24ddfc6402c0abc629f48a4e2f5a04de3a919982db00f13d7438c08e35be343b",
      "size": 446
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
const driver = load("/__private__/trust-text-parser/driver.cjs");

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
