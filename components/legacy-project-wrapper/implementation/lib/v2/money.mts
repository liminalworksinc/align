// Estimated list cost in words, one rule for the web app and the MCP text (Z5), so the same snapshot never reads
// "$0.0010" on a card and "$0.00" to an agent. Plain module (no imports), so client components can load it.

/** "$12.35"; a cost under one cent (but not zero) keeps four decimals ("$0.0010"), so it never reads as nothing, and one
 *  that would round to "$0.0000" reads "under $0.0001" (C7-3). The amount is rounded to four decimals first and the
 *  format chosen from that, so 9,999 micro-dollars reads "$0.01" as 10,000 does, never "$0.0100". Zero is "$0.00". */
export function usd(micros: number): string {
  if (!(micros > 0)) return `$${(micros / 1e6).toFixed(2)}`;
  const tenThousandths = Math.round(micros / 100);
  if (tenThousandths === 0) return "under $0.0001";
  if (tenThousandths < 100) return `$0.${String(tenThousandths).padStart(4, "0")}`;
  return `$${(Math.round(micros / 10_000) / 100).toFixed(2)}`;
}
