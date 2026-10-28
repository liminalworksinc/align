// Test-only network stand-ins for scripts/test-oauth.mjs, loaded into the server with NODE_OPTIONS=--import, never
// in production. They let the test reach the client-document fetch (lib/oauth/clients.ts) without real DNS:
// - <kind>[-<anything>].addr.align-test resolves to the fixed address for <kind> below, so the test can check which
//   addresses the fetch refuses (an IPv6 address carrying a loopback IPv4 one, ULA, documentation ranges).
// - pub[-<anything>].addr.align-test resolves to a public address, and its TLS connection goes to the test's own
//   document server on 127.0.0.1:ALIGN_TEST_DOC_PORT (slow or quick answers, chosen by the URL path).
import dns from "node:dns";
import { syncBuiltinESMExports } from "node:module";
import tls from "node:tls";

const ADDR = {
  mapped: "::ffff:7f00:1", // ::ffff:127.0.0.1 written in hex
  compat: "::7f00:1", // IPv4-compatible 127.0.0.1
  sixtofour: "2002:7f00:1::1", // 6to4 for 127.0.0.1
  teredo: "2001:0:4136:e378:8000:63bf:80ff:fffe", // Teredo
  nat64: "64:ff9b::7f00:1", // NAT64 for 127.0.0.1
  ula: "fd00::1",
  linklocal: "fe80::1",
  doc4: "192.0.2.10", // TEST-NET-1
  pub: "93.184.215.14",
};
const NAME = /^([a-z0-9]+)(?:-[a-z0-9]+)?\.addr\.align-test$/;

const realLookup = dns.lookup;
dns.lookup = function lookup(host, options, cb) {
  if (typeof options === "function") [cb, options] = [options, {}];
  const m = NAME.exec(String(host));
  if (!m || !ADDR[m[1]]) return realLookup.call(this, host, options, cb);
  const address = ADDR[m[1]];
  const family = address.includes(":") ? 6 : 4;
  process.nextTick(() => (options?.all ? cb(null, [{ address, family }]) : cb(null, address, family)));
};

const port = Number(process.env.ALIGN_TEST_DOC_PORT || 0);
if (port) {
  const realConnect = tls.connect;
  tls.connect = function connect(...args) {
    const o = args.find((a) => a && typeof a === "object");
    const host = o?.servername || o?.host || "";
    if (/^pub(?:-[a-z0-9]+)?\.addr\.align-test$/.test(host)) return realConnect.call(this, { ...o, host: "127.0.0.1", port, lookup: undefined, rejectUnauthorized: false });
    return realConnect.apply(this, args);
  };
}
syncBuiltinESMExports();
