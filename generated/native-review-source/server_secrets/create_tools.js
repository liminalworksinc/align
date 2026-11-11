'use strict';

function create_tools(context) {
  const {
    environment, join, dirname, existsSync, mkdirSync, writeFileSync,
    readFileSync, randomBytes, createHmac
  } = context;

  function serverSecret(dataDir, env = environment()) {
    if (env.ALIGN_SECRET) return env.ALIGN_SECRET;
    const file = join(dataDir, '.secret');
    if (!existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true });
      const bytes = randomBytes(32);
      writeFileSync(file, bytes.toString('hex'), { mode: 0o600 });
    }
    return readFileSync(file, 'utf8').trim();
  }

  function hmac(secret, payload) {
    return createHmac('sha256', secret).update(payload).digest('base64url');
  }

  return { serverSecret, hmac };
}

module.exports = { create_tools };
