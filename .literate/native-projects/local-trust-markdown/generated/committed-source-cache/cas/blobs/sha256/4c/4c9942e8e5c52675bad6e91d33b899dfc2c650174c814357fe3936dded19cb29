'use strict';
const { slug } = require('./slug.js');
function safe_href(href, opts) {
  const h = href.trim();
  if (!h || /[\u0000-\u001F\u007F\s]/.test(h)) return null;
  if (/^https?:\/\/[^/]/i.test(h) || /^mailto:[^:]+@/i.test(h)) return h;
  if (h[0] === '#') return h.length > 1 ? '#' + opts.prefix + '-' + slug(h.slice(1)) : null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith('//')) return null;
  let [path, frag] = h.split('#', 2);
  path = path.replace(/^\.\//, '');
  const place = opts.resolve == null ? null : opts.resolve(path);
  if (!place) return null;
  return place.page + '#' + (frag ? place.prefix + '-' + slug(frag) : place.prefix);
}
module.exports = { safe_href };
