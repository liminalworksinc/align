// Estimated list cost in words, one rule for the web app and the MCP text (Z5), so the same snapshot never reads
// "$0.0010" on a card and "$0.00" to an agent. Plain module (no imports), so client components can load it.

/** "$12.35"; a cost under one cent (but not zero) keeps four decimals ("$0.0010"), so it never reads as nothing. */
export const usd = (micros: number) => `$${(micros / 1e6).toFixed(micros > 0 && micros < 10_000 ? 4 : 2)}`;
