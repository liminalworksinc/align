// Public error types and aliases for the independently qualified native library.
import * as native from "./native/.bindings/http_errors.js";

declare class HttpErrorShape extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string);
}

export type HttpError = HttpErrorShape;
export const HttpError = (native.data() as {HttpError: typeof HttpErrorShape}).HttpError;
