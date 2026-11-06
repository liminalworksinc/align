'use strict';

const mcpUrl = /^https?:\/\/(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?\/api\/mcp$/;

function safe_mcp_url(url) {
  return mcpUrl.test(url) ? url : null;
}

module.exports = { safe_mcp_url };
