// Fixed words for the error page and the no-JavaScript notice. Plain constants (no "use client"), so the server
// layout gets the string itself rather than a client reference.

export const ERROR_PAGE = "Something went wrong on this page.";
export const ERROR_RETRY = "Try again";
/** app/layout.tsx: shown only when the browser runs no JavaScript. */
export const NOSCRIPT = "Align needs JavaScript. Turn it on and reload this page.";

/** /app's line for a person in no workspace, naming only what they are offered: creating (with a code where one is
 *  needed), an invite link, and the sample only where its card is shown (never where a creation code is needed or
 *  creation is closed). */
export function firstRunWords(c: { closed: boolean; needsCode: boolean }): string {
  if (c.closed) return "You are not in a workspace yet. Open an invite link someone sent you.";
  if (c.needsCode) return "You are not in a workspace yet. Create one with a creation code, or open an invite link someone sent you.";
  return "You are not in a workspace yet. Create one, open an invite link someone sent you, or start from a sample.";
}
