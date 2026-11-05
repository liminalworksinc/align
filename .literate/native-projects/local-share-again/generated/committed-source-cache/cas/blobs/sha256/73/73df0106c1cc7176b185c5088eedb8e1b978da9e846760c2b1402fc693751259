'use strict';

function stopped(who, options) {
  const you = who === null;
  const lead = (you ? 'You' : who) + " stopped sharing this session, so a stop or resume can't reach it";
  if (options !== undefined && options.deleted === true) {
    return lead + '. Their account was deleted, so nothing can share it again.';
  }
  return lead + ", and it won't be shared again, even if its machine runs ::align share. To share " +
    (you ? 'your' : 'their') + ' work again, ' + (you ? 'start' : who + ' starts') +
    ' a new session and ' + (you ? 'run' : 'runs') + ' ::align share in it.';
}

module.exports = { stopped };
