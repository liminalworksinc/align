'use strict';
const path = require('node:path');
function init_claude_state(file) {
  const parts = file.split(path.sep);
  const i = parts.lastIndexOf('subagents');
  return {session_id: i > 0 ? parts[i - 1] : path.basename(file, '.jsonl'), prompt_id: null, subagent: i > 0, cwd: null};
}
module.exports = {init_claude_state};
