// Freeze one exact retained function without admitting the SQL history to generation.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(path.resolve(here,"../../components/legacy-project-wrapper/implementation/package.json")),ts=require("typescript");
const [sourceRaw,outputRaw,recordRaw]=process.argv.slice(2);
assert(sourceRaw&&outputRaw&&recordRaw,"usage: node capture-migration-coordinator-source.mjs SOURCE_DB OUTPUT_DIRECTORY RECORD_JSON");
const source=path.resolve(sourceRaw),output=path.resolve(outputRaw),record=path.resolve(recordRaw);
const implementation=path.resolve(here,"../../components/legacy-project-wrapper/implementation");
assert(!fs.existsSync(output)&&!fs.existsSync(record),"refuse existing snapshot outputs");
assert(output!==implementation&&!output.startsWith(implementation+path.sep)&&!record.startsWith(implementation+path.sep),"keep capture outputs outside retained source");
assert(record!==output&&!record.startsWith(output+path.sep),"keep the extraction record outside the source snapshot");
const text=fs.readFileSync(source,"utf8"),hash=x=>createHash("sha256").update(x).digest("hex");
assert.equal(hash(text),"43959ae8034598b41d86cf0d77079654c81957a712b0ad05df537718cdaa8977","use the reviewed db.ts baseline from checkpoint bb2605c");
const tree=ts.createSourceFile("db.ts",text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const functions=tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==="migrate");
assert.equal(functions.length,1);const fn=functions[0],fragment=text.slice(fn.getStart(tree),fn.end)+"\n";
assert.equal(hash(fragment),"e4c493e2e1a34e3810f2a13e17e94304abdff2555b2b99698e4dcb5e42eac12f");
const evidence={schema:"align/exact-source-fragment@1",source_commit:"bb2605c80db29e03862ac2a2a9affe134184a7da",source_sha256:hash(text),symbol:"migrate",start_line:tree.getLineAndCharacterOfPosition(fn.getStart(tree)).line+1,end_line:tree.getLineAndCharacterOfPosition(fn.end).line+1,fragment_sha256:hash(fragment),source_function_unmodified:true,historical_sql_in_snapshot:false};
fs.mkdirSync(output,{recursive:true});fs.mkdirSync(path.dirname(record),{recursive:true});
fs.writeFileSync(path.join(output,"migrate.ts"),fragment,{flag:"wx"});fs.writeFileSync(record,JSON.stringify(evidence,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify(evidence));
