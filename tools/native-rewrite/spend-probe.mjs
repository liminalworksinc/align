// Verifier-owned source/generated parity probe. Inputs stay JSON text so the
// evidence document can represent fractional invalid counters canonically.
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [mode, raw] = process.argv.slice(1);
const inputs = JSON.parse(raw).map((encoded) => JSON.parse(encoded));
const op = inputs[0][0];
if (!inputs.every((input) => input[0] === op)) throw new Error("mixed capability batch");
const ops = ["price_table_version", "price_row", "valid_counts", "price_request",
  "claude_counts", "parse_claude_lines", "parse_codex_lines"];
if (!ops.includes(op)) throw new Error(`unknown operation ${op}`);

let fn;
if (mode === "--baseline") {
  const imp = (f) => import(pathToFileURL(path.join(process.cwd(), f)).href);
  const prices = await imp("prices.ts"), claude = await imp("claude.ts"), codex = await imp("codex.ts");
  fn = {
    price_table_version: () => prices.PRICE_TABLE_VERSION,
    price_row: (model) => prices.priceRow(model),
    valid_counts: (c) => prices.validCounts(c),
    price_request: (model, c, total) => prices.priceRequest(model, c, total === null ? undefined : total),
    claude_counts: (u) => claude.claudeCounts(u),
    parse_claude_lines: (file, lines) => {
      const st = claude.initClaudeState(file);
      return lines.flatMap((l) => claude.parseClaudeLine(l, st));
    },
    parse_codex_lines: (group, lines) => {
      const st = codex.initCodexState(group);
      return lines.flatMap((l) => codex.parseCodexLine(l, st));
    },
  }[op];
} else if (mode === "--generated") {
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (path.basename(dir) === "spend_meter" &&
        [`${op}.js`, `${op}.mjs`, `${op}.cjs`].includes(name)) hits.push(full);
    }
  };
  walk(process.cwd());
  if (hits.length !== 1) throw new Error(`expected one spend_meter/${op} module, found ${hits.length}`);
  const mod = await import(pathToFileURL(hits[0]).href);
  fn = mod[op] ?? mod.default?.[op] ?? (typeof mod.default === "function" ? mod.default : undefined);
} else throw new Error("mode must be --baseline or --generated");
if (typeof fn !== "function") throw new Error(`${op} is not an exported function`);
const out = [];
for (const [, ...args] of inputs) {
  try {
    const v = await fn(...args);
    out.push({ value: v === undefined ? "<undefined>" : v });
  } catch (e) {
    out.push({ error: e?.constructor?.name ?? "Error" });
  }
}
process.stdout.write(JSON.stringify(out) + "\n");
