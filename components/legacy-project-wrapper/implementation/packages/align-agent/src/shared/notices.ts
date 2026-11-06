// Typed public names for the independently qualified notice library.
import {
  constants as nativeConstants,
  kind as nativeKind,
  is_share_state as nativeIsShareState,
  resumed_held as nativeResumedHeld,
} from "../native/.bindings/share_notices.js";

const noticeConstants = nativeConstants() as {
  SHARE_STATE_NOTICES: string[];
  RESUMED_NOTICE: "Align: this session was resumed from its Align workspace, so its tools work again.";
};

export const SHARE_STATE_NOTICES = noticeConstants.SHARE_STATE_NOTICES;
export const RESUMED_NOTICE = noticeConstants.RESUMED_NOTICE;
export const noticeKind = nativeKind as (id: string) => string;
export const isShareStateNotice = nativeIsShareState as (kind: string) => boolean;
export const resumedButHeld = nativeResumedHeld as (held: string[], reader: "user" | "model") => string;
