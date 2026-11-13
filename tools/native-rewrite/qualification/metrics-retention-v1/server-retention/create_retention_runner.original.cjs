"use strict";
// Derived original test adapter. Never a generation input.
function create_retention_runner(resources) {
const {core,runRetention,globalState,readConsole,readSetInterval} = resources;
const g = globalState;
async function runLogged(hosted) {
    try {
        const c = await runRetention(core.retentionNow());
        if (Object.values(c).some((v) => v > 0))
            readConsole().log(`Align retention: ${core.describeCounts(c)}`);
    }
    catch (e) {
        readConsole().error("Align retention failed:", hosted ? (e?.name ?? "unknown") : e);
    }
}
/** Run the job now and every 24 hours in this server process (instrumentation.ts; never during a build). */
async function startRetention(hosted) {
    await runLogged(hosted);
    if (g.__alignRetention)
        return;
    g.__alignRetention = readSetInterval()(() => void runLogged(hosted), core.RETENTION_INTERVAL_MS);
    g.__alignRetention.unref?.();
}

return {startRetention};
}
module.exports = {create_retention_runner};
