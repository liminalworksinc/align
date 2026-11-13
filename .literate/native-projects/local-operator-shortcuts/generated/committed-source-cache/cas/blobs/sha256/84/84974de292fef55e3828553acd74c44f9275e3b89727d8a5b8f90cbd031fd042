'use strict';

function create_operator_shortcuts(resources) {
  async function retention() {
    const process = resources.process;
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--dry-run')) {
      resources.console.error('usage: node scripts/retention.mjs [--dry-run]   (the same as: node scripts/align-admin.mjs retention run [--dry-run])');
      process.exit(2);
      return;
    }
    process.argv.splice(2, args.length, 'retention', 'run', ...args);
    const runAdmin = resources.runAdmin;
    await runAdmin();
  }

  async function signInLink() {
    const process = resources.process;
    const email = (process.argv[2] || process.env.ALIGN_LOCAL_OWNER_EMAIL || 'owner@align.localhost').trim().toLowerCase();
    const base = 'http://127.0.0.1:' + (process.env.PORT || 3100);
    let response;
    try {
      const fetch = resources.fetch;
      response = await fetch(base + '/api/v2/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base },
        body: JSON.stringify({ email, type: 'sign-in' }),
        signal: resources.AbortSignal.timeout(15000)
      });
    } catch (error) {
      resources.console.error(`No Align server is running at ${base}. Start it with npm start, then try again. If it runs on another port, name it: PORT=<port> npm run sign-in-link`);
      process.exit(1);
      return;
    }
    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      resources.console.error(body.message || 'Too many codes were sent. Wait a few minutes, then try again.');
      process.exit(1);
      return;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      resources.console.error(`The server at ${base} refused (${response.status}${body.message ? ': ' + body.message : ''}).`);
      process.exit(1);
      return;
    }
    resources.console.log(`A sign-in link for ${email} was printed in the terminal running Align and saved in <data>/v2/sign-in.txt (data/v2/sign-in.txt by default). It works for 5 minutes.`);
  }
  return { retention, signInLink };
}

module.exports = { create_operator_shortcuts };
