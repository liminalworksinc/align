'use strict';

const { safe_mcp_url } = require('./safe_mcp_url.js');
const { shq } = require('./shq.js');

function claude_code_line(url) {
  return safe_mcp_url(url) === null ? null :
    'claude mcp add --transport http --scope user align ' + shq(url) + '; claude mcp login align';
}

module.exports = { claude_code_line };
