'use strict';

function create_trust_text_parser(resources) {
  const slug = resources.slug;
  const safeHref = resources.safeHref;
  const plain = resources.plain;

  function fillText(text, opts) {
    const fill = opts.fill ?? {};
    const keys = Object.keys(fill).filter(key => text.includes(key));
    if (!keys.length) return text ? [{t: 'text', v: text}] : [];
    const pattern = new RegExp(keys.map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
    const nodes = [];
    let position = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > position) nodes.push({t: 'text', v: text.slice(position, match.index)});
      const value = fill[match[0]];
      if (/^[^\s@<>()[\]]+@[^\s@<>()[\]]+\.[A-Za-z]{2,}$/.test(value)) {
        nodes.push({t: 'link', href: 'mailto:' + value, c: [{t: 'text', v: value}]});
      } else nodes.push({t: 'text', v: value});
      position = match.index + match[0].length;
      if (value.endsWith('.') && text[position] === '.') position++;
    }
    if (position < text.length) nodes.push({t: 'text', v: text.slice(position)});
    return nodes;
  }

  function parseInline(text, opts) {
    const nodes = [];
    let buffer = '';
    function flush() { nodes.push(...fillText(buffer, opts)); buffer = ''; }
    for (let i = 0; i < text.length;) {
      const ch = text[i];
      if (ch === '\\' && i + 1 < text.length && '\\`*_[]()#|<>!-'.includes(text[i + 1])) {
        buffer += text[i + 1]; i += 2; continue;
      }
      if (ch === '`') {
        const end = text.indexOf('`', i + 1);
        if (end !== -1) { flush(); nodes.push({t: 'code', v: text.slice(i + 1, end)}); i = end + 1; continue; }
      }
      if (text.startsWith('**', i)) {
        const end = text.indexOf('**', i + 2);
        if (end > i + 2) { flush(); nodes.push({t: 'strong', c: parseInline(text.slice(i + 2, end), opts)}); i = end + 2; continue; }
      }
      if (ch === '*' && text[i + 1] && text[i + 1] !== ' ' && text[i + 1] !== '*') {
        const end = text.indexOf('*', i + 1);
        if (end > i + 1 && text[end - 1] !== ' ') { flush(); nodes.push({t: 'em', c: parseInline(text.slice(i + 1, end), opts)}); i = end + 1; continue; }
      }
      if (ch === '[') {
        const mid = text.indexOf('](', i + 1);
        const end = mid < 0 ? -1 : text.indexOf(')', mid + 2);
        const label = text.slice(i + 1, mid);
        if (mid !== -1 && end !== -1 && !/[\[\]]/.test(label)) {
          flush();
          const c = parseInline(label, opts);
          const href = safeHref(text.slice(mid + 2, end), opts);
          if (href) nodes.push({t: 'link', href, c}); else nodes.push(...c);
          i = end + 1; continue;
        }
      }
      if (ch === '<') {
        const match = /^<(https?:\/\/[^\s<>]+)>/i.exec(text.slice(i));
        if (match) {
          flush();
          const href = safeHref(match[1], opts);
          if (href) nodes.push({t: 'link', href, c: [{t: 'text', v: match[1]}]});
          else nodes.push({t: 'text', v: match[1]});
          i += match[0].length; continue;
        }
      }
      buffer += ch; i++;
    }
    flush(); return nodes;
  }

  function parseMarkdown(markdown, opts) {
    const text = markdown.replace(/\r\n?/g, '\n')
      .replace(/^[ \t]*<!--(?:(?!-->)[\s\S])*-->[ \t]*(?:\n|$)/gm, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    const ids = new Map();
    const fence = line => /^\s*```/.test(line);
    const heading = line => /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    const rule = line => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
    const quote = line => /^\s*>/.test(line);
    const marker = line => /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    const ordered = match => /\d/.test(match[2]);
    function tableStart(lines, i) {
      return lines[i].trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1]);
    }
    function cells(line) {
      let s = line.trim().replace(/^\|/, '');
      if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
      const parts = []; let part = '';
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '\\' && s[i + 1] === '|') { part += '|'; i++; }
        else if (s[i] === '|') { parts.push(part); part = ''; }
        else part += s[i];
      }
      parts.push(part);
      return parts.map(cell => parseInline(cell.trim(), opts));
    }
    function blocks(lines) {
      const result = []; let i = 0;
      function start(index) {
        const line = lines[index];
        return fence(line) || heading(line) || tableStart(lines, index) || rule(line) || quote(line) || marker(line);
      }
      while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) { i++; continue; }
        if (fence(line)) {
          const body = []; i++;
          while (i < lines.length && !fence(lines[i])) body.push(lines[i++]);
          if (i < lines.length) i++;
          result.push({t: 'code', v: body.join('\n')}); continue;
        }
        const h = heading(line);
        if (h) {
          const c = parseInline(h[2], opts);
          const base = opts.prefix + '-' + slug(plain(c));
          const count = (ids.get(base) || 0) + 1; ids.set(base, count);
          result.push({t: 'heading', level: h[1].length, id: count === 1 ? base : base + '-' + count, c}); i++; continue;
        }
        if (tableStart(lines, i)) {
          const head = cells(line); const rows = []; i += 2;
          while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
          result.push({t: 'table', head, rows}); continue;
        }
        if (rule(line)) { result.push({t: 'rule'}); i++; continue; }
        if (quote(line)) {
          const body = [];
          while (i < lines.length && quote(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
          result.push({t: 'quote', c: blocks(body)}); continue;
        }
        const first = marker(line);
        if (first) {
          const list = {t: 'list', ordered: ordered(first), items: []};
          const limit = Math.max(1, first[1].length);
          let current = null;
          function finish() {
            if (!current) return;
            let sub = null;
            if (current.children.length) {
              sub = {t: 'list', ordered: current.childOrdered, items: current.children.map(child => ({c: parseInline(child.join(' '), opts), sub: null}))};
            }
            list.items.push({c: parseInline(current.lines.join(' '), opts), sub});
          }
          while (i < lines.length) {
            const m = marker(lines[i]);
            if (m) {
              if (m[1].length <= limit) {
                if (ordered(m) !== list.ordered) break;
                finish(); current = {lines: [m[3]], children: [], childOrdered: false};
              } else if (current) {
                if (!current.children.length) current.childOrdered = ordered(m);
                current.children.push([m[3]]);
              }
              i++; continue;
            }
            if (!lines[i].trim() && i + 1 < lines.length && marker(lines[i + 1])) { i++; continue; }
            if (lines[i].trim() && /^\s/.test(lines[i]) && current) {
              const target = current.children.length ? current.children[current.children.length - 1] : current.lines;
              target.push(lines[i].trim()); i++; continue;
            }
            break;
          }
          finish(); result.push(list); continue;
        }
        const body = [lines[i++].trim()];
        while (i < lines.length && lines[i].trim() && !start(i)) body.push(lines[i++].trim());
        result.push({t: 'para', c: parseInline(body.join(' '), opts)});
      }
      return result;
    }
    return blocks(text.split('\n'));
  }
  return {parseInline, parseMarkdown};
}

module.exports = {create_trust_text_parser};
