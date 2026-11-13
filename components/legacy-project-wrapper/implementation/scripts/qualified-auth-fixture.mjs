// Test-only resources. No environment secrets, persistent storage or delivery.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function qualifiedAuthFixture(root, overrides = {}) {
  const libraries = JSON.parse(fs.readFileSync(path.join(root, "native/libraries.json"), "utf8")).libraries;
  const matches = libraries.filter((library) => library.component === "server-auth");
  assert.equal(matches.length, 1, "Expected one admitted authentication library");
  const library = matches[0];
  assert.match(library.package, /^[a-z0-9_]+$/);
  assert.ok(library.files.some((member) => member.path === "create_auth.js"));
  const directory = path.join(root, "lib/native", library.package);
  for (const member of library.files) {
    const file = path.resolve(directory, member.path);
    const relative = path.relative(directory, file);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    const stat = fs.lstatSync(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink());
    assert.equal(createHash("sha256").update(fs.readFileSync(file)).digest("hex"), member.digest);
  }
  const admitted = await import(pathToFileURL(path.join(directory, "create_auth.js")).href);
  const createAuth = admitted.create_auth ?? admitted.default?.create_auth;
  assert.equal(typeof createAuth, "function");
  assert.equal(createAuth.length, 1);
  const defaults = {
    createAuthMiddleware: (handler) => handler,
    config: () => ({ hosted: false }),
    publicOrigin: () => undefined,
    googleConfigured: () => false,
    githubConfigured: () => false,
    captchaPlugin: () => null,
    emailSignInEnabled: () => false,
    testOAuthUrl: () => undefined,
    testIdpEnabled: () => false,
    sessionMaxDays: () => 30,
    RECENT_SIGN_IN_MS: 15 * 60 * 1000,
    passkey: (options) => ({ id: "fixture-passkey", options }),
    authDb: () => ({}),
    readEnvironment: () => ({ BETTER_AUTH_SECRET: "fixture-only-auth-secret" }),
    readDate: () => Date,
    readURL: () => URL,
    globalState: {},
    ...overrides,
  };
  const resources = new Proxy(defaults, {
    get(target, name) {
      if (Object.hasOwn(target, name)) return target[name];
      return () => { throw new Error("Unexpected authentication fixture effect: " + String(name)); };
    },
  });
  const auth = createAuth(resources);
  const options = auth.authOptions();
  assert.equal(typeof options.hooks.before, "function");
  return { auth, options, sourceFile: path.join(directory, "create_auth.js") };
}
