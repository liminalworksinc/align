'use strict';

function create_ready(resources) {
  const { state, openDb, migrateAuth, migrate } = resources;
  function ready() {
    return state.__alignV2Ready ??= (async () => {
      openDb();
      await migrateAuth();
      migrate();
    })().catch((error) => {
      state.__alignV2Ready = undefined;
      throw error;
    });
  }
  return { ready };
}

module.exports = { create_ready };
