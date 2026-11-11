#!/usr/bin/env node
import { create_operator_shortcuts } from "../lib/native/.bindings/operator_shortcuts.js";
const runAdmin = () => import("./align-admin.mjs").then(module => module.runAdmin());
await create_operator_shortcuts({process, console, fetch, AbortSignal, runAdmin}).signInLink();
