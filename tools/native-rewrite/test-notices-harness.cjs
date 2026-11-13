const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./notices-harness.cjs");
function fixture(detached = false) {
  const prefixes = [...h.PREFIXES];
  return {constants:()=>({SHARE_STATE_NOTICES: detached ? [...prefixes] : prefixes, RESUMED_NOTICE:"fixture"}),
    kind:id=>id,matches:kind=>prefixes.some(p=>kind.startsWith(p)),resumed:titles=>titles.join(" ")};
}
test("notice matrix covers old prefixes, both readers, opaque strings and public-state probes",()=>{
  assert(h.countVectors("kind") > 300);
  assert(h.countVectors("matches") > 100);
  assert(h.countVectors("resumed") > 500);
  assert.equal(h.countVectors("constants"),8);
  assert([...h.vectors("matches")].some(([kind])=>kind==="workspace_back_"));
  assert([...h.vectors("resumed")].some(([titles,reader])=>titles.length===6 && reader==="model"));
});
test("notice probes detect detached prefix copies and restore public arrays",()=>{
  const linked = fixture(),detached = fixture(true),before=[...linked.constants().SHARE_STATE_NOTICES];
  const a=h.constantsProbe(linked,"replace",["custom_"]),b=h.constantsProbe(detached,"replace",["custom_"]);
  assert.equal(a.same_prefix_reference,true);assert.equal(b.same_prefix_reference,false);assert.notDeepEqual(a,b);
  assert.deepEqual(linked.constants().SHARE_STATE_NOTICES,before);
});
test("notice observations detect argument and public-state mutations and invalid ranges",()=>{
  const normal=fixture(),mutant=fixture();mutant.resumed=titles=>{const result=titles.join(" ");titles.extra=undefined;return result;};
  assert.notDeepEqual(h.runBatch(normal,"resumed",1,2),h.runBatch(mutant,"resumed",1,2));
  assert.throws(()=>h.runBatch(mutant,"resumed",1,1,true),/mutates/);
  const changed=fixture();changed.matches=()=>{changed.constants().SHARE_STATE_NOTICES.push("extra_");return false;};
  assert.throws(()=>h.runBatch(changed,"matches",0,1,true),/public state/);
  for(const [op,start,limit] of [["kind",0,0],["__proto__",0,1],["constants",8,1]])assert.throws(()=>h.runBatch(normal,op,start,limit));
});
