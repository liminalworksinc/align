// Typed public names for the independently qualified share-again library.
import {
  text as nativeText,
  words as nativeWords,
  stopped as nativeStopped,
} from "../native/.bindings/share_again.js";

/** The sharing machine from the session list, or null when it is gone. */
export interface ShareAgainDevice {
  name: string;
  signed_out: boolean;
  has_workspace: boolean;
}

/** Plain wording, a machine name, or wording linked to the Devices page. */
export type ShareAgainPart = string | { device: string } | { devices_page: string };

export const shareAgainText = nativeText as (parts: ShareAgainPart[]) => string;
export const shareAgainWords = nativeWords as (device: ShareAgainDevice | null, who: string | null) => ShareAgainPart[];
export const sharingStoppedText = nativeStopped as (who: string | null, options?: { deleted?: boolean }) => string;
