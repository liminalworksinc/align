// Compose the separately qualified history, refresh and event-integrity transitions.
import * as history from "./native/.bindings/storage_schema.js";
import * as refresh from "./native/.bindings/storage_refresh_schema.js";
import * as integrity from "./native/.bindings/storage_event_integrity.js";

const previous = history.change_programs as () => string[];
const extend = refresh.extend_device_refresh_schema as (programs: string[]) => string[];
const guard = integrity.extend_event_integrity_schema as (programs: string[]) => string[];
export const changePrograms = (): string[] => guard(extend(previous()));
