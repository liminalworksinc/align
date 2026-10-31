// Runs once when the server starts, before it handles requests.
// A refused start must stop the process: `next start` logs an error thrown here but keeps running and answers
// every request with 500, which a platform would count as a live machine. Exit instead, so it fails visibly.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startup } = await import("./lib/startup");
    try {
      startup();
      // The v2 database is opened (and migrated) at every start, never during a build. Mode L then makes its local
      // owner on a fresh data directory and prints that person a sign-in code. The retention job (docs/RETENTION.md)
      // runs once now and then every 24 hours.
      if (process.env.NEXT_PHASE !== "phase-production-build") {
        const { ready } = await import("./lib/v2/init");
        await ready();
        const { ensureLocalOwner } = await import("./lib/v2/local-owner");
        await ensureLocalOwner();
        const { startRetention } = await import("./lib/v2/retention");
        await startRetention(process.env.HOSTED === "1");
      }
    } catch (e) {
      console.error((e as Error).message);
      process.exit(1);
    }
  }
}
