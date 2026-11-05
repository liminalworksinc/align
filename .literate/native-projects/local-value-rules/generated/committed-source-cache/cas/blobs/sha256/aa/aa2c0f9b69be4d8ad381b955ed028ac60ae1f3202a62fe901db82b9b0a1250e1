'use strict';
const {value_data} = require('./value_data.js');
function estimate_said(id) {
  return value_data().ESTIMATE_WORDS.find(row => row.id === id)?.said ?? id;
}
module.exports = {estimate_said};
