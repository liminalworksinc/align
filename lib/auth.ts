import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Actor } from "./types";
import { HttpError } from "./store";

export const COOKIE = "align_session";

function secret(): string {
  if (process.env.ALIGN_SECRET) return process.env.ALIGN_SECRET;
  const file = path.join(process.cwd(), "data", ".secret");
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return readFileSync(file, "utf8").trim();
}

const PASSCODES: Record<Actor, string> = {
  product: process.env.ALIGN_PRODUCT_PASSCODE || "product-demo",
  security: process.env.ALIGN_SECURITY_PASSCODE || "security-demo",
  leadership: process.env.ALIGN_LEADERSHIP_PASSCODE || "leadership-demo",
};

export const DISPLAY: Record<Actor, string> = {
  product: "Product Director",
  security: process.env.ALIGN_SECURITY_NAME || "Alex / Security Lead",
  leadership: process.env.ALIGN_LEADERSHIP_NAME || "CEO / Leadership",
};

export interface Session {
  actor: Actor;
  sid: string;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function login(role: string, passcode: string): { token: string; session: Session } {
  if (role !== "product" && role !== "security" && role !== "leadership") throw new HttpError(400, "Unknown role");
  const expected = Buffer.from(PASSCODES[role]);
  const given = Buffer.from(String(passcode ?? ""));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new HttpError(401, "Wrong passcode for this role");
  }
  const session: Session = { actor: role, sid: randomUUID().slice(0, 8) };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, session };
}

export function readSession(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const good = sign(payload);
  if (good.length !== mac.length || !timingSafeEqual(Buffer.from(good), Buffer.from(mac))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    return s.actor === "product" || s.actor === "security" || s.actor === "leadership" ? s : null;
  } catch {
    return null;
  }
}

export function sessionFrom(req: Request): Session | null {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return readSession(match ? decodeURIComponent(match.slice(COOKIE.length + 1)) : undefined);
}

export function requireSession(req: Request): Session {
  const s = sessionFrom(req);
  if (!s) throw new HttpError(401, "Sign in as Product or Security first");
  return s;
}
