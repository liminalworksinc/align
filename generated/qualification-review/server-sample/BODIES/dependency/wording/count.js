'use strict';
const {plural}=require('./plural.js');
function count(n,one,many=one+'s',fmt=String){return fmt(n)+' '+plural(n,one,many);}
module.exports={count};
