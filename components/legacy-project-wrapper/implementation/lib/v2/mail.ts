// Public aliases for the independently qualified sign-in delivery service.
import {identityEffects, type IdentityEffectsRuntime} from "../identity-effects.mts";

export const SIGN_IN_SUBJECT: IdentityEffectsRuntime["SIGN_IN_SUBJECT"] = identityEffects.SIGN_IN_SUBJECT;
export const signInLink: IdentityEffectsRuntime["signInLink"] = identityEffects.signInLink;
export const signInFile: IdentityEffectsRuntime["signInFile"] = identityEffects.signInFile;
export const sendSignInCode: IdentityEffectsRuntime["sendSignInCode"] = identityEffects.sendSignInCode;
