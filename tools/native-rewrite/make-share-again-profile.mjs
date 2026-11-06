// Capture share-again wording observations and its natural library contracts.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const dir = path.dirname(fileURLToPath(import.meta.url));
const h = createRequire(import.meta.url)("./share-again-harness.cjs");
const [source, profileOutput, contractsOutput] = process.argv.slice(2);
const functions = await h.loadBaseline(path.resolve(source));
const profile = JSON.parse(fs.readFileSync(path.resolve(dir, "../../.literate/native-projects/local-spend-stream/components/spend-stream/qualification/profile.json"), "utf8"));
const launcher = "eval(Buffer.from('" + fs.readFileSync(path.join(dir, "share-again-harness.cjs")).toString("base64") + "','base64').toString())";
profile.profile_id = "align-share-again-host-v1";
profile.source_command = ["node", "-e", launcher, "--", "--baseline"];
profile.generated_command = ["node", "-e", launcher, "--", "--generated"];
profile.covered_surface_ids = Object.values(h.CAPABILITY).sort();
profile.cases = [];
const totals = {};
for (const op of Object.keys(h.CAPABILITY).sort()) {
  totals[op] = h.countVectors(op);
  for (let start = 0, batch = 0; start < totals[op]; start += 96, batch++) {
    const limit = Math.min(96, totals[op] - start);
    profile.cases.push({case_id: h.CAPABILITY[op] + "-" + String(batch).padStart(3, "0"),
      arguments: [op, start, limit], expected_result: h.runBatch(functions[op], op, start, limit, true)});
  }
}
profile.cases.sort((a,b) => a.case_id < b.case_id ? -1 : a.case_id > b.case_id ? 1 : 0);
if (profile.cases.length > 64) throw new Error("share-again oracle exceeds its case bound");
const common = "These are synchronous JavaScript functions with no I/O or hidden state. Preserve every argument, array and object. All names and string parts are opaque strings, including empty, whitespace, Unicode, newlines and prototype-like names; do not trim, normalize, escape or relabel them. Return exact raw strings and ordered plain arrays/objects. ShareAgainPart is a string, {device:string}, or {devices_page:string}. who is null for the reader, or any string for another person's name. A device is null or {name:string,signed_out:boolean,has_workspace:boolean}.";
const contracts = {kind: "library", capabilities: {
  "share-again.text": "JavaScript module share_again/text exports text(parts). " + common + " parts is an array of ShareAgainPart. Concatenate each part in order with no separator: a string contributes itself; an object with a device property contributes that value; otherwise contribute its devices_page value. Empty parts yield the empty string. Do not mutate parts or its objects.",
  "share-again.words": "JavaScript module share_again/words exports words(device, who), returning ShareAgainPart[]. " + common + " Let you mean who === null. If the device exists, signed_out is false and has_workspace is true, return exactly three parts: string 'Its machine, ', object {device:device.name}, and the string ', has this workspace again: to share it again, ' followed by 'run' for you or who+' runs' otherwise, followed by ' ::align share in the session.'. For every other case let back be 'To share it again now that ' followed by 'you are' for you or who+' is' otherwise, followed by ' back, '. If the device exists and signed_out is false, return exactly five parts: back followed by 'give' for you or who+' gives' otherwise, then ' its machine, '; {device:device.name}; ', this workspace on ' followed by 'your' for you or 'their' otherwise, then one space; {devices_page:'Devices page'}; and ' (Give this device the workspace), then ' followed by 'run' for you or 'runs' otherwise, then ' ::align share in the session.'. If the device is null or signed_out is true, return a one-element array. Its string is back followed by 'run' for you or who+' runs' otherwise, then ' align login on that machine (it has signed out of Align) and ', then 'give' for you or 'gives' otherwise, then ' it this workspace, then ::align share in the session.'. has_workspace is irrelevant for signed-out devices. Preserve the exact part boundaries as well as text.",
  "share-again.stopped": "JavaScript module share_again/stopped exports stopped(who, options), returning a string. " + common + " options is optional or undefined, or an object with optional deleted:boolean. Omitted or undefined deleted defaults to false. Let lead be 'You' for a null who, otherwise the unmodified who string, followed by ' stopped sharing this session, so a stop or resume can\u0027t reach it'. When deleted is true, return lead+'. Their account was deleted, so nothing can share it again.'. Otherwise return lead+', and it won\u0027t be shared again, even if its machine runs ::align share. To share ' followed by 'your' for null who or 'their' otherwise, then ' work again, ', then 'start' for null who or who+' starts' otherwise, then ' a new session and ', then 'run' for null who or 'runs' otherwise, then ' ::align share in it.'."
}};
fs.writeFileSync(profileOutput, JSON.stringify(profile) + "\n");
fs.writeFileSync(contractsOutput, JSON.stringify(contracts, null, 2) + "\n");
console.log(JSON.stringify({cases: profile.cases.length, observations: Object.values(totals).reduce((a,b) => a+b, 0), totals}));
