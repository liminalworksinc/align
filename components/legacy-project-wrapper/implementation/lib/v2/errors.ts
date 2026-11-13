// Public error types and aliases for the independently qualified native library.
import * as native from "../native/.bindings/http_errors.js";

declare class V2ErrorShape extends Error {
    status: number;
    code: string;
    extra?: Record<string, unknown>;
    constructor(status: number, code: string, message?: string, extra?: Record<string, unknown>);
}

export type V2Error = V2ErrorShape;
export const V2Error = (native.data() as {V2Error: typeof V2ErrorShape}).V2Error;
export const notFound = native.not_found as () => V2Error;
export const badRequest = native.bad_request as (message: string, code?: string) => V2Error;
export const forbidden = native.forbidden as (code: string, message: string) => V2Error;
export const conflict = native.conflict as (code: string, message: string) => V2Error;
