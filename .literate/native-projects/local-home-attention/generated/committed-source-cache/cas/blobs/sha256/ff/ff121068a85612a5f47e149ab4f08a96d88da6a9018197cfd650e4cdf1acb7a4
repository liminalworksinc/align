'use strict';
exports.answer_evidence = function answer_evidence(state, autoAccepted = false) {
  if (state === 'received' || (state === 'accepted' && autoAccepted)) return 'delivery_receipt';
  return state === 'accepted' || state === 'declined' ? 'agent_reported' : 'not_observed';
};
