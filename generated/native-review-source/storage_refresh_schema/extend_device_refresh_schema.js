'use strict';

function extend_device_refresh_schema(programs) {
  const result = [];
  for (let i = 0; i < programs.length; i += 1) {
    result.push(programs[i]);
  }
  result.push('ALTER TABLE v2_device_tokens ADD COLUMN rotated_ts TEXT;\nALTER TABLE v2_device_tokens ADD COLUMN used_at TEXT;');
  return result;
}

module.exports = { extend_device_refresh_schema };
