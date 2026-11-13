'use strict';

const PROGRAM = "CREATE TRIGGER v2_events_attribution_guard\nBEFORE UPDATE OF actor, ws_id ON v2_events\nFOR EACH ROW\nWHEN\n  (NEW.actor IS NOT OLD.actor AND NEW.actor IS NOT NULL)\n  OR NOT (\n    NEW.ws_id IS OLD.ws_id\n    OR (\n      EXISTS (SELECT 1 FROM v2_workspaces WHERE id = OLD.ws_id)\n      AND NEW.ws_id IS NOT NULL\n      AND typeof(NEW.ws_id) = 'text'\n      AND length(NEW.ws_id) = 28\n      AND length(CAST(NEW.ws_id AS BLOB)) = 28\n      AND substr(NEW.ws_id, 1, 4) COLLATE BINARY = 'wsx_'\n      AND substr(NEW.ws_id, 5) NOT GLOB '*[^a-z2-7]*'\n      AND NOT EXISTS (SELECT 1 FROM v2_workspaces WHERE id = NEW.ws_id)\n    )\n  )\nBEGIN\n  SELECT RAISE(ABORT, 'v2_events attribution is immutable');\nEND;";

function extend_event_integrity_schema(programs) {
  return [...programs, PROGRAM];
}

module.exports = { extend_event_integrity_schema };
