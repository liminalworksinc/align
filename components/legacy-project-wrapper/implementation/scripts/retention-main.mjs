#!/usr/bin/env node
import { create_operator_shortcuts } from "../lib/native/.bindings/operator_shortcuts.js";
import { runAdmin } from "./align-admin.mjs";
await create_operator_shortcuts({process, console, fetch, AbortSignal, runAdmin}).retention();
