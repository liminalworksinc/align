#!/usr/bin/env node
import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../lib/v2/core.mts";
import * as retention from "../lib/v2/retention-core.mts";
import * as metrics from "../lib/v2/metrics-core.mts";
import { create_operator_admin } from "../lib/native/.bindings/operator_admin.js";

export function runAdmin() {
  return create_operator_admin({fs, path, core, retention, metrics, loadSqlite: () => import("node:sqlite"), process, console, Date, URL}).run();
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) await runAdmin();
