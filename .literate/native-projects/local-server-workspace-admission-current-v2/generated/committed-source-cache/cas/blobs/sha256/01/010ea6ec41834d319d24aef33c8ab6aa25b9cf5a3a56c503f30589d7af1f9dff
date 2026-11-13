'use strict';

function create_disposable(resources) {
  const { forbidden } = resources;
  const domains = new Set(require('./disposable-domains.json').domains);
  function isDisposable(email) {
    const domain = email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase().replace(/\.$/, '');
    const labels = domain.split('.');
    for (let i = 0; i < labels.length - 1; i++) {
      if (domains.has(labels.slice(i).join('.'))) return true;
    }
    return false;
  }
  function refuseDisposable(email) {
    if (isDisposable(email)) throw forbidden('disposable_email', 'Use a work or personal email address, not a disposable one.');
  }
  return { isDisposable, refuseDisposable };
}
module.exports = { create_disposable };
