'use strict';
const unit = (n, name) => `${n} ${name}${n === 1 ? '' : 's'}`;
function span_words(ms) {
  if (ms < 0 || !Number.isFinite(ms)) return '';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return unit(seconds, 'second');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return unit(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return unit(hours, 'hour') + (minutes % 60 ? ' ' + unit(minutes % 60, 'minute') : '');
  return unit(Math.floor(hours / 24), 'day') + (hours % 24 ? ' ' + unit(hours % 24, 'hour') : '');
}
module.exports = {span_words};
