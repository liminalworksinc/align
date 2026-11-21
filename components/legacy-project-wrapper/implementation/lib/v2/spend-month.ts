import { badRequest } from "./errors";

/** One UTC calendar month, with literal years below 100 and no month after 9999-12. */
export function spendMonth(month: string | null) {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith("0000-")) throw badRequest("Choose a calendar month.");
  const from = `${month}-01T00:00:00.000Z`, start = Date.parse(from), next = new Date(from);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { month, from, to: next.getUTCFullYear() > 9999 ? null : next.toISOString(), start, end: next.getTime() };
}
