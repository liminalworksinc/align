// One time format for every screen (specs/align/interface.md, the opening rules; LIM-2513): month, day and minute in
// the reader's locale, the year only when it isn't this year, never a numeric date and never seconds.

/** "Nov 13, 4:25 PM", or "Oct 2, 2025, 9:05 AM" for another year; "" for no time, and the input itself if unparseable. */
export function when(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
  });
}
