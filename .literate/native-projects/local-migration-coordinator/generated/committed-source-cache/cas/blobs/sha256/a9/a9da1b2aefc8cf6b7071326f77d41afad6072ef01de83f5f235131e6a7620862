'use strict';

function apply_migrations(context) {
  const version = context.readVersion();
  if (version >= context.changeCount) {
    context.complete();
    return;
  }
  context.setReferences(false);
  try {
    for (let next = version + 1; next <= context.changeCount; next += 1) {
      context.begin();
      try {
        context.apply(next);
        const count = context.brokenReferences();
        if (count !== 0) throw context.referenceError(next, count);
        context.writeVersion(next);
        context.commit();
      } catch (error) {
        context.rollback();
        throw error;
      }
    }
  } finally {
    context.setReferences(true);
  }
  context.complete();
}

module.exports = { apply_migrations };
