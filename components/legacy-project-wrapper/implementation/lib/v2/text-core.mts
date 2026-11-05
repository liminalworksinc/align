// Typed public names for the independently qualified wording library.
import * as native from "../native/.bindings/wording.js";


const values = native.wording_data() as {
    BLANK_FILLERS: "\u115F\u1160\u3164\uFFA0\u2800";
};

export const BLANK_FILLERS = values.BLANK_FILLERS;

export const dropControls = native.drop_controls as (v: string) => string;
export const dropInvisible = native.drop_invisible as (v: string) => string;
export const cleanProse = native.clean_prose as (v: string) => string;
export const isBlankText = native.is_blank_text as (v: string) => boolean;
