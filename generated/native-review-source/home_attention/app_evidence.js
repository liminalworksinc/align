'use strict';
exports.app_evidence = function app_evidence(lastReadAt) {
  return typeof lastReadAt === 'string' && lastReadAt.length > 0 ? 'delivery_receipt' : 'not_observed';
};
