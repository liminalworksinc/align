'use strict';
function resumed_held(held, reader) {
  const n = held.length;
  const titles = held.map(title => '"' + title + '"');
  const list = n < 2 ? titles[0] : titles.slice(0, -1).join(', ') + ' and ' + titles[n - 1];
  const which = n === 0 ? 'a goal hold' : 'the hold on ' + (reader === 'model' ? 'goal ' : '') + list;
  const verb = n > 1 ? 'block' : 'blocks';
  if (reader === 'user') {
    return 'Align: this session was resumed from its Align workspace, so its stop is lifted, but ' + which + ' still ' + verb + ' its tools until it is released.';
  }
  return '[Align] This session was resumed from its Align workspace, so the stop no longer blocks its tools, but ' + which + ' still ' + verb + ' them until it is released. Tell the user and wait for instructions.';
}
module.exports = { resumed_held };
