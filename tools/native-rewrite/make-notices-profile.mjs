// Capture source notice behavior and its ordinary JavaScript library contracts.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const dir = path.dirname(fileURLToPath(import.meta.url));
const h = createRequire(import.meta.url)("./notices-harness.cjs");
const [source, profileOutput, contractsOutput] = process.argv.slice(2);
const methods = await h.loadBaseline(path.resolve(source));
const profile = JSON.parse(fs.readFileSync(path.resolve(dir, "../../.literate/native-projects/local-spend-stream/components/spend-stream/qualification/profile.json"), "utf8"));
const launcher = "eval(Buffer.from('" + fs.readFileSync(path.join(dir,"notices-harness.cjs")).toString("base64") + "','base64').toString())";
profile.profile_id = "align-share-notices-host-v1";
profile.source_command = ["node","-e",launcher,"--","--baseline"];
profile.generated_command = ["node","-e",launcher,"--","--generated"];
profile.covered_surface_ids = Object.values(h.CAPABILITY).sort();
profile.cases = [];
const totals = {};
for (const op of Object.keys(h.CAPABILITY).sort()) {
  totals[op] = h.countVectors(op);
  for (let start = 0, batch = 0; start < totals[op]; start += 96, batch++) {
    const limit = Math.min(96,totals[op] - start);
    profile.cases.push({case_id:h.CAPABILITY[op] + "-" + String(batch).padStart(3,"0"),
      arguments:[op,start,limit], expected_result:h.runBatch(methods,op,start,limit,true)});
  }
}
profile.cases.sort((a,b) => a.case_id < b.case_id ? -1 : a.case_id > b.case_id ? 1 : 0);
if (profile.cases.length > 64) throw new Error("notice oracle exceeds its case bound");
const common = "These are synchronous JavaScript functions with no I/O, environment or clock access. Preserve arguments and their enumerable properties. All strings are opaque and case-sensitive, including empty, whitespace, Unicode, newlines, quotes and prototype-like text. Do not trim, normalize or escape strings. The only shared state is the public SHARE_STATE_NOTICES mutable array described by the constants capability. Ordinary function calls never change that array. Return exact raw strings and booleans, with no transport envelope.";
const resumed = "Align: this session was resumed from its Align workspace, so its tools work again.";
const contracts = {kind:"library", capabilities:{
  "share-notices.constants":"JavaScript module share_notices/constants exports constants(). " + common + " Return a fresh ordinary wrapper with exactly SHARE_STATE_NOTICES and RESUMED_NOTICE. RESUMED_NOTICE is exactly " + JSON.stringify(resumed) + ". SHARE_STATE_NOTICES is one shared mutable string array, initially " + JSON.stringify(h.PREFIXES) + " in that order. Every constants() wrapper refers to the same array object, and is_share_state reads that same array on each call. Callers may mutate the array in place, including replacing its contents with an empty list or arbitrary string prefixes. Such changes must immediately affect matching, and restoring its contents restores matching. Do not return detached array copies, freeze the array, recreate its contents on calls, or use a private fixed prefix list for matching. Calling constants() itself never changes the shared array.",
  "share-notices.kind":"JavaScript module share_notices/kind exports kind(id:string):string. " + common + " Return the suffix after the first slash in id. With no slash return the entire id. An initial slash is removed, a final slash produces the empty suffix, and any subsequent slashes remain in the result. Empty input returns the empty string.",
  "share-notices.is-share-state":"JavaScript module share_notices/is_share_state exports is_share_state(kind:string):boolean. " + common + " Return whether kind starts with any current prefix in the public SHARE_STATE_NOTICES array. Read its current contents on each call. Match JavaScript startsWith semantics, without parsing slashes, lowercasing, substring matching, or interpreting patterns. An empty array matches nothing; an empty prefix matches every string. All nine initial prefixes, including older signed_in_ and workspace_back_ kinds, are supported.",
  "share-notices.resumed-held":"JavaScript module share_notices/resumed_held exports resumed_held(held:string[],reader:'user'|'model'):string. " + common + " held contains goal titles. Wrap each title in literal double quotes without escaping its contents. Let n be held.length. For n=0, which is 'a goal hold'. For n>0, which is 'the hold on ' followed by 'goal ' only for the model reader, then the quoted titles: for n=1 use its only title; for n>1 join all but the last title with ', ', append ' and ', and append the last quoted title. Let verb be 'block' when n>1, otherwise 'blocks'. For user, return exactly 'Align: this session was resumed from its Align workspace, so its stop is lifted, but '+which+' still '+verb+' its tools until it is released.'. For model, return exactly '[Align] This session was resumed from its Align workspace, so the stop no longer blocks its tools, but '+which+' still '+verb+' them until it is released. Tell the user and wait for instructions.'. Preserve title order and duplicates. Do not mutate held."
}};
fs.writeFileSync(profileOutput,JSON.stringify(profile)+"\n");
fs.writeFileSync(contractsOutput,JSON.stringify(contracts,null,2)+"\n");
console.log(JSON.stringify({cases:profile.cases.length,observations:Object.values(totals).reduce((a,b)=>a+b,0),totals}));
