'use strict';
const { V2Error } = require('./data.js').data();
function not_found() {
  return new V2Error(404, 'not_found', 'Not found');
}
module.exports = { not_found };
