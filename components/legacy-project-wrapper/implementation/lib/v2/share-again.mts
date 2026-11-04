// How to share again a session that ended when its person left the workspace (`member_removed`), by where the machine
// that shared it stands now (W7; E2E-WEB cycle 13 W1): one wording for the person's Sessions tab note and the Stop and
// Resume refusal, so the two never disagree; and why a session its person stopped sharing can't be reached (E2E-WEB
// cycle 14 W3). Plain module (no imports), so client components can load it.

/** The machine that shared the session, as the session list's `device` gives it: null when no device is left. */
export interface ShareAgainDevice {
  name: string;
  signed_out: boolean;
  has_workspace: boolean;
}

/** One part of the sentence: words, the machine's name (`device`, which the Sessions tab wraps anywhere) or the words
 *  the Sessions tab links to the Devices page (`devices_page`). */
export type ShareAgainPart = string | { device: string } | { devices_page: string };

/** The sentence as plain text. */
export const shareAgainText = (parts: ShareAgainPart[]) => parts.map((p) => (typeof p === "string" ? p : "device" in p ? p.device : p.devices_page)).join("");

/** What shares the session again, for its person back in the workspace: `who` null is the reader themself ("you"), else
 *  the person's name. Given the workspace again (on Join, or from the Devices page), the machine's own PUT shares it
 *  again, so `::align share` is all; still paired but without the workspace, the Devices page gives it back (never
 *  `align login`, which would end that machine's shares in its other workspaces); signed out (or no device left),
 *  `align login` pairs it again. */
export function shareAgainWords(d: ShareAgainDevice | null, who: string | null): ShareAgainPart[] {
  const you = who === null;
  if (d && !d.signed_out && d.has_workspace) {
    return ["Its machine, ", { device: d.name }, `, has this workspace again: to share it again, ${you ? "run" : `${who} runs`} ::align share in the session.`];
  }
  const back = `To share it again now that ${you ? "you are" : `${who} is`} back, `;
  if (d && !d.signed_out) {
    return [
      `${back}${you ? "give" : `${who} gives`} its machine, `,
      { device: d.name },
      `, this workspace on ${you ? "your" : "their"} `,
      { devices_page: "Devices page" },
      ` (Give this device the workspace), then ${you ? "run" : "runs"} ::align share in the session.`,
    ];
  }
  return [`${back}${you ? "run" : `${who} runs`} align login on that machine (it has signed out of Align) and ${you ? "give" : "gives"} it this workspace, then ::align share in the session.`];
}

/** Why Stop and Resume can't reach a session its person stopped sharing (409 `sharing_stopped`; E2E-WEB cycle 14 W3):
 *  who stopped it (`who` null: the reader themself, "you"), that nothing shares it again, as Stop sharing for good says,
 *  and what shares the work again: a new session, unless their account was deleted (`deleted`). */
export function sharingStoppedText(who: string | null, { deleted = false }: { deleted?: boolean } = {}): string {
  const you = who === null;
  const lead = `${you ? "You" : who} stopped sharing this session, so a stop or resume can't reach it`;
  if (deleted) return `${lead}. Their account was deleted, so nothing can share it again.`;
  return `${lead}, and it won't be shared again, even if its machine runs ::align share. To share ${you ? "your" : "their"} work again, ${you ? "start" : `${who} starts`} a new session and ${you ? "run" : "runs"} ::align share in it.`;
}
