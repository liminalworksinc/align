'use strict';
const { V2Error } = require('./data.js').data();
function bad_request(message, code = 'bad_request') {
  return new V2Error(400, code, message);
}
module.exports = { bad_request };
