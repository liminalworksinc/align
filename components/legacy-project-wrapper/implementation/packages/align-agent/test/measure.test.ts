import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import { test, type TestContext } from "node:test";
import { saveCredentials } from "../src/api.ts";
import { ctxFor, makeEnv, runCli } from "./helpers.ts";

test("measure run is off by default and sends only the parsed result after exact local consent", async (t) => {
  const outputCanary = "PRIVATE_COMMAND_STDOUT_CANARY";
  const errorCanary = "PRIVATE_COMMAND_STDERR_CANARY";
  const envCanary = "PRIVATE_COMMAND_ENV_CANARY";
  const ids = ["ws_readingtest", "g_readingtest", "m_readingtest"];
  const reads: string[] = [];
  const writes: unknown[] = [];
  const executable = process.execPath;
  const success = ["-e", `if (process.env.READING_SECRET) throw Error("inherited secret"); console.log("+00012.50"); console.error("${errorCanary}");`];
  let args = success;

  // Local test stand-in for the authenticated Align command-reading endpoint.
  const standIn = createServer(async (req, res) => {
    reads.push(`${req.method} ${req.url}`);
    res.setHeader("content-type", "application/json");
    if (req.headers.authorization !== "Bearer local-test-device-token") {
      res.writeHead(401).end(JSON.stringify({ error: "invalid_token" }));
    } else if (req.method === "GET") {
      res.end(JSON.stringify({ goal_version: 3, executable, args }));
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      writes.push(JSON.parse(Buffer.concat(chunks).toString()));
      res.writeHead(201).end(JSON.stringify({ id: "mr_teststandin" }));
    }
  });
  await new Promise<void>((resolve) => standIn.listen(0, "127.0.0.1", resolve));
  t.after(() => { standIn.closeAllConnections(); standIn.close(); });
  const address = standIn.address();
  if (!address || typeof address === "string") throw new Error("Missing test stand-in address");
  const server = `http://127.0.0.1:${address.port}`;
  const sandbox = makeEnv({ ALIGN_SERVER: server, READING_SECRET: envCanary });
  t.after(sandbox.cleanup);
  const ctx = ctxFor(sandbox);
  ctx.db.close();
  saveCredentials(sandbox.home, { server_url: server, device_id: "dv_readingtest", access_token: "local-test-device-token",
    access_expires_at: new Date(Date.now() + 3600_000).toISOString(), refresh_token: "local-test-refresh-token", user: null });

  const run = () => runCli(sandbox, ["measure", "run", ...ids]);
  const allow = () => runCli(sandbox, ["measure", "allow", ...ids, "--", executable, ...args]);
  const optedOut = await run();
  assert.notEqual(optedOut.code, 0);
  assert.match(optedOut.stderr, /Allow this exact command/);
  assert.deepEqual(reads, []);
  assert.equal((await allow()).code, 0);
  assert.deepEqual(reads, []);
  args = ["-e", "throw Error('different command')"];
  assert.match((await run()).stderr, /The command has changed/);
  assert.equal(writes.length, 0);

  args = success;
  const ok = await run();
  assert.equal(ok.code, 0, ok.stderr);
  const firstRun = writes[0] as { run_id: string };
  assert.match(firstRun.run_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(writes, [{ goal_version: 3, run_id: firstRun.run_id, value: "12.5", exit_status: 0 }]);
  assert.match(ok.stdout, /Recorded reading 12.5/);

  const failures = [
    { code: `console.log("9 ${outputCanary}"); console.error("${errorCanary}");`, status: 0 },
    { code: "console.log('1e3')", status: 0 },
    { code: "console.log('0x10')", status: 0 },
    { code: `console.log("${outputCanary}"); process.exitCode = 7;`, status: 7 },
    { code: `console.log("${outputCanary}".repeat(5000)); setInterval(() => {}, 1000);`, status: null },
    { code: `console.error("${errorCanary}"); setInterval(() => {}, 1000);`, status: null },
  ];
  for (const { code, status } of failures) {
    args = ["-e", code];
    assert.equal((await allow()).code, 0);
    const result = await run();
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Recorded an unknown reading/);
    const failedRun = writes.at(-1) as { run_id: string };
    assert.match(failedRun.run_id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(writes.at(-1), { goal_version: 3, run_id: failedRun.run_id, value: null, exit_status: status });
    for (const canary of [outputCanary, errorCanary, envCanary])
      assert.ok(!result.stdout.includes(canary) && !result.stderr.includes(canary) && !JSON.stringify(writes).includes(canary));
  }
  const elevated = await runCli(sandbox, ["measure", "run", ...ids], { SUDO_UID: "501" });
  assert.match(elevated.stderr, /without elevated rights/);
  const exchanges = reads.length;
  assert.equal((await runCli(sandbox, ["measure", "revoke", ...ids])).code, 0);
  assert.notEqual((await run()).code, 0);
  assert.equal(reads.length, exchanges);
});

async function localTestStandIn(t: TestContext, handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

const targetIds = ["ws_readingtest", "g_readingtest", "m_readingtest"];
const command = { goal_version: 3, executable: process.execPath, args: ["-e", "console.log('9007199254740993')"] };

async function allowReading(t: TestContext, url: string) {
  const env = makeEnv({ ALIGN_SERVER: url });
  t.after(env.cleanup);
  const ctx = ctxFor(env);
  ctx.db.close();
  saveCredentials(env.home, { server_url: url, device_id: "dv_readingtest", access_token: "local-test-device-token",
    access_expires_at: new Date(Date.now() + 3600_000).toISOString(), refresh_token: "local-test-refresh-token", user: null });
  assert.equal((await runCli(env, ["measure", "allow", ...targetIds, "--", command.executable, ...command.args])).code, 0);
  return () => runCli(env, ["measure", "run", ...targetIds]);
}

test("command reading lookup and upload refuse redirects before sending anything to the destination", async (t) => {
  for (const method of ["GET", "POST"]) {
    for (const status of [307, 308]) {
      await t.test(`${method} ${status}`, async (t) => {
        let destinationRequests = 0;
        let pairedRequests = 0;
        const destination = await localTestStandIn(t, (req, res) => {
          destinationRequests++;
          res.end(JSON.stringify(req.method === "GET" ? command : { id: "mr_redirect" }));
        });
        const paired = await localTestStandIn(t, (req, res) => {
          pairedRequests++;
          if (req.method === method) res.writeHead(status, { location: `${destination}/reading` }).end();
          else res.end(JSON.stringify(command));
        });
        const run = await allowReading(t, paired);
        const result = await run();
        assert.equal(destinationRequests, 0, "the redirect destination received a request");
        assert.equal(pairedRequests, method === "GET" ? 1 : 2);
        assert.notEqual(result.code, 0);
        assert.match(result.stderr, /redirect/i);
      });
    }
  }
});

test("command readings preserve the exact decimal and retry the same submission after a lost reply", async (t) => {
  const writes: unknown[] = [];
  const paired = await localTestStandIn(t, async (req, res) => {
    if (req.method === "GET") return void res.end(JSON.stringify(command));
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    writes.push(JSON.parse(Buffer.concat(chunks).toString()));
    if (writes.length === 1) req.socket.destroy();
    else res.writeHead(writes.length === 2 ? 200 : 201).end(JSON.stringify({ id: "mr_teststandin" }));
  });
  const run = await allowReading(t, paired);
  const first = await run();
  assert.equal(first.code, 0, first.stderr);
  assert.match(first.stdout, /Recorded reading 9007199254740993\./);
  assert.equal(writes.length, 2);
  const payload = writes[0] as { run_id: string };
  assert.match(payload.run_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(payload, { goal_version: 3, run_id: payload.run_id, value: "9007199254740993", exit_status: 0 });
  assert.deepEqual(writes[1], payload);
  const second = await run();
  assert.equal(second.code, 0, second.stderr);
  assert.notEqual((writes[2] as { run_id: string }).run_id, payload.run_id);
});

test("command reading refusals explain how to use the chosen machine", async (t) => {
  for (const method of ["GET", "POST"]) {
    await t.test(method, async (t) => {
      const paired = await localTestStandIn(t, (req, res) => {
        if (req.method === method) res.writeHead(404).end(JSON.stringify({ error: "not_found" }));
        else res.end(JSON.stringify(command));
      });
      const run = await allowReading(t, paired);
      const result = await run();
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /Check the IDs and ask the goal owner to choose this machine/);
      assert.doesNotMatch(result.stderr, /HTTP 404|not_found/);
    });
  }
});
