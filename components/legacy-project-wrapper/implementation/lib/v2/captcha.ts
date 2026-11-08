// Public aliases for the independently qualified captcha service.
import {identityEffects, type IdentityEffectsRuntime} from "../identity-effects.mts";

export const CAPTCHA_HEADER: IdentityEffectsRuntime["CAPTCHA_HEADER"] = identityEffects.CAPTCHA_HEADER;
export const captchaPlugin: IdentityEffectsRuntime["captchaPlugin"] = identityEffects.captchaPlugin;
export const requireCaptcha: IdentityEffectsRuntime["requireCaptcha"] = identityEffects.requireCaptcha;
