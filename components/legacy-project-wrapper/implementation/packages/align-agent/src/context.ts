import fs from "node:fs";
import path from "node:path";
import { openDb, type Db } from "./db.ts";
import { deviceSecret } from "./keys.ts";
import { migrateLocal } from "./migrate.ts";
import { catchUpOtherBuilds, markBuild } from "./hot.ts";
import type { BuildMark } from "./build.ts";
import { ensureHome, resolvePaths, type Paths } from "./paths.ts";
import { layout } from "./shared/layout.ts";
import { readJson, writeJsonAtomic } from "./shared/fsx.ts";

export interface Config {
  server_url: string;
  default_workspace: string | null;
  tail_days: number;
  goals_refresh_ms: number;
  device_name: string | null;
  /** The local drift notice (D5): the Stop hook checks the last reply against the bound goal's limits. */
  drift: boolean;
}

export const DEFAULT_CONFIG: Config = {
  server_url: "http://127.0.0.1:3100",
  default_workspace: null,
  tail_days: 14,
  goals_refresh_ms: 10 * 60_000,
  device_name: null,
  drift: true,
};

export interface Ctx {
  paths: Paths;
  home: string;
  db: Db;
  secret: Buffer;
  config: Config;
  env: NodeJS.ProcessEnv;
  log: (msg: string) => void;
  /** The device this pass or command is bound to (`bindDevice` in api.ts): authenticated calls refuse to go on as
   *  another one. Undefined when unbound. */
  boundDevice?: string | null;
  /** When the sync pass running in this process started (ms), for what it tells sessions that started with it. */
  passStartedAt?: number;
  /** A newer build has written to this database (its mark): this one leaves the sessions' notices about their share,
   *  hot files and latch files to it (E2E-AGENT cycle 14). Null when this build is the newest. */
  superseded?: BuildMark | null;
}

export function loadConfig(alignHome: string, env: NodeJS.ProcessEnv = process.env): Config {
  const file = readJson<Partial<Config>>(layout.config(alignHome)) || {};
  const c: Config = { ...DEFAULT_CONFIG, ...file };
  if (env.ALIGN_SERVER) c.server_url = env.ALIGN_SERVER;
  if (env.ALIGN_TAIL_DAYS) c.tail_days = Number(env.ALIGN_TAIL_DAYS);
  return c;
}

export function saveConfig(alignHome: string, patch: Partial<Config>): Config {
  const current = readJson<Partial<Config>>(layout.config(alignHome)) || {};
  const next = { ...DEFAULT_CONFIG, ...current, ...patch };
  writeJsonAtomic(layout.config(alignHome), next);
  return next;
}

export function openCtx(env: NodeJS.ProcessEnv = process.env, log?: (m: string) => void): Ctx {
  const paths = resolvePaths(env);
  ensureHome(paths.alignHome);
  if (!fs.existsSync(layout.config(paths.alignHome))) saveConfig(paths.alignHome, {});
  const db = openDb(paths.alignHome);
  const logFile = path.join(layout.logs(paths.alignHome), "align.log");
  const writeLog =
    log ||
    ((m: string) => {
      try {
        fs.appendFileSync(logFile, `${new Date().toISOString()} ${m}\n`, { mode: 0o600 });
      } catch {
        /* ignore */
      }
    });
  const ctx: Ctx = { paths, home: paths.alignHome, db, secret: deviceSecret(paths.alignHome), config: loadConfig(paths.alignHome, env), env, log: writeLog };
  // The newest build that has written here, before anything is written (E2E-AGENT cycle 14).
  ctx.superseded = markBuild(ctx);
  // A newer agent's first command or pass brings the database up to date (src/migrate.ts).
  migrateLocal(ctx);
  // What another build wrote since this one last looked: re-rendered from the state now.
  try {
    catchUpOtherBuilds(ctx);
  } catch (e) {
    ctx.log(`catching up with another build failed: ${(e as Error).message}`);
  }
  return ctx;
}
