// Typed connection to the qualified schema program library.
import * as native from "./native/.bindings/storage_schema.js";

export const changePrograms = native.change_programs as () => string[];
