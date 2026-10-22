// Runs once when the server starts, before it handles requests.
// A refused start must stop the process: `next start` logs an error thrown here but keeps running and answers
// every request with 500, which a platform would count as a live machine. Exit instead, so it fails visibly.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startup } = await import("./lib/startup");
    try {
      startup();
    } catch (e) {
      console.error((e as Error).message);
      process.exit(1);
    }
  }
}
