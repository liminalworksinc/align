'use strict';

function create_validators(context) {
  const {badRequest, cleanProse, dropInvisible, isBlankText, BLANK_FILLERS} = context;
  const NAME_MARKS_PER_CHAR = 6;
  const NAME_PARTS_PER_CHAR = 16;
  const NO_REVISION = "This decision doesn't say which revision you read, so nothing was recorded. Read it again and decide again.";
  const B64URL = /^[A-Za-z0-9_-]+$/;
  const ID_RE = /^[a-z]{1,4}_[A-Za-z0-9_-]{8,64}$/;
  const SESSION_KEY_RE = /^[A-Za-z0-9_-]{43}$/;
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
  const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
  const fillers = Array.from(BLANK_FILLERS, c => '\\u{' + c.codePointAt(0).toString(16) + '}').join('');
  const nameSpaces = new RegExp('[\\p{Cc}\\s\\u2028\\u2029' + fillers + ']+', 'gu');
  const tooLong = (key, max) => key + ' is too long (max ' + max + ' characters)';
  function str(body, key, max = 300, {min = 1} = {}) {
    const value = body[key];
    if (typeof value !== 'string') throw badRequest(key + ' must be a string');
    const text = cleanProse(value);
    if (text.length < min) throw badRequest(key + ' is required');
    if (min > 0 && isBlankText(text)) throw badRequest(key + ' is required');
    if (text.length > max) throw badRequest(tooLong(key, max));
    return text;
  }
  function optStr(body, key, max = 300) {
    const value = body[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw badRequest(key + ' must be a string or null');
    const text = cleanProse(value);
    if (isBlankText(text)) return null;
    if (text.length > max) throw badRequest(tooLong(key, max));
    return text;
  }
  function cleanName(value) {
    return dropInvisible(value.replace(/\p{Cc}/gu, ' ')).replace(nameSpaces, ' ');
  }
  function charCount(value) { return Array.from(segmenter.segment(value)).length; }
  function oneLine(body, key, max = 300) {
    const value = body[key];
    if (typeof value !== 'string') throw badRequest(key + ' must be a string');
    const text = cleanName(value).trim();
    if (isBlankText(text)) throw badRequest(key + ' is required');
    const parts = Array.from(segmenter.segment(text), part => part.segment);
    if (parts.length > max) throw badRequest(tooLong(key, max));
    if (parts.some(part => (part.match(/(?!\u200D)[\p{M}\p{Grapheme_Extend}\p{Emoji_Modifier}]/gu) || []).length > NAME_MARKS_PER_CHAR)) {
      throw badRequest(key + ' has a character with too many accents or marks on it (at most 6 on one character)');
    }
    if (parts.some(part => Array.from(part).length > NAME_PARTS_PER_CHAR)) {
      throw badRequest(key + ' has a character joined from too many parts (at most 16 in one character)');
    }
    if (Buffer.byteLength(text, 'utf8') > max * 16) throw badRequest(key + ' is too long to store: emoji such as families and flags take much more room than letters, so use fewer of them');
    return text;
  }
  function oneOf(body, key, allowed) {
    const value = body[key];
    if (typeof value !== 'string' || !allowed.includes(value)) throw badRequest(key + ' must be one of ' + allowed.join(', '));
    return value;
  }
  function optOneOf(body, key, allowed) {
    if (body[key] === undefined || body[key] === null) return null;
    return oneOf(body, key, allowed);
  }
  function nonNegInt(body, key) {
    const value = body[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw badRequest(key + ' must be a non-negative integer');
    return value;
  }
  function optInt(body, key) {
    if (body[key] === undefined || body[key] === null) return null;
    return nonNegInt(body, key);
  }
  function revisionRead(body, optional = false) {
    const value = body.revision;
    if (value === undefined && optional) return undefined;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw badRequest(NO_REVISION);
    return value;
  }
  function assertRevisionReached(what, sent, current) {
    if (sent !== undefined && sent > current) throw badRequest('This ' + what + ' has no revision ' + sent + ': it is at revision ' + current + ', so nothing was recorded. Read it again and decide again.', 'unknown_revision');
  }
  function iso(body, key) {
    const value = body[key];
    if (typeof value !== 'string' || !timestamp.test(value) || Number.isNaN(Date.parse(value))) throw badRequest(key + ' must be an ISO 8601 time');
    return new Date(value).toISOString();
  }
  function optIso(body, key) {
    if (body[key] === undefined || body[key] === null || body[key] === '') return null;
    return iso(body, key);
  }
  function b64url(body, key, minLen, maxLen) {
    const value = body[key];
    if (typeof value !== 'string' || !B64URL.test(value) || value.length < minLen || value.length > maxLen) throw badRequest(key + ' must be base64url (' + minLen + ' to ' + maxLen + ' characters)');
    return value;
  }
  function strList(body, key, {max = 50, itemMax = 300} = {}) {
    const value = body[key] ?? [];
    if (!Array.isArray(value)) throw badRequest(key + ' must be a list');
    if (value.length > max) throw badRequest(key + ' has too many items (max ' + max + ')');
    const result = [];
    for (const item of value) {
      if (typeof item !== 'string') throw badRequest(key + ' must be a list of strings');
      const text = item.trim();
      if (text.length > itemMax) throw badRequest(key + ' items are too long (max ' + itemMax + ' characters)');
      if (text && !result.includes(text)) result.push(text);
    }
    return result;
  }
  return {str, cleanName, charCount, oneLine, optStr, oneOf, optOneOf, nonNegInt, revisionRead, assertRevisionReached, optInt, iso, optIso, b64url, strList, NAME_MARKS_PER_CHAR, NAME_PARTS_PER_CHAR, NO_REVISION, B64URL, ID_RE, SESSION_KEY_RE};
}
module.exports = {create_validators};
