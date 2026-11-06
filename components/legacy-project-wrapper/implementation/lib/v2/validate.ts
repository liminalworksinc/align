// Typed public names for the independently qualified field validators.
import { badRequest } from "./errors";
import { BLANK_FILLERS, cleanProse, dropInvisible, isBlankText } from "./text-core.mts";
import * as native from "../native/.bindings/field_validation.js";

// Small field validators for v2 request bodies. Every failure is 400 with the field's name.
export type Body = Record<string, unknown>;

const values = native.create_validators({ badRequest, BLANK_FILLERS, cleanProse, dropInvisible, isBlankText }) as {
    str: (b: Body, k: string, max?: number, options3?: {
        min?: number;
    }) => string;
    cleanName: (v: string) => string;
    charCount: (v: string) => number;
    oneLine: (b: Body, k: string, max?: number) => string;
    optStr: (b: Body, k: string, max?: number) => string | null;
    oneOf: <T extends string>(b: Body, k: string, allowed: readonly T[]) => T;
    optOneOf: <T extends string>(b: Body, k: string, allowed: readonly T[]) => T | null;
    nonNegInt: (b: Body, k: string) => number;
    revisionRead: {
        (b: Body, optional: true): number | undefined;
        (b: Body, optional?: false): number;
    };
    assertRevisionReached: (what: "request" | "proposal", sent: number | undefined, current: number) => void;
    optInt: (b: Body, k: string) => number | null;
    iso: (b: Body, k: string) => string;
    optIso: (b: Body, k: string) => string | null;
    b64url: (b: Body, k: string, minLen: number, maxLen: number) => string;
    strList: (b: Body, k: string, options2?: {
        max?: number;
        itemMax?: number;
    }) => string[];
    NAME_MARKS_PER_CHAR: 6;
    NAME_PARTS_PER_CHAR: 16;
    NO_REVISION: "This decision doesn't say which revision you read, so nothing was recorded. Read it again and decide again.";
    B64URL: RegExp;
    ID_RE: RegExp;
    SESSION_KEY_RE: RegExp;
};

export const str = values.str;
export const cleanName = values.cleanName;
export const charCount = values.charCount;
export const oneLine = values.oneLine;
export const optStr = values.optStr;
export const oneOf = values.oneOf;
export const optOneOf = values.optOneOf;
export const nonNegInt = values.nonNegInt;
export const revisionRead = values.revisionRead;
export const assertRevisionReached = values.assertRevisionReached;
export const optInt = values.optInt;
export const iso = values.iso;
export const optIso = values.optIso;
export const b64url = values.b64url;
export const strList = values.strList;
export const NAME_MARKS_PER_CHAR = values.NAME_MARKS_PER_CHAR;
export const NAME_PARTS_PER_CHAR = values.NAME_PARTS_PER_CHAR;
export const NO_REVISION = values.NO_REVISION;
export const B64URL = values.B64URL;
export const ID_RE = values.ID_RE;
export const SESSION_KEY_RE = values.SESSION_KEY_RE;
