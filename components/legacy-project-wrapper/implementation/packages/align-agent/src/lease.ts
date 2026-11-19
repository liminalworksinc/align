import fs from "node:fs";
import path from "node:path";
import type { Ctx } from "./context.ts";
import { tx } from "./db.ts";
import { randomId } from "./shared/fsx.ts";

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** Acquisition and stale-file replacement are serialized by a short local transaction. Work runs outside it. */
export function takeLease(ctx: Ctx, name: "sync" | "analysis" | "analysis-decision"): (() => void) | null {
  const file = path.join(ctx.home, `${name}.lock`);
  const owner = `${process.pid} ${randomId("")}`;
  const owns = () => {
    try {
      return fs.readFileSync(file, "utf8") === owner;
    } catch {
      return false;
    }
  };
  const acquired = tx(ctx.db, () => {
    try {
      const current = fs.readFileSync(file, "utf8");
      const pid = Number(current.trim().split(/\s+/, 1)[0]);
      if (Number.isSafeInteger(pid) && pid > 0 ? alive(pid) : Date.now() - fs.statSync(file).mtimeMs < 120_000) return false;
      fs.unlinkSync(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      fs.writeFileSync(file, owner, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
    return true;
  });
  if (!acquired) return null;
  const heartbeat = setInterval(() => {
    try {
      if (owns()) {
        const now = new Date();
        fs.utimesSync(file, now, now);
      }
    } catch {
      /* Acquisition still checks whether the owner is alive. */
    }
  }, 30_000).unref();
  return () => {
    clearInterval(heartbeat);
    tx(ctx.db, () => {
      if (owns()) fs.unlinkSync(file);
    });
  };
}
