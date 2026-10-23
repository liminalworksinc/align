// Runs once when the server starts, before it handles requests.
// A refused start must stop the process: `next start` logs an error thrown here but keeps running and answers
// every request with 500, which a platform would count as a live machine. Exit instead, so it fails visibly.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startup } = await import("./lib/startup");
    try {
      startup();
      // Align v2 opens (and migrates) its database only when ALIGN_V2=1, never during a build.
      if (process.env.ALIGN_V2 === "1" && process.env.NEXT_PHASE !== "phase-production-build") {
        const { ready } = await import("./lib/v2/init");
        await ready();
      }
    } catch (e) {
      console.error((e as Error).message);
      process.exit(1);
    }
  }
}
