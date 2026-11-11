'use strict';

function create_retention_runner(resources) {
  const { core, runRetention, globalState, readConsole, readSetInterval } = resources;
  async function startRetention(hosted) {
    async function loggedRun() {
      try {
        const counts = await runRetention(core.retentionNow());
        if (Object.values(counts).some(n => n > 0)) {
          readConsole().log('Align retention: ' + core.describeCounts(counts));
        }
      } catch (error) {
        readConsole().error('Align retention failed:', hosted ? (error?.name ?? 'unknown') : error);
      }
    }
    await loggedRun();
    if (globalState.__alignRetention) return;
    const setInterval = readSetInterval();
    globalState.__alignRetention = setInterval(() => { void loggedRun(); }, core.RETENTION_INTERVAL_MS);
    globalState.__alignRetention.unref?.();
  }
  return { startRetention };
}

module.exports = { create_retention_runner };
