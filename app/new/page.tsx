import { connection } from "next/server";
import { config } from "@/lib/config";
import NewWorkspace from "./NewWorkspace";

// The test-server notice (go-C condition 3) is decided here on the server, so it never depends on a client fetch.
export default async function NewWorkspacePage() {
  await connection();
  const cfg = config();
  return <NewWorkspace testServer={cfg.hosted ? { delete_by: cfg.deleteBy } : null} />;
}
