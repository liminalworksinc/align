const test=require("node:test"),assert=require("node:assert/strict");
const h=require("./markdown-harness.cjs");
const fingerprint=(methods,op,vector)=>h.encode(h.observe(methods,op,vector));

test("Markdown vectors cover Unicode, callbacks, indented roots and the real document fixtures",()=>{
  assert.equal(h.countVectors("slug"),0x110000+4*h.TEXTS.length);
  assert.equal(h.DOCUMENTS.length,7);
  assert(h.DOCUMENTS.every(d=>d.text&&/^[a-f0-9]{64}$/.test(d.sha256)));
  assert(h.OPTIONS.some(o=>o.resolve==="throw-error")&&h.OPTIONS.some(o=>o.resolve==="throw-object"));
  assert(h.OPTIONS.some(o=>o.fill==="empty-key")&&h.OPTIONS.some(o=>o.fill==="null-prototype"));
  assert([...h.vectors("parseMarkdown")].some(v=>Array.isArray(v)&&v[0].startsWith("  - first\n")));
  assert([...h.vectors("parseInline")].some(v=>v.probe==="fresh"));
  for(const op of h.FUNCTIONS)assert(h.countVectors(op)>0);
});

test("Markdown fingerprints detect nested input replacement and changed result prototypes",()=>{
  const vector=["text",h.OPTIONS[3]],good={parseInline:()=>[]};
  const mutate={parseInline:(_text,opts)=>{opts.fill={...opts.fill};return [];}};
  assert.notDeepEqual(fingerprint(good,"parseInline",vector),fingerprint(mutate,"parseInline",vector));
  const plain={parseInline:()=>[{t:"text",v:"x"}]};
  const changed={parseInline:()=>[Object.assign(Object.create(null),{t:"text",v:"x"})]};
  assert.notDeepEqual(fingerprint(plain,"parseInline",vector),fingerprint(changed,"parseInline",vector));
  assert.throws(()=>h.observe(mutate,"parseInline",vector,true),/mutates Markdown arguments/);
});

test("Markdown fingerprints preserve callback error identity and fresh result graphs",()=>{
  const vector=["doc.md",h.OPTIONS[6]];
  const original={safeHref:(_value,opts)=>opts.resolve("doc.md")};
  const cloned={safeHref:(_value,opts)=>{try{return opts.resolve("doc.md");}catch(e){throw new Error(e.message);}}};
  assert.notDeepEqual(fingerprint(original,"safeHref",vector),fingerprint(cloned,"safeHref",vector));
  const fresh={parseInline:()=>[]},shared=[];
  const cached={parseInline:()=>shared},probe={probe:"fresh",arguments:["",h.OPTIONS[0]]};
  assert.notDeepEqual(fingerprint(fresh,"parseInline",probe),fingerprint(cached,"parseInline",probe));
});

test("Markdown observations refuse unknown and invalid or empty ranges",()=>{
  const methods={plain:()=>""};
  for(const [start,limit] of [[-1,1],[0,0],[0,1.5],[0.5,1]])assert.throws(()=>h.runBatch(methods,"plain",start,limit));
  assert.throws(()=>h.runBatch(methods,"unknown",0,1),/unknown Markdown operation/);
  assert.throws(()=>h.runBatch(methods,"plain",h.countVectors("plain"),1),/exceeds matrix/);
});
