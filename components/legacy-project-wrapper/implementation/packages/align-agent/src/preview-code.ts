import { createHmac, timingSafeEqual } from "node:crypto";

const LIFETIME_MS = 10 * 60_000;

export function previewCode(secret: Buffer, scope: unknown[], at = Date.now()): string {
  const mac = createHmac("sha256", secret).update(JSON.stringify([at, ...scope])).digest("hex").slice(0, 32);
  return `${at}.${mac}`;
}

export function confirmedPreview(secret: Buffer, scope: unknown[], value: string): boolean {
  if (!/^\d{13}\.[a-f0-9]{32}$/.test(value)) return false;
  const at = Number(value.slice(0, 13));
  const elapsed = Date.now() - at;
  return elapsed >= 0 && elapsed < LIFETIME_MS && timingSafeEqual(Buffer.from(value), Buffer.from(previewCode(secret, scope, at)));
}
