'use strict';

function create_suggestions(resources) {
  const { badRequest, forbidden, V2Error, cleanText, isDay, limitsOf,
    LIMIT_SOURCE_TITLE_MAX, LIMIT_TEXT_MAX, goalObj, goalRow, visibleGoals,
    takeAll, isBlankText, canReadGoal } = resources;
  const NOTES_MAX = 20000;
  const stop = new Set('the and all any are but can for from has have its may must need needs not nor our out own should that the their them then there this those was were what when which who will with would you your never only use used using scope part goal work team than more most least once also into onto been being does did don'.split(' '));
  function sentences(text) {
    return text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])|\n+|;\s+|\s+[-*•]\s+/)
      .map(s => cleanText(s.replace(/^[-*•\d.)\s]+/, ''))).filter(Boolean);
  }
  function limitType(sentence) {
    if (sentence.endsWith('?')) return null;
    const n = sentence.split(/\s+/).length;
    if (n < 4 || n > 45) return null;
    if (/\b(out of scope|out-of-scope|not in scope|outside (the|our|this) scope|not part of (the|this|our) (goal|project|scope|demo|work))\b/i.test(sentence)) return 'out_of_scope';
    if (/\b(ensure|make sure)\b|^(target|aim for)\b/i.test(sentence)) return 'must';
    if (/\b(must not|mustn't|must never|should not|shouldn't|should never|may not|not allowed to|never|do not|don't|cannot (all|be|exceed|go|use|run)|can not (all|be)|no more than|at most)\b/i.test(sentence)) return 'must_not';
    if (/\b(must|has to|have to|needs to|need to|should|is required to|are required to|at least|only use)\b/i.test(sentence)) return 'must';
    return null;
  }
  function keyWords(text) {
    return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !stop.has(w)));
  }
  function sameAs(limits, text) {
    const first = keyWords(text);
    return limits.find(l => {
      const second = keyWords(l.text);
      let overlap = 0;
      for (const w of first) if (second.has(w)) overlap++;
      return overlap / Math.max(1, Math.min(first.size, second.size)) >= 0.6;
    });
  }
  function goalFor(goals, sentence, prefer) {
    const words = new Map(goals.map(g => [g, keyWords([g.title, ...JSON.parse(g.measures_json).map(m => m.text)].join(' '))]));
    const counts = new Map();
    for (const set of words.values()) for (const w of set) counts.set(w, (counts.get(w) || 0) + 1);
    const said = keyWords(sentence);
    const scores = [...words].map(([g, set]) => {
      let score = 0;
      for (const w of set) {
        if (said.has(w) || [...said].some(s => s.length > w.length && s.startsWith(w) && w.length >= 4)) score += 1 / counts.get(w);
      }
      return { g, score };
    }).sort((a, b) => b.score - a.score);
    if (!scores.length || scores[0].score < 1) return null;
    const tied = scores.filter(s => Math.abs(s.score - scores[0].score) < 1e-9);
    if (tied.length === 1) return tied[0].g;
    return prefer ? (tied.find(s => s.g.id === prefer)?.g ?? null) : null;
  }
  function clip(v, max) { return v.length <= max ? v : v.slice(0, max - 1) + '\u2026'; }
  function suggestLimits(pp, b) {
    if (pp.wsRole === 'viewer') throw forbidden('read_only', 'Viewers can look but not change anything.');
    if (typeof b.notes !== 'string' || isBlankText(b.notes)) throw badRequest('notes is required: paste the notes, or type the limit');
    if (b.notes.length > NOTES_MAX) throw badRequest('notes is too long (max 20000 characters)');
    const src = b.source ?? {};
    if (typeof src !== 'object' || Array.isArray(src)) throw badRequest('source must be an object with title and date');
    if (src.title !== undefined && src.title !== null && typeof src.title !== 'string') throw badRequest('source.title must be a string');
    const title = typeof src.title === 'string' ? cleanText(src.title) : '';
    if (title.length > LIMIT_SOURCE_TITLE_MAX) throw badRequest('source.title is too long (max ' + LIMIT_SOURCE_TITLE_MAX + ' characters)');
    if (!isDay(src.date)) throw badRequest('source.date must be a day like 2026-10-22');
    let prefer = null;
    if (b.prefer_goal_id !== undefined && b.prefer_goal_id !== null) {
      if (typeof b.prefer_goal_id !== 'string') throw badRequest('prefer_goal_id must be a goal id');
      const g = goalRow(pp.wsId, b.prefer_goal_id);
      if (!g || !canReadGoal(pp, goalObj(g))) throw new V2Error(404, 'not_found', 'Not found');
      prefer = g.id;
    }
    if (!takeAll([{ key: 'limit-suggest:' + pp.userId, max: 20, windowMs: 60000 }, { key: 'limit-suggest-ws:' + pp.wsId, max: 120, windowMs: 3600000 }])) throw new V2Error(429, 'rate_limited', 'Too many requests, try again later');
    const goals = visibleGoals(pp).filter(g => g.status === 'active');
    const list = sentences(b.notes).slice(0, 200);
    const typed = list.length === 1;
    const source = { kind: typed ? 'manual' : 'meeting', title, date: src.date };
    const fallback = typed && prefer ? goals.find(g => g.id === prefer) : null;
    const groups = new Map();
    let dropped = 0;
    for (const sentence of list) {
      const type = limitType(sentence);
      if (type === null) continue;
      const g = goalFor(goals, sentence, prefer) || fallback;
      if (!g) { dropped++; continue; }
      const entry = groups.get(g.id) || { g, current: limitsOf(g), limits: [] };
      groups.set(g.id, entry);
      const text = clip(sentence.replace(/^[A-Za-z][\w ]{0,24}:\s+/, '').replace(/^\w/, w => w.toUpperCase()), LIMIT_TEXT_MAX);
      if (sameAs(entry.limits, text) || entry.limits.length >= 10) { dropped++; continue; }
      entry.limits.push({ type, text, quote: clip(sentence, 200), source, already: sameAs(entry.current, text)?.id ?? null });
    }
    const suggestions = [...groups.values()].map(({ g, limits }) => {
      const owns = g.owner_id === pp.userId;
      return { goal: { id: g.id, title: g.title, version: g.version }, can_edit: owns, can_propose: !owns, limits };
    });
    return { suggestions, dropped };
  }
  return { NOTES_MAX, sentences, limitType, keyWords, sameAs, goalFor, suggestLimits };
}

module.exports = { create_suggestions };
