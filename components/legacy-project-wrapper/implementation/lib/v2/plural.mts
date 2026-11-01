// A count and its noun, singular for one: shared by the MCP text summaries (lib/mcp/register.ts) and the web app, so
// neither says "1 requests" (C4-4, C5-4). Plain module (no imports), so client components can load it.

/** The noun for `n`: `one` for exactly 1, else `many` (by default `one` + "s"). */
export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** "1 session", "2 sessions": `n` (as `fmt` writes it, by default as is) and its noun. */
export const count = (n: number, one: string, many = `${one}s`, fmt: (n: number) => string = String) => `${fmt(n)} ${plural(n, one, many)}`;
