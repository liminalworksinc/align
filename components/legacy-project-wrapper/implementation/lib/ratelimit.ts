import { config } from "./config";

// Client keys for rate limits (the OAuth routes, lib/oauth/limits.ts; Better Auth and /api/v2, lib/v2). The limits
// themselves live with their routes.

/**
 * IPv6 addresses collapse to their /64 (one host can hold a whole /64, so per-address keys are free to rotate).
 * An IPv4-mapped address (::ffff:a.b.c.d, or its hex form ::ffff:xxxx:xxxx) is that IPv4 client: its /64 is
 * ::ffff:0:0 for every IPv4 address, so collapsing it would put all IPv4 clients in one bucket (Sean's #6 review).
 */
export function clientNet(ip: string): string {
  let v = ip.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!v.includes(":")) return v;
  // A dotted IPv4 tail is two hex groups.
  const dotted = v.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) {
    const [, pre, ...oct] = dotted;
    const n = oct.map(Number);
    if (n.some((x) => x > 255)) return v;
    v = `${pre}${((n[0] << 8) | n[1]).toString(16)}:${((n[2] << 8) | n[3]).toString(16)}`;
  }
  const [head, tail = ""] = v.split("::");
  const a = head ? head.split(":") : [];
  const b = v.includes("::") && tail ? tail.split(":") : [];
  const groups = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b].map((x) => parseInt(x || "0", 16));
  if (groups.length === 8 && groups.slice(0, 5).every((x) => x === 0) && groups[5] === 0xffff)
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
  return `${groups.slice(0, 4).map((x) => (Number.isNaN(x) ? "0" : x.toString(16))).join(":")}::/64`;
}

/** The client key for limits: Fly-Client-IP when hosted (trusted only there; IPv6 keyed by /64), else one local key. */
export function clientOf(req: Request): string {
  return config().hosted ? `ip:${clientNet(req.headers.get("fly-client-ip") ?? "unknown")}` : "local";
}
