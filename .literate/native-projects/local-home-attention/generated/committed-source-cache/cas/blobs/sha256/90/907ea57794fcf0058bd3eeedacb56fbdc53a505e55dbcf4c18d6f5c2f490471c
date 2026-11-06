'use strict';
exports.app_status_words = function app_status_words(a, at) {
  if (a.last_read_at) return `Read the goals ${at(a.last_read_at)}`;
  if (a.last_used_at) return `Connected ${at(a.last_used_at)}, no goal read seen yet`;
  return `Approved ${at(a.approved_at)}, no goal read seen yet`;
};
