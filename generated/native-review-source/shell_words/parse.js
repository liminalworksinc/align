'use strict';
function parse(src) {
  let i = 0;
  const operators = ['&>>', '&>', '>>', '>|', '>&', '>', '<<<', '<<-', '<<', '<>', '<&', '<'];
  function read(substitution) {
    const output = [];
    let words = [], redirs = [], inner = [], pending = null;
    let word = '', active = false, depth = 0;
    const heredocs = [];
    function piece(text) { active = true; word += text; }
    function commit() {
      if (!active) return;
      if (pending !== null) { redirs.push({op: pending, target: word}); pending = null; }
      else words.push(word);
      word = ''; active = false;
    }
    function boundary() {
      commit();
      if (pending !== null) { redirs.push({op: pending, target: null}); pending = null; }
      if (words.length || redirs.length) output.push({words, redirs});
      output.push(...inner);
      words = []; redirs = []; inner = [];
    }
    function single() {
      i++;
      const start = i;
      while (i < src.length && src[i] !== "'") i++;
      const text = src.slice(start, i);
      if (i < src.length) i++;
      return text;
    }
    function opaque(open, close, count) {
      while (i < src.length && count > 0) {
        const c = src[i++];
        if (c === '\\') { if (i < src.length) i++; }
        else if (c === "'") {
          while (i < src.length && src[i] !== "'") i++;
          if (i < src.length) i++;
        } else if (c === open) count++;
        else if (c === close) count--;
      }
    }
    function expansion() {
      if (src[i] === '`') {
        i++;
        while (i < src.length) {
          const c = src[i++];
          if (c === '\\') { if (i < src.length) i++; }
          else if (c === '`') break;
        }
        piece('`...`');
      } else if (src.startsWith('$((', i)) {
        i += 3; opaque('(', ')', 2); piece('$((...))');
      } else if (src.startsWith('${', i)) {
        i += 2; opaque('{', '}', 1); piece('${...}');
      } else if (src.startsWith('$(', i)) {
        i += 2;
        piece('$(...)');
        inner.push(...read(true));
      } else { i++; piece('$'); }
    }
    function double() {
      i++; piece('');
      while (i < src.length) {
        const c = src[i];
        if (c === '"') { i++; break; }
        if (c === '\\') {
          const next = src[i + 1];
          if (next !== undefined && '$`"\\\n'.includes(next)) {
            i += 2; if (next !== '\n') piece(next);
          } else { i++; piece('\\'); }
        } else if (c === '$' || c === '`') expansion();
        else { i++; piece(c); }
      }
    }
    function delimiter(strip) {
      while (src[i] === ' ' || src[i] === '\t') i++;
      let value = '';
      while (i < src.length && !/\s|[;&|<>()]/u.test(src[i])) {
        const c = src[i++];
        if (c === "'" || c === '"') {
          while (i < src.length && src[i] !== c) value += src[i++];
          if (i < src.length) i++;
        } else if (c === '\\') { if (i < src.length) value += src[i++]; }
        else value += c;
      }
      if (value !== '') heredocs.push({value, strip});
    }
    function bodies() {
      for (const doc of heredocs) {
        while (i < src.length) {
          const start = i;
          while (i < src.length && src[i] !== '\n') i++;
          let line = src.slice(start, i);
          if (i < src.length) i++;
          if (doc.strip) line = line.replace(/^\t+/, '');
          if (line === doc.value) break;
        }
      }
      heredocs.length = 0;
    }
    try {
      while (i < src.length) {
        const c = src[i];
        if (c === ' ' || c === '\t') { commit(); i++; }
        else if (c === '\n') { boundary(); i++; bodies(); }
        else if (c === '#' && !active) { while (i < src.length && src[i] !== '\n') i++; }
        else if (c === '\\') {
          i++;
          if (src[i] === '\n') i++;
          else { piece(i < src.length ? src[i++] : ''); }
        } else if (c === "'") piece(single());
        else if (c === '"') double();
        else if (c === '$' || c === '`') expansion();
        else if (c === '(') { boundary(); depth++; i++; }
        else if (c === ')') {
          boundary(); i++;
          if (substitution && depth === 0) return output;
          depth = Math.max(0, depth - 1);
        } else {
          const op = operators.find(value => src.startsWith(value, i));
          if (op !== undefined) {
            if (active && /^[0-9]+$/.test(word) && /[0-9]/.test(src[i - 1])) { word = ''; active = false; }
            else commit();
            i += op.length;
            if (op === '<<' || op === '<<-') {
              redirs.push({op: '<<', target: null}); delimiter(op === '<<-');
            } else pending = op;
          } else if (c === ';' || c === '|' || c === '&') {
            boundary();
            const pair = src.slice(i, i + 2);
            i += [';;', '&&', '||', '|&'].includes(pair) ? 2 : 1;
          } else { piece(c); i++; }
        }
      }
      boundary();
    } catch (_) { return output; }
    return output;
  }
  return read(false);
}
module.exports = { parse };
