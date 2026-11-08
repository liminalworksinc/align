import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as native from "./native/.bindings/server_secrets.js";

interface ServerSecretTools {
  serverSecret(dataDir: string, env?: NodeJS.ProcessEnv): string;
  hmac(secret: string, payload: string): string;
}

// Bind actual host resources; the qualified service owns both helper behaviors.
const tools = native.create_tools({
  environment: () => process.env,
  join: path.join,
  dirname: path.dirname,
  existsSync: (file: string) => existsSync(/*turbopackIgnore: true*/ file),
  mkdirSync: (directory: string, options: { recursive: true }) => mkdirSync(/*turbopackIgnore: true*/ directory, options),
  writeFileSync: (file: string, value: string, options: { mode: number }) => writeFileSync(/*turbopackIgnore: true*/ file, value, options),
  readFileSync: (file: string, encoding: "utf8") => readFileSync(/*turbopackIgnore: true*/ file, encoding),
  randomBytes,
  createHmac,
}) as ServerSecretTools;

export const serverSecret = tools.serverSecret;
export const hmac = tools.hmac;
