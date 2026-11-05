'use strict';
const {hidden_goals}=require('./hidden_goals.js');
function with_hidden(names,hidden){if(!hidden)return names.join(', ');if(!names.length)return hidden_goals(hidden);return names.join(', ')+' and '+(hidden===1?'1 other goal':String(hidden)+' other goals')+" you can't see";}
module.exports={with_hidden};
