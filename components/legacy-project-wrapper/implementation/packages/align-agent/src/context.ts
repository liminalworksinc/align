import fs from "node:fs";
import path from "node:path";
import { openDb, type Db } from "./db.ts";
import { deviceSecret } from "./keys.ts";
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
  return { paths, home: paths.alignHome, db, secret: deviceSecret(paths.alignHome), config: loadConfig(paths.alignHome, env), env, log: writeLog };
}
