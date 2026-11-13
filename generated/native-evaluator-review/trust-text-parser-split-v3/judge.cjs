'use strict';
const GOLDENS={"arguments":[0],"case_id":"trust-text-parser.create-trust-text-parser-001","expected_result":{"batch":0,"records":45,"sha256":"a16f65beff23585c289f3411c74f8da2d86b699c8b076bd3c140eddc6b745438"},"capability":"trust-text-parser.create-trust-text-parser","plans":[{"case_id":"trust-markdown.parse-inline-000","arguments":["parseInline",0,4096],"expected_result":{"observations":4096,"sha256":"15c2ce76522f341abd7249a146605a214d564d4058db857b3f4050975ab50887"}},{"case_id":"trust-markdown.parse-inline-001","arguments":["parseInline",4096,4096],"expected_result":{"observations":4096,"sha256":"9b0d8adbc3fdffc0fb2c6a8205cc34acb55c758159cda52798b41f0293758faa"}},{"case_id":"trust-markdown.parse-inline-002","arguments":["parseInline",8192,4096],"expected_result":{"observations":4096,"sha256":"3b5f396d1d94c039e696429d2822353ffa2e4831a70753d2ddae5099fed0ea78"}},{"case_id":"trust-markdown.parse-inline-003","arguments":["parseInline",12288,1954],"expected_result":{"observations":1954,"sha256":"40f3ab809b4ef704a2cbe8a38a7c386487a142a8bd03474aa50a2748056fb4b7"}},{"case_id":"trust-markdown.parse-markdown-000","arguments":["parseMarkdown",0,4096],"expected_result":{"observations":4096,"sha256":"51d3698f6c4ad01d46299138846a5d7587cd5b3f8c46568087ecaf146eccf8bb"}},{"case_id":"trust-markdown.parse-markdown-001","arguments":["parseMarkdown",4096,4096],"expected_result":{"observations":4096,"sha256":"2b95b399ddb0d51ae5cbd25bc6be2ff5226ff98df9aefe395f1576a7588d80de"}},{"case_id":"trust-markdown.parse-markdown-002","arguments":["parseMarkdown",8192,4096],"expected_result":{"observations":4096,"sha256":"92cbc6ada560fb8fe0b2700ab902f0f49160c2bce6581fb01e9d20c6d3897b77"}},{"case_id":"trust-markdown.parse-markdown-003","arguments":["parseMarkdown",12288,1302],"expected_result":{"observations":1302,"sha256":"b93f37493198045e8e8befa2bf60af18f89eaa9001849c31583df514ff1a44fa"}}],"additional_guard_sha256":"528d743b79d48cb8516ed33b8b9d8761ac07eb971742bb051e8eba1f933b7262"};
'use strict';
// Authored trusted comparison. No candidate source or observer is mounted here.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib');
assert.deepEqual(fs.readdirSync('/inputs').sort(),['judge.cjs','observations.gz','request.json']);
const input=fs.readFileSync('/inputs/observations.gz');
assert(input.length>0&&input.length<=4*1024*1024,'Invalid observation transport');
const bytes=zlib.gunzipSync(input,{maxOutputLength:64*1024*1024});
assert(bytes.length>0&&bytes.at(-1)===10,'Truncated observation stream');
const request=JSON.parse(fs.readFileSync('/inputs/request.json','utf8'));
assert.deepEqual(request.selected,[{case_id:GOLDENS.case_id,capability:GOLDENS.capability,arguments:[0]}]);
let offset=0,records=0;
function nextLine(){
 const end=bytes.indexOf(10,offset);
 assert(end>=offset&&end-offset>0&&end-offset<=3*1024*1024,'Invalid observation record');
 const value=bytes.subarray(offset,end+1);offset=end+1;records++;return value;
}
const outer=crypto.createHash('sha256');
for(const plan of GOLDENS.plans){
 const hash=crypto.createHash('sha256'),count=plan.arguments[2];
 for(let i=0;i<count;i++)hash.update(nextLine());
 const result={observations:count,sha256:hash.digest('hex')};
 assert(result.observations===plan.expected_result.observations&&result.sha256===plan.expected_result.sha256,'Historical observations differ');
 outer.update(JSON.stringify({name:plan.case_id,result})+'\n');
}
for(let i=0;i<37;i++)outer.update(nextLine());
assert(outer.digest('hex')===GOLDENS.expected_result.sha256,'Current observations differ');
assert(crypto.createHash('sha256').update(nextLine()).digest('hex')===GOLDENS.additional_guard_sha256,'Additional observations differ');
assert.equal(records,27870);assert.equal(offset,bytes.length,'Unexpected observation data');
process.stdout.write(JSON.stringify({schema:'literate-ai/library-acceptance-results@1',cases:[{case_id:GOLDENS.case_id,capability:GOLDENS.capability,result:GOLDENS.expected_result}]})+'\n');
