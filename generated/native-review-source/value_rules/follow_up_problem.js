'use strict';
const {safe_follow_up_url} = require('./safe_follow_up_url.js');
function follow_up_problem(env = process.env) {
  const set = (env.ALIGN_FOLLOW_UP_URL ?? '').trim();
  return set && safe_follow_up_url(set) === null
    ? 'Warning: ALIGN_FOLLOW_UP_URL is not an https URL (no credentials, default port) or a mailto: with one address and only a subject, so the decision value card shows no follow-up link.' : null;
}
module.exports = {follow_up_problem};
