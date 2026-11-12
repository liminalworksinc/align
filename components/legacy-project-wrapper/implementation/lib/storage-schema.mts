// Compose the separately qualified predecessor and refresh-recovery transition.
import * as history from "./native/.bindings/storage_schema.js";
import * as refresh from "./native/.bindings/storage_refresh_schema.js";

const previous = history.change_programs as () => string[];
const extend = refresh.extend_device_refresh_schema as (programs: string[]) => string[];
export const changePrograms = (): string[] => extend(previous());
