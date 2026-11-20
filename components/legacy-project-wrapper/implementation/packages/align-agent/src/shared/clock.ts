// Hook-safe clock tolerance. No credentials or network imports.
/** Offsets under a minute count as clocks agreeing. */
export const CLOCK_TOLERANCE_MS = 60_000;
