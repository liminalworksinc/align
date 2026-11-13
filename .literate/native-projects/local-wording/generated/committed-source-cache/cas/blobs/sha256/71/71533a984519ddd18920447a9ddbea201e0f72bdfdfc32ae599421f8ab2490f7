'use strict';
function usd(micros){if(!(micros>0))return '$'+(micros/1e6).toFixed(2);const rounded=Math.round(micros/100);if(rounded===0)return 'under $0.0001';if(rounded<100)return '$0.'+String(rounded).padStart(4,'0');return '$'+(Math.round(micros/10000)/100).toFixed(2);}
module.exports={usd};
