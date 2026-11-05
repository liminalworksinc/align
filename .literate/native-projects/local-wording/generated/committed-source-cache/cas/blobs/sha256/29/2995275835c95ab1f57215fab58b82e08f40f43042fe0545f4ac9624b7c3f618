'use strict';
const {change_words}=require('./change_words.js');
function diff_words(diff,o){const lines=[];for(const field of ['title','measures','limits','status','depends_on'])if(diff[field])lines.push(...change_words(field,diff[field],o));return lines;}
module.exports={diff_words};
