'use strict';

function create_local_owner_bootstrap(resources) {
  const config = resources.config;
  const get = resources.get;
  const localOwnerEmail = resources.localOwnerEmail;
  const getAuth = resources.getAuth;
  const getHeadersConstructor = resources.getHeadersConstructor;
  const readPort = resources.readPort;
  const getConsole = resources.getConsole;

  async function ensureLocalOwner() {
    if (config().hosted) return;
    if (get('SELECT 1 AS x FROM ba_user LIMIT 1')) return;
    const email = localOwnerEmail();
    const auth = getAuth();
    const ctx = await auth.$context;
    await ctx.internalAdapter.createUser(
      { email, name: 'Local owner', emailVerified: true },
      { method: 'admin' }
    );
    const api = auth.api;
    try {
      await api.sendVerificationOTP({
        body: { email, type: 'sign-in' },
        headers: new (getHeadersConstructor())({ host: '127.0.0.1:' + (readPort() || '3100') })
      });
    } catch {
      getConsole().error(`Align could not print a sign-in code for ${email}. Run npm run sign-in-link to get one.`);
    }
  }

  return { ensureLocalOwner };
}

module.exports = { create_local_owner_bootstrap };
