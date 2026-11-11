'use strict';
const {clean_prose}=require('./clean_prose.js');
function is_blank_text(v){return clean_prose(v).replace(/[\p{M}\s]/gu,'')==='';}
module.exports={is_blank_text};
