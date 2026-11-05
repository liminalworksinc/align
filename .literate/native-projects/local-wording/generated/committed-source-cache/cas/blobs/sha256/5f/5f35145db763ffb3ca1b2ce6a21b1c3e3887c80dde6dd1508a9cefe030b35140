'use strict';
const {drop_controls}=require('./drop_controls.js');
const pict=/\p{Extended_Pictographic}/u, removed=/[\p{Cf}\p{Cs}]/u;
function drop_invisible(v){const points=Array.from(drop_controls(v));const keep=new Set();
for(let i=0;i<points.length;i++){
 if(points[i]==='\u200d'){
  let p=i-1;const cp=p>=0?points[p].codePointAt(0):-1;
  if(cp===0xfe0e||cp===0xfe0f||(cp>=0x1f3fb&&cp<=0x1f3ff))p--;
  if(p>=0&&pict.test(points[p])&&i+1<points.length&&pict.test(points[i+1]))keep.add(i);
 }
 const cp=points[i].codePointAt(0);
 if(cp>=0xe0020&&cp<=0xe007e){let p=i-1;if(p>=0&&points[p]==='\ufe0f')p--;let end=i;while(end<points.length){const c=points[end].codePointAt(0);if(c<0xe0020||c>0xe007e)break;end++;}if(p>=0&&pict.test(points[p])&&end<points.length&&points[end].codePointAt(0)===0xe007f){for(let j=i;j<=end;j++)keep.add(j);}i=end-1;}
}
return points.filter((c,i)=>keep.has(i)||!removed.test(c)).join('');}
module.exports={drop_invisible};
