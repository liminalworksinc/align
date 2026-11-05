// Typed public names for the independently qualified wording library.
import * as native from "../native/.bindings/wording.js";


export const plural = native.plural as (n: number, one: string, many?: string) => string;
export const count = native.count as (n: number, one: string, many?: string, fmt?: (n: number) => string) => string;
