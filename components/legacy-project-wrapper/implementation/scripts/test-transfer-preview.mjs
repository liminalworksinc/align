#!/usr/bin/env node
// LIM-2529 experience preview: the outbox and receipt stand-in data keep the ratified spec's rules (spec #117), and the
// screens are off unless ALIGN_PREVIEW_TRANSFER_UI=1. No server. Usage: node scripts/test-transfer-preview.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_APPROVE_ATTEMPT, PRESETS, receiptFrom, standInOutbox, transferPreviewEnabled } from "../lib/v2/transfer-preview.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
}

const saved = process.env.ALIGN_PREVIEW_TRANSFER_UI;
delete process.env.ALIGN_PREVIEW_TRANSFER_UI;
check("the preview is off by default", transferPreviewEnabled() === false);
process.env.ALIGN_PREVIEW_TRANSFER_UI = "true";
check("only the exact value 1 turns the preview on", transferPreviewEnabled() === false);
process.env.ALIGN_PREVIEW_TRANSFER_UI = "1";
check("ALIGN_PREVIEW_TRANSFER_UI=1 turns the preview on", transferPreviewEnabled() === true);
if (saved === undefined) delete process.env.ALIGN_PREVIEW_TRANSFER_UI;
else process.env.ALIGN_PREVIEW_TRANSFER_UI = saved;

for (const page of ["outbox", "receipt"]) {
  const src = readFileSync(path.join(ROOT, "app/app/w/[ws]", page, "page.tsx"), "utf8");
  check(`the ${page} page is not found unless the preview is on`, /if \(!transferPreviewEnabled\(\)\) notFound\(\);/.test(src));
  // Found in review on Nov 25: checked in the page's static part, the build baked "not found" in for good. The check must
  // come after requireUser, which reads cookies and so makes the rest of the render per-request.
  check(`the ${page} switch is read per request, after the sign-in check`,
    src.indexOf("requireUser(") >= 0 && src.indexOf("transferPreviewEnabled()) notFound") > src.indexOf("requireUser("));
  const view = readFileSync(path.join(ROOT, "app/app/w/[ws]", page, "view.tsx"), "utf8");
  check(`the ${page} view says it is stand-in data and sends nothing`, /Preview with stand-in data\. Nothing here is sent/.test(view));
  check(`the ${page} view makes no request`, !/\bapi\(|fetch\(|useApi\(/.test(view));
}

const now = Date.parse("2026-11-25T22:00:00Z");
const items = standInOutbox(now, "team");
check("every outbox item expires 72 hours after it is made (founder ruling)", items.every((i) => Date.parse(i.expiresAt) - now === 72 * 3_600_000));
check("an excerpt never offers Always: each excerpt needs its author", items.filter((i) => i.capability === "excerpt").every((i) => !i.canAlways));
check("a vendor send names its recipient and shows the on-machine redaction line",
  items.filter((i) => i.capability === "suggestion" || i.capability === "model_check").every((i) => i.recipient.length > 0 && /^Secrets removed on this machine first: /.test(i.redaction ?? "")));
check("under Regulated, a vendor send offers no Always", standInOutbox(now, "regulated").filter((i) => i.capability === "suggestion").every((i) => !i.canAlways));
check("the ceiling presets are the mock's three, Regulated last", PRESETS.map((p) => p.id).join() === "private,team,regulated");

// The receipt follows the outbox (founder review, Nov 25: "link the receipt to the outbox").
check("the receipt starts empty: nothing decided, nothing left", receiptFrom(items, {}, "Shruti").length === 0);
const rows = receiptFrom(items, { ob_findings: "always", ob_excerpt: "no", ob_vendor: "once" }, "Shruti");
check("allowed items appear on the receipt and \"Not this\" does not", rows.map((r) => r.id).join() === "ob_findings,ob_vendor");
check("every receipt line names who allowed it and how", rows.every((r) => r.allowedBy === "Shruti")
  && rows.find((r) => r.id === "ob_findings")?.how === "standing rule" && rows.find((r) => r.id === "ob_vendor")?.how === "allowed once");
check("the vendor line is marked as a send to an outside model", rows.filter((r) => r.vendor).map((r) => r.id).join() === "ob_vendor");
const receiptView = readFileSync(path.join(ROOT, "app/app/w/[ws]/receipt/view.tsx"), "utf8");
check("undo on a vendor send says it can't be recalled (spec #117, honest undo)", /already sent and can’t be recalled/.test(receiptView));

// The mock's wording (founder review, Nov 25: "use the mock's wording").
const byId = Object.fromEntries(items.map((i) => [i.id, i]));
check("Always on findings uses the mock's confirmation", byId.ob_findings.confirm.always === "Rule added to “Onboarding v2”: agent findings are now visible to the team. Change it on the goal any time.");
check("a waiting item never says it was sent", items.every((i) => !/^Sent\b/.test(i.note)));
check("the excerpt note is the mock's", byId.ob_excerpt.note === "Your words: no “always” option. Each excerpt needs you.");
check("the agent's attempt to approve for itself is refused in the mock's words", AGENT_APPROVE_ATTEMPT.answer === "→ refused: agents can ask, not approve. approvals happen in Align, signed in as a person.");
check("every item shows the agent what it was told, for every state", items.every((i) => ["pending", "once", "always", "no"].every((s) => i.terminal[s].length > 0)));

console.log(`\ntest-transfer-preview: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
