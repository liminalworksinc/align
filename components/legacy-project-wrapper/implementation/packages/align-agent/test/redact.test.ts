// Secret redaction before vendor sends (spec #117, P0). Every rule has positive and negative cases. Fake secrets are
// assembled at runtime from pieces so that no complete credential-shaped string sits in this public repository.
import assert from "node:assert/strict";
import { test } from "node:test";
import { REDACTED, mostlyRedacted, redactSecrets, redactionLine } from "../src/redact.ts";

const j = (...parts: string[]) => parts.join("");
const rnd = (n: number, alphabet = "aB3xK9pQ7mZ2wR5tY8uV1nC4dE6fG0hJ") => Array.from({ length: n }, (_, i) => alphabet[(i * 7 + 3) % alphabet.length]).join("");

const POSITIVE: [string, string, string][] = [
  ["private key block", j("-----BEGIN ", "RSA PRIVATE KEY-----\nMIIEow", rnd(60), "\n-----END RSA ", "PRIVATE KEY-----"), "private_key"],
  ["openssh private key", j("-----BEGIN ", "OPENSSH PRIVATE KEY-----\nb3Blbn", rnd(50), "\n-----END OPENSSH ", "PRIVATE KEY-----"), "private_key"],
  ["AWS access key id", j("AK", "IA", "QWERTYUIOPASDFGH"), "aws_access_key"],
  ["GitHub classic token", j("gh", "p_", rnd(36)), "github_token"],
  ["GitHub fine-grained token", j("github", "_pat_", rnd(22), "_", rnd(59)), "github_token"],
  ["Anthropic key", j("sk-", "ant-api03-", rnd(40)), "anthropic_key"],
  ["OpenAI project key", j("sk-", "proj-", rnd(40)), "openai_key"],
  ["Slack bot token", j("xo", "xb-", "1234567890-", rnd(20)), "slack_token"],
  ["Stripe live key", j("sk", "_live_", rnd(24)), "stripe_key"],
  ["Google API key", j("AI", "za", rnd(35)), "google_api_key"],
  ["JWT", j("ey", "JhbGciOiJIUzI1NiJ9.", "ey", "JzdWIiOiIxMjM0NTY3ODkwIn0.", rnd(30)), "jwt"],
  ["URL with password", j("postgres://admin:", "Sup3rS3cret!x", "@db.internal:5432/app"), "url_credentials"],
  ["bearer header", j("Authorization: Bearer ", rnd(40)), "bearer_token"],
  [".env assignment", j("DATABASE_PASSWORD=", "hunter2hunter2"), "assignment"],
  ["quoted API key in code", j('const API_KEY = "', "live-", rnd(20), '"'), "assignment"],
  ["YAML client secret", j("client_secret: ", rnd(30)), "assignment"],
  ["unlabelled random token", j("use this: ", rnd(48)), "high_entropy"],
];

const NEGATIVE: [string, string][] = [
  ["git commit id (40 hex)", "Merged 9e618da3ae489faaefe16e0d9ab8412d4193b711 into main."],
  ["short commit id", "See 88e22214 and a27014d4 for the fix."],
  ["UUID", "Session 6aebf612-ec70-83e8-9823-a52eb2a99f06 finished."],
  ["file paths", "Edited components/legacy-project-wrapper/implementation/packages/align-agent/src/cli.ts:1326"],
  ["prose about secrets", "Never paste your password or API key into chat; rotate the token if you do."],
  ["long identifier", "renderAuthorizationConsentScreenForWorkspaceOwners is called twice."],
  ["kebab-case slug", "Open specs/align/transfer-authorization-and-consent-sequence-numbers.md"],
  ["assignment with an empty or short value", "PASSWORD=\nTOKEN=abc"],
  ["test counts and numbers", "ℹ pass 791, fail 0, duration_ms 496156.814291"],
];

for (const [name, secret, kind] of POSITIVE) {
  test(`redacts: ${name}`, () => {
    const r = redactSecrets(`before ${secret} after`);
    assert.ok(!r.text.includes(secret), `${name} still present: ${r.text}`);
    assert.ok(r.text.includes(REDACTED));
    assert.ok(r.count >= 1);
    assert.ok(r.kinds.includes(kind as never), `${name}: kinds ${r.kinds.join(",")}`);
    assert.ok(r.text.startsWith("before ") && r.text.endsWith(" after"), "surrounding text is kept");
  });
}

for (const [name, text] of NEGATIVE) {
  test(`keeps: ${name}`, () => {
    const r = redactSecrets(text);
    assert.equal(r.text, text);
    assert.equal(r.count, 0);
  });
}

test("labelled secrets keep their label, so the reader knows what was removed", () => {
  const r = redactSecrets(j("DATABASE_PASSWORD=", "hunter2hunter2"));
  assert.equal(r.text, `DATABASE_PASSWORD=${REDACTED}`);
  const u = redactSecrets(j("postgres://admin:", "Sup3rS3cret!x", "@db/app"));
  assert.equal(u.text, `postgres://admin:${REDACTED}@db/app`);
});

test("redaction is idempotent", () => {
  const once = redactSecrets(j("token ", "gh", "p_", rnd(36), " and DB_PASSWORD=", "hunter2hunter2"));
  const twice = redactSecrets(once.text);
  assert.equal(twice.text, once.text);
  assert.equal(twice.count, 0);
});

test("a payload that is mostly secrets is refused; a normal one is not", () => {
  const key = j("-----BEGIN ", "RSA PRIVATE KEY-----\n", rnd(400), "\n-----END RSA ", "PRIVATE KEY-----");
  const mostly = `see ${key}`;
  assert.equal(mostlyRedacted(mostly, redactSecrets(mostly)), true);
  const normal = j("The deploy failed because DB_PASSWORD=", "hunter2hunter2", " was rotated; the build itself passed and tests ran green.");
  assert.equal(mostlyRedacted(normal, redactSecrets(normal)), false);
  assert.equal(mostlyRedacted("", redactSecrets("")), false);
});

test("the outbox line names counts and kinds, never the secret", () => {
  const secret = j("gh", "p_", rnd(36));
  const r = redactSecrets(`push with ${secret}`);
  const line = redactionLine(r);
  assert.match(line, /^Secrets removed on this machine first: 1 \(github_token\)\.$/);
  assert.ok(!line.includes(secret));
  assert.equal(redactionLine(redactSecrets("nothing here")), "Secrets removed on this machine first: none found.");
});

test("a goal suggestion sends the redacted prompt, and sends nothing when the prompt is mostly secrets", async () => {
  const { decideGoal } = await import("../src/decision-model.ts");
  const secret = j("gh", "p_", rnd(36));
  const bodies: string[] = [];
  const send = (async (_url: string, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ answers: {} }), { headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  const goals = [{ id: "g_ship", title: "Ship v2" }];
  const prompt = `Please finish the v2 release: rebase the branch on main, rerun the full test gate, fix anything red, and then push it with my token ${secret} once everything passes.`;
  await decideGoal({ provider: "typesafe" }, "test-key", { repo_alias: null, first_prompt: prompt, goals }, 2000, send);
  assert.equal(bodies.length, 1);
  assert.ok(!bodies[0].includes(secret), "the secret reached the vendor request body");
  assert.ok(bodies[0].includes(REDACTED));
  const key = j("-----BEGIN ", "RSA PRIVATE KEY-----\n", rnd(400), "\n-----END RSA ", "PRIVATE KEY-----");
  assert.equal(await decideGoal({ provider: "typesafe" }, "test-key", { repo_alias: null, first_prompt: key, goals }, 2000, send), null);
  assert.equal(bodies.length, 1, "a mostly-secret prompt must not be sent");
});
