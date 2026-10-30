// Fixed words for the error page and the no-JavaScript notice. Plain constants (no "use client"), so the server
// layout gets the string itself rather than a client reference.

export const ERROR_PAGE = "Something went wrong on this page.";
export const ERROR_RETRY = "Try again";
/** app/layout.tsx: shown only when the browser runs no JavaScript. */
export const NOSCRIPT = "Align needs JavaScript. Turn it on and reload this page.";
