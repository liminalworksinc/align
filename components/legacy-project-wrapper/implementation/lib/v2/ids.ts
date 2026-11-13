import { identifierTools } from "../identifier-tools.mts";
import { rand32 } from "./core.mts";

export { rand32 };

export type IdPrefix = "u" | "ws" | "pod" | "g" | "al" | "dv" | "dir" | "inv" | "m" | "dr" | "cr" | "ar" | "ev" | "ask" | "vr" | "rq" | "rl";

export const newId: (prefix: IdPrefix) => string = identifierTools.newId;
export const secretToken = identifierTools.secretToken;
export const sha256hex = identifierTools.sha256hex;
export const nowIso = identifierTools.nowIso;
