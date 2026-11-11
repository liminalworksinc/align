'use strict';
function plain(content) {
  return content.map(node => node.t === 'text' || node.t === 'code' ? node.v : plain(node.c)).join('');
}
module.exports = { plain };
