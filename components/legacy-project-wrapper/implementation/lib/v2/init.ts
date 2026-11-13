import { migrateAuth } from "./auth";
import { migrate, openDb } from "./db";
import * as native from "../native/.bindings/server_readiness.js";

interface ReadinessTools {
  ready(): Promise<void>;
}

// Keep the existing shared application state and migration providers.
const tools = native.create_ready({ state: globalThis, openDb, migrateAuth, migrate }) as ReadinessTools;

export const ready = tools.ready;
