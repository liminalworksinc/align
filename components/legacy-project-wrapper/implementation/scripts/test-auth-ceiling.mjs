// Deterministic admission regression. All state, identities and time are synthetic.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const authFile = process.argv[3] ? path.resolve(process.argv[3]) : null;
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");
const { APIError } = await import(pathToFileURL(require.resolve("better-auth/api")).href);
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const authSource = authFile ? fs.readFileSync(authFile, "utf8") : null;
const { qualifiedAuthFixture } = await import("./qualified-auth-fixture.mjs");
const limiterSource = fs.readFileSync(path.join(root, "lib/v2/limits.ts"), "utf8");

const libraries = JSON.parse(fs.readFileSync(path.join(root, "native/libraries.json"), "utf8")).libraries;
async function admittedModule(component, entryPoint) {
  const matches = libraries.filter((entry) => entry.component === component);
  assert.equal(matches.length, 1, "Expected one admitted library: " + component);
  const library = matches[0];
  assert.ok(/^[a-z0-9_]+$/.test(library.package));
  const directory = path.join(root, "lib/native", library.package);
  assert.ok(library.files.some((member) => member.path === entryPoint), "Entry point must belong to the admitted package");
  for (const member of library.files) {
    const file = path.resolve(directory, member.path);
    const relative = path.relative(directory, file);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    const stat = fs.lstatSync(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink());
    assert.equal(sha(fs.readFileSync(file)), member.digest);
  }
  return import(pathToFileURL(path.join(directory, entryPoint)).href);
}
const errorModule = await admittedModule("http-errors", "data.js");
const { V2Error } = (errorModule.data ?? errorModule.default?.data)();
const limiterModule = await admittedModule("rate-limits", "create_limiter.js");
const create_limiter = limiterModule.create_limiter ?? limiterModule.default?.create_limiter;
assert.equal(typeof create_limiter, "function");
assert.equal(create_limiter.length, 1);

function compile(source) {
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
    fileName: "admission-fixture.ts",
  });
  assert.ok(!result.diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error));
  return result.outputText;
}

// An explicit third argument retains the historical source counterexample control.
// Ordinary acceptance uses the exact hash-checked admitted factory below.
let handlerCode;
let sendPath = "/email-otp/send-verification-otp";
if (authSource !== null) {
const ast = ts.createSourceFile("auth.ts", authSource, ts.ScriptTarget.Latest, true);
const required = new Set(["OTP_SEND", "OTP_SIGN_IN", "minutes", "tooManyCodesMessage", "machineCeilingMessage", "tooMany", "beforeHook"]);
const declarations = [];
for (const statement of ast.statements) {
  const names = ts.isFunctionDeclaration(statement) && statement.name
    ? [statement.name.text]
    : ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.filter((declaration) => ts.isIdentifier(declaration.name)).map((declaration) => declaration.name.text)
      : [];
  if (!names.some((name) => required.has(name))) continue;
  assert.equal(names.length, 1, "Fixture selection requires unambiguous declarations");
  required.delete(names[0]);
  declarations.push(statement.getText(ast));
  if (names[0] === "OTP_SEND") {
    const value = statement.declarationList.declarations[0].initializer;
    assert.ok(value && ts.isStringLiteral(value));
    sendPath = value.text;
  }
}
assert.equal(required.size, 0, "Current sign-in declarations must be present");
handlerCode = compile(declarations.join("\n\n") + "\nexport { beforeHook };\n");
}
const limiterCode = compile(limiterSource);

// Independent, target-specific test fixture for the declared two-column hit store.
// It remains test input when historical production migration source is retired.
const hitSchema = "CREATE TABLE v2_rate_hits (key TEXT NOT NULL, at INTEGER NOT NULL); CREATE INDEX v2_rate_hits_key ON v2_rate_hits(key, at); CREATE INDEX v2_rate_hits_at ON v2_rate_hits(at);";
const cases = [
  { name: "machine-only-static-clock", now: 10, elapsed: 0, ceiling: [0], address: [], expected: "machine" },
  { name: "machine-only-one-ms-across-await", now: 10, elapsed: 1, ceiling: [0], address: [], expected: "machine" },
  { name: "machine-only-one-second-across-await", now: 10, elapsed: 1000, ceiling: [0], address: [], expected: "machine" },
  { name: "address-only-full", now: 10, elapsed: 1, ceiling: [], address: [0, 0, 0], expected: "general" },
  { name: "address-outlasts-machine", now: 3599990, elapsed: 1, ceiling: [0], address: [3599980, 3599980, 3599980], expected: "general" },
  { name: "machine-outlasts-address", now: 3599990, elapsed: 1, ceiling: [3599980], address: [3000000, 3000000, 3000000], expected: "machine" },
  { name: "local-owner-exempt", now: 10, elapsed: 1, ceiling: [0], address: [], owner: true, expected: "allowed" },
  { name: "local-owner-address-limit-still-applies", now: 10, elapsed: 1, ceiling: [0], address: [0, 0, 0], owner: true, expected: "general" },
  { name: "under-both-limits", now: 10, elapsed: 1, ceiling: [], address: [], expected: "allowed" },
  { name: "machine-and-address-tie", now: 3599990, elapsed: 1, ceiling: [0], address: [3000000, 3000000, 3000000], expected: "machine" },
  { name: "ceiling-expires-during-lock-acquisition", now: 3599999, before: 2, elapsed: 1, ceiling: [0], address: [], expected: "allowed" },
  { name: "address-expires-during-lock-acquisition", now: 599999, before: 2, elapsed: 1, ceiling: [], address: [0, 0, 0], expected: "allowed" },
  { name: "hosted-email-hour-limit-full", now: 10, elapsed: 1, hosted: true, ceiling: [], address: [], durable: 5, expected: "general" },
  { name: "hosted-client-limit-full", now: 10, elapsed: 1, hosted: true, ceiling: [], address: [], client: 10, expected: "general" },
  { name: "hosted-under-all-limits", now: 10, elapsed: 1, hosted: true, ceiling: [], address: [], expected: "allowed" },
  { name: "hosted-owner-not-exempt-from-client-limit", now: 10, elapsed: 1, hosted: true, owner: true, ceiling: [], address: [], client: 10, expected: "general" },
  { name: "in-process-local-owner", now: 10, elapsed: 1, ceiling: [0], address: [], owner: true, noRequest: true, expected: "allowed" },
  { name: "clock-advances-between-helper-calls", now: 10, elapsed: 0, perCallStep: 1, ceiling: [0], address: [], expected: "machine" },
];

const observations = [];
let observedAuthSource = authSource;
for (const example of cases) {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(hitSchema);
    const clock = { now: example.now, reads: 0 };
    class FixtureDate extends Date {
      constructor(...args) { super(...(args.length ? args : [clock.now])); }
      static now() { clock.reads++; return clock.now; }
    }
    const date = FixtureDate;
    const store = Object.fromEntries(["get", "all", "run"].map((method) => [method, (sql, ...args) => database.prepare(sql)[method](...args)]));
    const imports = {
      "../native/.bindings/rate_limits.js": { create_limiter },
      "../secret": { signPayload: (text) => crypto.createHmac("sha256", "fixture-only/admission-regression-v1").update(text).digest("base64url") },
      "./db": store,
      "./errors": { V2Error },
    };
    const limiterContext = vm.createContext({ Date: date });
    const limiter = new vm.SourceTextModule(limiterCode, { context: limiterContext, identifier: "retained-limiter" });
    await limiter.link((specifier) => {
      assert.ok(Object.hasOwn(imports, specifier), "Unexpected limiter dependency");
      const values = imports[specifier];
      return new vm.SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { context: limiterContext });
    });
    await limiter.evaluate();
    const api = limiter.namespace;
    const email = example.owner ? "owner@example.invalid" : "person@example.invalid";
    for (const at of example.ceiling) api.take("otp-client:local", 1, 3600000, at);
    for (const at of example.address) api.take("otp-email:" + email, 3, 600000, at);
    for (let i = 0; i < (example.client ?? 0); i++) api.take("otp-client:ip:192.0.2.10", 10, 3600000, 0);
    for (let i = 0; i < (example.durable ?? 0); i++) database.prepare("INSERT INTO v2_rate_hits (key, at) VALUES (?, 0)").run(api.otpEmailKey(email));
    const ports = {};
    for (const name of ["takeAll", "durableRoom", "durableCount", "durableRetryAfterMs", "retryAfterMs", "otpEmailKey"]) {
      ports[name] = (...args) => { clock.now += example.perCallStep ?? 0; return api[name](...args); };
    }
    const handlerPorts = {
      APIError, Date: date, ...ports,
      createAuthMiddleware: (handler) => handler,
      endCappedSessions: async () => undefined,
      RECENT_PATHS: {},
      config: () => ({ hosted: example.hosted ?? false }),
      localOwnerEmail: () => "owner@example.invalid",
      localCodesPerHour: () => 1,
      clientNet: (ip) => { assert.equal(ip, "192.0.2.10"); return ip; },
      tx: async (callback) => {
        clock.now += example.before ?? 0;
        database.exec("BEGIN IMMEDIATE");
        let result;
        try { result = callback(); database.exec("COMMIT"); }
        catch (error) { database.exec("ROLLBACK"); throw error; }
        clock.now += example.elapsed;
        return result;
      },
    };
    let beforeHook;
    if (handlerCode !== undefined) {
      const handlerContext = vm.createContext(handlerPorts);
      const handler = new vm.SourceTextModule(handlerCode, { context: handlerContext, identifier: "historical-sign-in-control" });
      await handler.link(() => { throw new Error("Unexpected selected handler import"); });
      await handler.evaluate();
      beforeHook = handler.namespace.beforeHook;
    } else {
      const fixture = await qualifiedAuthFixture(root, {
        ...handlerPorts,
        readDate: () => date,
        publicOrigin: () => example.hosted ? "https://align.example.invalid" : undefined,
      });
      beforeHook = fixture.options.hooks.before;
      observedAuthSource = fs.readFileSync(fixture.sourceFile, "utf8");
    }
    let failure;
    try {
      await beforeHook({
        getSignedCookie: async () => undefined,
        context: { authCookies: { sessionToken: { name: "fixture-session" } }, secret: "fixture-only-cookie-secret" },
        path: sendPath, body: { type: "sign-in", email },
        request: example.noRequest ? undefined : { headers: new Headers({ "fly-client-ip": "192.0.2.10" }) },
      });
    } catch (error) { failure = error; }
    assert.ok(!failure || failure instanceof APIError, "Expected the actual APIError type");
    const message = failure?.body?.message ?? null;
    const category = !failure ? "allowed" : message.startsWith("Align on this computer has sent ") ? "machine" : message.startsWith("Too many codes were sent.") ? "general" : "unknown";
    const retry = failure?.headers?.["Retry-After"] ?? null;
    const expectedRetry = example.expected === "allowed" ? null : ({
      "machine-and-address-tie": "1", "address-only-full": "600", "address-outlasts-machine": "600", "local-owner-address-limit-still-applies": "600",
    }[example.name] ?? "3600");
    const status = failure?.statusCode ?? null;
    const code = failure?.body?.code ?? null;
    const envelope = example.expected === "allowed" ? status === null && code === null && retry === null : status === 429 && code === "rate_limited" && retry === expectedRetry;
    observations.push({ name: example.name, expected_category: example.expected, actual_category: category, passed: category === example.expected && envelope, status_code: status, error_code: code, retry_after: retry, message, clock_reads: clock.reads });
  } finally { database.close(); }
}
const failed = observations.filter((observation) => !observation.passed).length;
console.log(JSON.stringify({
  schema: "align/auth-ceiling-regression@1", cases: observations.length, passed: observations.length - failed, failed,
  auth_source_sha256: sha(observedAuthSource), limiter_source_sha256: sha(limiterSource), node: process.version, platform: process.platform,
  observations,
  scope: "Hash-checked admitted authentication factory and actual limiter with synthetic ports and in-memory SQLite. Explicit historical-source controls use selected admission bodies. HTTP/email delivery is excluded.",
}));
if (failed) process.exitCode = 1;
