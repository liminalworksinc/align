#!/usr/bin/env node
import { launchOperator } from "./operator-launcher.mjs";
await launchOperator("sign-in-link", process.argv.slice(2));
