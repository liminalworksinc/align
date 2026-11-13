'use strict';
const EVIDENCE_CLASSES = ['delivery_receipt', 'agent_reported', 'not_observed'];
const EVIDENCE_WORDS = {delivery_receipt: 'Delivery receipt', agent_reported: 'Agent reported', not_observed: 'Not observed'};
const UNLAUNCHED_STATES = ['pending', 'not_yet'];
exports.data = function data() {
  return {EVIDENCE_CLASSES, EVIDENCE_WORDS, UNLAUNCHED_STATES};
};
