'use strict';
const pictographic = /\p{Extended_Pictographic}/u;
const variationOrTone = /^[\uFE0E\uFE0F\u{1F3FB}-\u{1F3FF}]$/u;
const tag = /^[\u{E0020}-\u{E007E}]$/u;
const removable = /[\p{Cf}\p{Cs}]/u;
function clean_value_text(s) {
  const points = Array.from(s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '').replace(/\r\n?/g, '\n'));
  const keep = new Set();
  for (let i = 0; i < points.length; i++) {
    if (points[i] === '\u200D') {
      let previous = i - 1;
      if (previous >= 0 && variationOrTone.test(points[previous])) previous--;
      if (previous >= 0 && pictographic.test(points[previous]) && i + 1 < points.length && pictographic.test(points[i + 1])) keep.add(i);
    }
    if (pictographic.test(points[i])) {
      let start = i + 1;
      if (points[start] === '\uFE0F') start++;
      let end = start;
      while (end < points.length && tag.test(points[end])) end++;
      if (end > start && points[end] === '\u{E007F}') for (let j = start; j <= end; j++) keep.add(j);
    }
  }
  const text = points.filter((p, i) => keep.has(i) || !removable.test(p)).join('')
    .replace(/[\u115F\u1160\u3164\uFFA0\u2800]/g, ' ').trim().replace(/\s+/g, ' ').trim();
  return /^[\p{M}\s]*$/u.test(text) ? '' : text;
}
module.exports = {clean_value_text};
