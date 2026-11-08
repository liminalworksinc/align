'use strict';

function create_events(resources) {
  const { secret, eventActor, recordEvent, sql, get, tx } = resources;
  function actorOf(userId) {
    return eventActor(secret(), userId);
  }
  function event(name, o = {}) {
    return recordEvent(sql, name, {
      ws: o.ws ?? null,
      actor: o.user ? actorOf(o.user) : null,
      props: o.props,
      at: o.at
    });
  }
  function noteFirstMcpRead(wsId, userId, client) {
    if (get("SELECT 1 AS x FROM v2_events WHERE name = 'first_mcp_read' AND ws_id = ?", wsId)) return;
    tx(() => event('first_mcp_read', { ws: wsId, user: userId, props: { client } })).catch(() => undefined);
  }
  return { actorOf, event, noteFirstMcpRead };
}

module.exports = { create_events };
