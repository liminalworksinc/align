'use strict';
const { safe_href } = require('./safe_href.js');
function fillText(text, opts) {
  const fill = opts.fill ?? {};
  const keys = Object.keys(fill).filter(key => text.includes(key));
  if (!keys.length) return text ? [{ t: 'text', v: text }] : [];
  const pattern = keys.map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const out = [];
  let end = 0;
  for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
    if (match.index > end) out.push({ t: 'text', v: text.slice(end, match.index) });
    const value = fill[match[0]];
    out.push(/^[^\s@<>()[\]]+@[^\s@<>()[\]]+\.[A-Za-z]{2,}$/.test(value)
      ? { t: 'link', href: 'mailto:' + value, c: [{ t: 'text', v: value }] }
      : { t: 'text', v: value });
    end = match.index + match[0].length;
  }
  if (end < text.length) out.push({ t: 'text', v: text.slice(end) });
  return out;
}
function parse_inline(text, opts) {
  const out = [];
  let buffer = '';
  const flush = () => { out.push(...fillText(buffer, opts)); buffer = ''; };
  const escapes = '\\`*_[]()#|<>!-';
  for (let i = 0; i < text.length;) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length && escapes.includes(text[i + 1])) {
      buffer += text[i + 1]; i += 2; continue;
    }
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) { flush(); out.push({ t: 'code', v: text.slice(i + 1, end) }); i = end + 1; continue; }
    }
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      if (end > i + 2) { flush(); out.push({ t: 'strong', c: parse_inline(text.slice(i + 2, end), opts) }); i = end + 2; continue; }
    }
    if (ch === '*' && text[i + 1] !== undefined && text[i + 1] !== ' ' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1);
      if (end > i + 1 && text[end - 1] !== ' ') { flush(); out.push({ t: 'em', c: parse_inline(text.slice(i + 1, end), opts) }); i = end + 1; continue; }
    }
    if (ch === '[') {
      const middle = text.indexOf('](', i + 1);
      const end = middle < 0 ? -1 : text.indexOf(')', middle + 2);
      const label = middle < 0 ? '' : text.slice(i + 1, middle);
      if (end >= 0 && !/[\[\]]/.test(label)) {
        flush();
        const c = parse_inline(label, opts);
        const href = safe_href(text.slice(middle + 2, end), opts);
        if (href) out.push({ t: 'link', href, c }); else out.push(...c);
        i = end + 1; continue;
      }
    }
    if (ch === '<') {
      const match = /^<(https?:\/\/[^\s<>]+)>/i.exec(text.slice(i));
      if (match) {
        flush(); const href = safe_href(match[1], opts);
        out.push(href ? { t: 'link', href, c: [{ t: 'text', v: match[1] }] } : { t: 'text', v: match[1] });
        i += match[0].length; continue;
      }
    }
    buffer += ch; i++;
  }
  flush();
  return out;
}
module.exports = { parse_inline };
