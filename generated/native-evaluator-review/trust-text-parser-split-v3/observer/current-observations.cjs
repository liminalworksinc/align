'use strict';
const assert=require('node:assert/strict'),h=require('./legacy-observations.cjs');
const {slug}=require('./slug.js'),{safe_href:safeHref}=require('./safe_href.js'),{plain}=require('./plain.js');
const plans=require('./historical-inputs.json'),docs=require('./current-documents.json');
const resources={slug,safeHref,plain};
function blockText(blocks){return blocks.map(b=>b.t==='list'?b.items.map(i=>plain(i.c)+(i.sub?blockText([i.sub]):'')).join(' '):b.t==='quote'?blockText(b.c):b.t==='table'?[...b.head,...b.rows.flat()].map(plain).join(' '):b.c?plain(b.c):b.v??'').join(' ');}
async function run(make){
 const api=make(resources);assert.deepEqual(Object.keys(api),['parseInline','parseMarkdown']);assert.equal(api.parseInline.length,2);assert.equal(api.parseMarkdown.length,2);const methods={slug,safeHref,plain,parseInline:api.parseInline,parseMarkdown:api.parseMarkdown},records=[],guards=[];
 for(const p of plans) h.emitBatch(methods,...p.arguments,true);
 const cases=[
  ['entity-period','[LEGAL ENTITY].',{'[LEGAL ENTITY]':'Liminal Works, Inc.'}],
  ['entity-next-sentence','[LEGAL ENTITY]. Write to us.',{'[LEGAL ENTITY]':'Liminal Works, Inc.'}],
  ['consume-only-one-following-period','[T]..',{'[T]':'Name.'}],
  ['literal-duplicate-periods-stay','Liminal Works, Inc..',{'[LEGAL ENTITY]':'Liminal Works, Inc.'}],
  ['replacement-without-period','[T].',{'[T]':'Name'}],
  ['without-period-preserves-two','[T]..',{'[T]':'Name'}],
  ['prefix-and-suffix','prefix [T].suffix',{'[T]':'Name.'}],
  ['two-replacements','[T]. [T].',{'[T]':'Name.'}],
  ['adjacent-replacements','[T][U].',{'[T]':'Name.','[U]':'Other.'}],
  ['email-keeps-sentence-period','[MAIL].',{'[MAIL]':'ops@example.invalid'}],
  ['empty-replacement','[T].',{'[T]':''}],
  ['inline-code-is-not-filled','`[T].` [T].',{'[T]':'Name.'}],
  ['filled-link-label','[ORG.](https://example.test/Inc..)',{'ORG':'Name.'}],
  ['filled-bold','**[T].**',{'[T]':'Name.'}],
  ['filled-emphasis','*[T].*',{'[T]':'Name.'}],
  ['escaped-placeholder-bracket','\\[T].',{'[T]':'Name.'}],
  ['unicode-period','[T].',{'[T]':'法人.'}],
  ['literal-regex-key','xa.b.',{'a.b':'Name.'}],
  ['already-two-replacement-periods','[T].',{'[T]':'Name..'}],
  ['no-following-dot','[T] hello',{'[T]':'Name.'}],
 ];
 for(const [name,text,fill]of cases){const opts={prefix:'current',fill},before=h.encode(opts),value=api.parseInline(text,opts);guards.push({name:'fill-'+name,before,after:h.encode(opts)});records.push({name:'current-fill-'+name,result:h.encode(value)});}
 const special=[['empty-key', '.',{'':'Name.'}],['overlap-left-first','[T].',{'[':'Left.','[T]':'Right.'}],['overlap-long-first','[T].',{'[T]':'Right.','[':'Left.'}]];
 for(const [name,text,fill]of special){const opts={prefix:'current',fill},before=h.encode(opts),value=api.parseInline(text,opts);guards.push({name:'special-'+name,before,after:h.encode(opts)});records.push({name:'current-fill-'+name,result:h.encode(value)});}
 for(const indent of [0,1,2,4]){const root=' '.repeat(indent),nested=' '.repeat(Math.max(2,indent+2)),text=root+'- first\n'+nested+'- nested\n'+root+'- second',value=api.parseMarkdown(text,{prefix:'lists'});records.push({name:'current-indented-root-'+indent,result:h.encode(value)});}
 const fill={'[LEGAL ENTITY]':'Liminal Works, Inc.','[PRIVACY CONTACT EMAIL]':'ops@theliminalspace.io','[SECURITY CONTACT EMAIL]':'ops@theliminalspace.io'};
 for(const d of docs){const value=api.parseMarkdown(d.text,{prefix:'current-doc',fill,resolve:()=>({page:'/trust',prefix:'owned'})});records.push({name:'current-trust-document-'+d.file,result:h.encode(value)});}
 const fenced=api.parseMarkdown('```\n[LEGAL ENTITY].\n```',{prefix:'current',fill});records.push({name:'current-fence-preserves-raw-placeholder',result:h.encode(fenced)});

 // Original-backed callback order, including its exception boundary.
 for(const [name,text] of [
  ['nested-before-root','- [root](r)\n  - [child](c)\n- [last](l)'],
  ['all-nested-siblings-before-root','- [root1](r1)\n  - [child1](c1)\n    - [child2](c2)\n- [root2](r2)\n  - [child3](c3)'],
 ]) {
  const calls=[],opts={prefix:'order',resolve(path){calls.push(path);return null;}};
  const value=api.parseMarkdown(text,opts);
  records.push({name:'current-callback-order-'+name,result:{calls,nodes:h.encode(value)}});
 }
 {
  const calls=[],sentinel={owned:'callback-error'},opts={prefix:'order',resolve(path){calls.push(path);if(path==='c')throw sentinel;return null;}};
  let caught;try{api.parseMarkdown('- [root](r)\n  - [child](c)\n- [last](l)',opts);}catch(error){caught=error;}

  records.push({name:'current-callback-order-child-throw-before-root',result:{calls,original_thrown_value_preserved:caught===sentinel}});
 }
 assert.equal(records.length,37);return {records,guards,surface:{keys:Object.keys(api),inlineArity:api.parseInline.length,markdownArity:api.parseMarkdown.length}};
}
module.exports={run,resources};
