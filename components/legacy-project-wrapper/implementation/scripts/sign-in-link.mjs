#!/usr/bin/env node
// npm run sign-in-link [email]: ask the running Mode L server for a fresh sign-in code. The server prints the link in
// its own terminal and writes it to <data>/v2/sign-in.txt; this script never sees or prints the code.
// The email defaults to ALIGN_LOCAL_OWNER_EMAIL or owner@align.localhost (the local owner); the server to
// http://127.0.0.1:<PORT or 3100>.

const email = (process.argv[2] || process.env.ALIGN_LOCAL_OWNER_EMAIL || "owner@align.localhost").trim().toLowerCase();
const base = `http://127.0.0.1:${process.env.PORT || 3100}`;

let res;
try {
  res = await fetch(`${base}/api/v2/auth/email-otp/send-verification-otp`, {
    method: "POST",
    // This server's own origin: Better Auth refuses a fetch without one.
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email, type: "sign-in" }),
    signal: AbortSignal.timeout(15_000),
  });
} catch {
  console.error(`No Align server is running at ${base}. Start it with npm start, then try again.`);
  process.exit(1);
}
if (res.status === 429) {
  console.error("Too many codes were sent. Wait a few minutes, then try again.");
  process.exit(1);
}
if (!res.ok) {
  const body = await res.json().catch(() => ({}));
  console.error(`The server at ${base} refused (${res.status}${body.message ? `: ${body.message}` : ""}).`);
  process.exit(1);
}
console.log(`A sign-in link for ${email} was printed in the terminal running Align and saved in <data>/v2/sign-in.txt (data/v2/sign-in.txt by default). It works for 5 minutes.`);
