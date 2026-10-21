import { connection } from "next/server";
import { config } from "@/lib/config";
import { handle } from "@/lib/http";
import { countWorkspaces } from "@/lib/workspace";

export async function GET() {
  await connection();
  return handle(async () => {
    const cfg = config();
    return { signup_code_required: !cfg.allowOpenCreate, max_reached: (await countWorkspaces()) >= cfg.maxWorkspaces };
  });
}
