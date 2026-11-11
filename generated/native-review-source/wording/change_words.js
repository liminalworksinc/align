'use strict';
const {with_hidden}=require('./with_hidden.js');
function change_words(field,d,o={}){
 const q=o.q??(x=>x),title=o.title??(x=>x),arrow=o.arrow??'\u2192';
 const before=Array.isArray(d.before)?d.before:[],after=Array.isArray(d.after)?d.after:[],lines=[];
 const t=x=>x===null||x===undefined||x===''?'none':q(x);
 if(field==='measures'){
  for(const next of after){const old=before.find(x=>x.id===next.id);
   if(!old)lines.push('Added measure '+q(next.text)+(next.target?' (target '+q(next.target)+')':''));
   else {const text=old.text!==next.text,target=(old.target??null)!==(next.target??null);
    if(text&&target)lines.push('Measure '+q(old.text)+' became '+q(next.text)+', target '+t(old.target)+' '+arrow+' '+t(next.target));
    else if(text)lines.push('Measure '+q(old.text)+' became '+q(next.text));
    else if(target)lines.push(q(next.text)+' target '+t(old.target)+' '+arrow+' '+t(next.target));
   }
  }
  for(const old of before)if(!after.some(x=>x.id===old.id))lines.push('Removed measure '+q(old.text));
  return lines.length?lines:['Measures reordered'];
 }
 if(field==='limits'){
  const labels={must:'Must',must_not:'Must not',out_of_scope:'Out of scope'};
  const w=l=>(labels[l.type]??l.type)+': '+q(l.text);
  for(const next of after){const old=before.find(x=>x.id===next.id);if(!old)lines.push('Added limit '+w(next));else if(old.text!==next.text||old.type!==next.type)lines.push('Limit '+w(old)+' became '+w(next));}
  for(const old of before)if(!after.some(x=>x.id===old.id))lines.push('Removed limit '+w(old));
  return lines.length?lines:['Limits reordered'];
 }
 if(field==='depends_on'){
  const added=after.filter(x=>!before.includes(x)),removed=before.filter(x=>!after.includes(x));
  const more=Math.max(0,(d.hidden?.after??0)-(d.hidden?.before??0)),fewer=Math.max(0,(d.hidden?.before??0)-(d.hidden?.after??0));
  if(added.length||more)lines.push('Now depends on '+with_hidden(added.map(id=>q(title(id))),more));
  if(removed.length||fewer)lines.push('No longer depends on '+with_hidden(removed.map(id=>q(title(id))),fewer));
  return lines.length?lines:["Dependencies you can't see changed"];
 }
 if(field==='title')return ['Title '+q(String(d.before??''))+' '+arrow+' '+q(String(d.after??''))];
 if(field==='status')return ['Status '+String(d.before??'\u2014')+' '+arrow+' '+String(d.after??'\u2014')];
 return [field+': '+String(d.before??'\u2014')+' '+arrow+' '+String(d.after??'\u2014')];
}
module.exports={change_words};
