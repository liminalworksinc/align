import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertStartupConfig, config } from "./config";
import { dcrDir } from "./oauth/clients";
import { v2Warnings } from "./v2/config";
import * as native from "./native/.bindings/server_startup.js";

interface StartupTools {
  startup(): void;
}

// Bind host resources and existing providers to the qualified startup operation.
const tools = native.create_startup({
  assertStartupConfig,
  environment: () => process.env,
  dataDir: () => config().dataDir,
  dcrDir,
  warnings: v2Warnings,
  chmodSync: (file: string, mode: number) => chmodSync(/*turbopackIgnore: true*/ file, mode),
  existsSync: (file: string) => existsSync(/*turbopackIgnore: true*/ file),
  mkdirSync: (directory: string, options: { recursive: true; mode: number }) => mkdirSync(/*turbopackIgnore: true*/ directory, options),
  readFileSync: (file: string, encoding: "utf8") => readFileSync(/*turbopackIgnore: true*/ file, encoding),
  rmSync: (file: string, options: { force: true }) => rmSync(/*turbopackIgnore: true*/ file, options),
  unlinkSync: (file: string) => unlinkSync(/*turbopackIgnore: true*/ file),
  writeFileSync: (file: string, value: string, options: { mode: number }) => writeFileSync(/*turbopackIgnore: true*/ file, value, options),
  readdirSync: (directory: string) => readdirSync(/*turbopackIgnore: true*/ directory),
  join: path.join,
  dirname: path.dirname,
  pid: () => process.pid,
  kill: (pid: number, signal: 0) => process.kill(pid, signal),
  once: (event: "exit", callback: () => void) => process.once(event, callback),
  warn: (value: string) => console.warn(value),
}) as StartupTools;

export const startup = tools.startup;
