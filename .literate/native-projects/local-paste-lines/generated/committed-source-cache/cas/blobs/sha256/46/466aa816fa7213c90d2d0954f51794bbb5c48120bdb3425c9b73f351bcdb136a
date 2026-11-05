'use strict';

const { safe_mcp_url } = require('./safe_mcp_url.js');
const { shq } = require('./shq.js');

function codex_line(url) {
  return safe_mcp_url(url) === null ? null : 'codex mcp add align --url ' + shq(url);
}

module.exports = { codex_line };
