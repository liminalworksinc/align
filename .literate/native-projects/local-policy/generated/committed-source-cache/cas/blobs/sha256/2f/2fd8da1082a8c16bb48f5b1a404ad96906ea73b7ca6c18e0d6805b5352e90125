'use strict';
const {authorize} = require('./authorize.js');
function can_bind(principal, goal, hasTransfer) {
  return authorize(principal, 'goal.bind', {kind: 'bind', goal, hasTransfer}).ok;
}
module.exports = {can_bind};
