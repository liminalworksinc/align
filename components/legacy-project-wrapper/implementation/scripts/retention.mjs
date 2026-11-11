#!/usr/bin/env node
import { launchOperator } from "./operator-launcher.mjs";
await launchOperator("retention", process.argv.slice(2));
