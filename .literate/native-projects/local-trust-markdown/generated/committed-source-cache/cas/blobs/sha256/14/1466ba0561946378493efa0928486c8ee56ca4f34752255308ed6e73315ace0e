'use strict';
const { parse_inline } = require('./parse_inline.js');
const { plain } = require('./plain.js');
const { slug } = require('./slug.js');
const fence = /^\s*```/;
const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const separator = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const rule = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const quote = /^\s*>\s?/;
const marker = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
function parse_markdown(markdown, opts) {
  const normalized = markdown.replace(/\r\n?/g, '\n')
    .replace(/^[ \t]*<!--(?:(?!-->)[\s\S])*-->[ \t]*(?:\n|$)/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const ids = new Map();
  const inline = text => parse_inline(text, opts);
  function cells(line) {
    let text = line.trim().replace(/^\|/, '');
    if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
    const result = []; let current = '';
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\\' && text[i + 1] === '|') { current += '|'; i++; }
      else if (text[i] === '|') { result.push(inline(current.trim())); current = ''; }
      else current += text[i];
    }
    result.push(inline(current.trim())); return result;
  }
  function parse(lines) {
    const blocks = []; let i = 0;
    const table = n => lines[n].trim().startsWith('|') && n + 1 < lines.length && separator.test(lines[n + 1]);
    const start = n => fence.test(lines[n]) || heading.test(lines[n]) || table(n) || rule.test(lines[n]) || quote.test(lines[n]) || marker.test(lines[n]);
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (fence.test(line)) {
        const body = []; i++;
        while (i < lines.length && !fence.test(lines[i])) body.push(lines[i++]);
        if (i < lines.length) i++;
        blocks.push({ t: 'code', v: body.join('\n') }); continue;
      }
      const h = heading.exec(line);
      if (h) {
        const c = inline(h[2]); const base = opts.prefix + '-' + slug(plain(c));
        const count = (ids.get(base) || 0) + 1; ids.set(base, count);
        blocks.push({ t: 'heading', level: h[1].length, id: base + (count > 1 ? '-' + count : ''), c }); i++; continue;
      }
      if (table(i)) {
        const head = cells(line), rows = []; i += 2;
        while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
        blocks.push({ t: 'table', head, rows }); continue;
      }
      if (rule.test(line)) { blocks.push({ t: 'rule' }); i++; continue; }
      if (quote.test(line)) {
        const body = [];
        while (i < lines.length && quote.test(lines[i])) body.push(lines[i++].replace(quote, ''));
        blocks.push({ t: 'quote', c: parse(body) }); continue;
      }
      const initial = marker.exec(line);
      if (initial) {
        const ordered = /\d/.test(initial[2]); const limit = Math.max(1, initial[1].length);
        const items = []; let current = null;
        const flush = () => {
          if (!current) return;
          const c = inline(current.lines.join(' '));
          const sub = current.sub ? { t: 'list', ordered: current.sub.ordered, items: current.sub.items.map(item => ({ c: inline(item.join(' ')), sub: null })) } : null;
          items.push({ c, sub });
        };
        while (i < lines.length) {
          const m = marker.exec(lines[i]);
          if (m) {
            if (m[1].length <= limit) {
              if (/\d/.test(m[2]) !== ordered) break;
              flush(); current = { lines: [m[3]], sub: null }; i++; continue;
            }
            if (current) {
              if (!current.sub) current.sub = { ordered: /\d/.test(m[2]), items: [] };
              current.sub.items.push([m[3]]); i++; continue;
            }
          }
          if (!lines[i].trim() && i + 1 < lines.length && marker.test(lines[i + 1])) { i++; continue; }
          if (current && lines[i].trim() && /^\s+/.test(lines[i])) {
            const target = current.sub ? current.sub.items[current.sub.items.length - 1] : current.lines;
            target.push(lines[i].trim()); i++; continue;
          }
          break;
        }
        flush(); blocks.push({ t: 'list', ordered, items }); continue;
      }
      const body = [lines[i++].trim()];
      while (i < lines.length && lines[i].trim() && !start(i)) body.push(lines[i++].trim());
      blocks.push({ t: 'para', c: inline(body.join(' ')) });
    }
    return blocks;
  }
  return parse(normalized.split('\n'));
}
module.exports = { parse_markdown };
