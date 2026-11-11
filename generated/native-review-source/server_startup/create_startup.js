'use strict';

function create_startup(context) {
  const {
    assertStartupConfig, environment, dataDir, dcrDir, warnings,
    chmodSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync,
    writeFileSync, readdirSync, join, dirname, pid, kill, once, warn
  } = context;

  function startup() {
    assertStartupConfig();
    if (environment().NEXT_PHASE === 'phase-production-build') return;

    const file = join(dataDir(), '.pid');
    const owner = existsSync(file) ? Number(readFileSync(file, 'utf8').trim()) : 0;
    if (owner && owner !== pid()) {
      let alive;
      try {
        kill(owner, 0);
        alive = true;
      } catch (error) {
        alive = error.code === 'EPERM';
      }
      if (alive) {
        throw new Error(`Another Align server (pid ${owner}) is using ${dirname(file)}. Stop it first.`);
      }
    }

    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, String(pid()), { mode: 0o600 });
    chmodSync(file, 0o600);

    const directory = dcrDir();
    if (existsSync(directory)) {
      for (const name of readdirSync(directory)) {
        if (/^_oauth_clients\.json\.[0-9a-f]{8,}\.tmp$/.test(name)) {
          rmSync(join(directory, name), { force: true });
        }
      }
    }
    for (const warning of warnings()) warn(warning);
    once('exit', function () {
      try {
        if (readFileSync(file, 'utf8').trim() === String(pid())) unlinkSync(file);
      } catch (_) {
        // Exit cleanup is best effort for every thrown value.
      }
    });
  }

  return { startup };
}

module.exports = { create_startup };
