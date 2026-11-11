#!/usr/bin/env node
import { launchOperator } from "./operator-launcher.mjs";
await launchOperator("align-admin", process.argv.slice(2));
