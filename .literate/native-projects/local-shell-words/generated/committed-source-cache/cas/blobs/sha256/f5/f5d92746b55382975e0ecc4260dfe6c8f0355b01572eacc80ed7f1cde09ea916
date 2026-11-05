'use strict';
function command_words(words) {
  const wrappers = ['sudo', 'env', 'command', 'nohup', 'time', 'exec', 'builtin', 'xargs'];
  let i = 0;
  while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || wrappers.includes(words[i]))) i++;
  return words.slice(i);
}
module.exports = { command_words };
