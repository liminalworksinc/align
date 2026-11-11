'use strict';
const { constants } = require('./constants.js');
function is_share_state(kind) {
  return constants().SHARE_STATE_NOTICES.some(prefix => kind.startsWith(prefix));
}
module.exports = { is_share_state };
