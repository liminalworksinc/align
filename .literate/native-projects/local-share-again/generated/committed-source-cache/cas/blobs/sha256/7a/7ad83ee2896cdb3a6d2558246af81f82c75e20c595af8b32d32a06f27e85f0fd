'use strict';

function text(parts) {
  return parts.map(part => typeof part === 'string' ? part :
    ('device' in part ? part.device : part.devices_page)).join('');
}

module.exports = { text };
