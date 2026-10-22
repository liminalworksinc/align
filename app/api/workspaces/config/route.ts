import { connection } from "next/server";
import { config } from "@/lib/config";
import { handle } from "@/lib/http";
import { countWorkspaces } from "@/lib/workspace";

export async function GET() {
  await connection();
  return handle(async () => {
    const cfg = config();
    const out = { signup_code_required: !cfg.allowOpenCreate, max_reached: (await countWorkspaces()) >= cfg.maxWorkspaces };
    // Hosted: /new states that this is a test server and when everything is deleted (go-C condition 3).
    return cfg.hosted ? { ...out, test_server: { delete_by: cfg.deleteBy } } : out;
  });
}
