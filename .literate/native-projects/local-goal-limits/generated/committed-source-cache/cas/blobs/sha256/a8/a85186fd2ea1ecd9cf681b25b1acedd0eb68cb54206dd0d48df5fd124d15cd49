'use strict';

function create_goal_limits(resources) {
  const badRequest = resources.badRequest;
  const cleanProse = resources.cleanProse;
  const isBlankText = resources.isBlankText;
  const rand32 = resources.rand32;
  const readDate = resources.readDate;
  const LIMIT_TYPES = ['must', 'must_not', 'out_of_scope'];
  const LIMITS_MAX = 5;
  const LIMIT_TEXT_MAX = 160;
  const LIMIT_SOURCE_TITLE_MAX = 120;

  function cleanText(v) {
    const text = cleanProse(v.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')).replace(/\s+/g, ' ').trim();
    return isBlankText(text) ? '' : text;
  }

  function isDay(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const t = readDate().parse(v + 'T00:00:00Z');
    if (Number.isNaN(t)) return false;
    const DateConstructor = readDate();
    return new DateConstructor(t).toISOString().slice(0, 10) === v;
  }

  function newLimitId() {
    return 'lim_' + rand32(8).slice(0, 12);
  }

  function limitsOf(row) {
    return JSON.parse(row.limits_json || '[]');
  }

  function parseSource(v, field) {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'object' || Array.isArray(v)) throw badRequest(field + '.source must be an object with kind, title and date');
    if (v.kind !== 'meeting' && v.kind !== 'manual') throw badRequest(field + '.source.kind must be meeting or manual');
    if (v.title !== undefined && v.title !== null && typeof v.title !== 'string') throw badRequest(field + '.source.title must be a string');
    const title = typeof v.title === 'string' ? cleanText(v.title) : '';
    if (title.length > LIMIT_SOURCE_TITLE_MAX) throw badRequest(field + '.source.title is too long (max 120 characters)');
    if (!isDay(v.date)) throw badRequest(field + '.source.date must be a day like 2026-10-22');
    return {kind: v.kind, title, date: v.date};
  }

  function limitsIn(v, prev) {
    if (v === undefined) return prev;
    if (!Array.isArray(v)) throw badRequest('limits must be a list');
    if (v.length > LIMITS_MAX) throw badRequest('limits: at most 5');
    const parsed = v.map((item, i) => {
      const field = 'limits[' + i + ']';
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw badRequest(field + ' must be an object with type and text');
      if (typeof item.type !== 'string' || !LIMIT_TYPES.includes(item.type)) throw badRequest(field + '.type must be one of ' + LIMIT_TYPES.join(', '));
      if (typeof item.text !== 'string') throw badRequest(field + '.text must be a string');
      const text = cleanText(item.text);
      if (!text) throw badRequest(field + '.text is required');
      if (text.length > LIMIT_TEXT_MAX) throw badRequest(field + '.text is too long (max 160 characters)');
      return {sentId: typeof item.id === 'string' ? item.id : null, type: item.type, text, source: parseSource(item.source, field)};
    });
    const reserved = new Set();
    for (const item of parsed) {
      if (item.sentId && prev.some(p => p.id === item.sentId) && !reserved.has(item.sentId)) reserved.add(item.sentId);
    }
    const taken = new Set();
    return parsed.map(item => {
      let id = item.sentId && reserved.has(item.sentId) && !taken.has(item.sentId) ? item.sentId : null;
      if (!id) {
        id = prev.find(p => !reserved.has(p.id) && !taken.has(p.id) && p.type === item.type && p.text === item.text && JSON.stringify(p.source) === JSON.stringify(item.source))?.id ?? null;
      }
      if (!id) id = newLimitId();
      taken.add(id);
      return {id, type: item.type, text: item.text, source: item.source};
    });
  }

  return {LIMIT_TYPES, LIMITS_MAX, LIMIT_TEXT_MAX, LIMIT_SOURCE_TITLE_MAX, cleanText, isDay, newLimitId, limitsOf, limitsIn};
}

module.exports = {create_goal_limits};
