import { chmodSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import { config } from "../config";
import { SCHEMA_VERSION, type Sql } from "./core.mts";
import { count } from "./plural.mts";
import { applyMigrations } from "../migration-coordinator.mts";
import { changePrograms } from "../storage-schema.mts";
import * as native from "../native/.bindings/storage_runtime.js";

type Row = Record<string, unknown>;

interface V2Db {
  file: string;
  domain: DatabaseSync;
  auth: DatabaseSync;
  stmts: Map<string, StatementSync>;
}

interface StorageService extends Sql {
  dbDir(): string;
  dbFile(): string;
  openDb(): V2Db;
  authDb(): DatabaseSync;
  all<T = Row>(sql: string, ...params: SQLInputValue[]): T[];
  get<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined;
  run(sql: string, ...params: SQLInputValue[]): number;
  sql: Sql;
  exec(sql: string): void;
  tx<T>(fn: () => T): Promise<T>;
  migrate(): void;
  LIVE_WS(ws: string): string;
  audit(ws: string | null, actor: string | null, action: string, objectId: string | null, at: string): void;
}

// Bind host resources and qualified dependencies; the service owns runtime behavior.
const storage = native.create_store({
  dataDir: () => config().dataDir,
  shared: globalThis as unknown as { __alignV2Db?: V2Db },
  DatabaseSync,
  join: path.join,
  existsSync: (file: string) => existsSync(/*turbopackIgnore: true*/ file),
  mkdirSync: (directory: string, options: { recursive: true; mode: number }) => mkdirSync(/*turbopackIgnore: true*/ directory, options),
  chmodSync: (file: string, mode: number) => chmodSync(/*turbopackIgnore: true*/ file, mode),
  random: () => Math.random(),
  setTimeout: (callback: () => void, milliseconds: number) => setTimeout(callback, milliseconds),
  schemaVersion: SCHEMA_VERSION,
  changePrograms,
  applyMigrations,
  count,
}) as StorageService;

export const dbDir = storage.dbDir;
export const dbFile = storage.dbFile;
export const openDb = storage.openDb;
export const authDb = storage.authDb;
export const all = storage.all;
export const get = storage.get;
export const run = storage.run;
export const sql = storage.sql;
export const exec = storage.exec;
export const tx = storage.tx;
export const migrate = storage.migrate;
export const LIVE_WS = storage.LIVE_WS;
export const audit = storage.audit;
