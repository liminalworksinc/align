import { connection } from "next/server";
import { Suspense } from "react";
import { config } from "@/lib/config";
import NewWorkspace from "./NewWorkspace";

// The test-server notice (go-C condition 3) is decided here on the server, so it never depends on a client fetch.
export default function NewWorkspacePage() {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <WithConfig />
    </Suspense>
  );
}

async function WithConfig() {
  await connection(); // read the environment per request, not at build time
  const cfg = config();
  return <NewWorkspace testServer={cfg.hosted ? { delete_by: cfg.deleteBy } : null} />;
}
