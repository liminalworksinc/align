// Hook-safe file helpers. Imports only node:fs, node:path and node:crypto so hooks stay small and offline.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function b64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString("base64url");
}

/** prefix + 22 url-safe random chars (16 bytes). */
export function randomId(prefix: string, bytes = 16): string {
  return prefix + b64url(crypto.randomBytes(bytes));
}

export function sha256hex(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Distinguishes "absent" from "present but unreadable", which the stop latch needs to fail closed. */
export function readJsonStrict<T>(file: string): { state: "absent" } | { state: "ok"; value: T } | { state: "bad" } {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ENOENT" ? { state: "absent" } : { state: "bad" };
  }
  try {
    return { state: "ok", value: JSON.parse(text) as T };
  } catch {
    return { state: "bad" };
  }
}

export function ensureDir(dir: string, mode = 0o700): void {
  fs.mkdirSync(dir, { recursive: true, mode });
}

export function writeFileAtomic(file: string, data: string | Buffer, mode = 0o600): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  const fd = fs.openSync(tmp, "w", mode);
  try {
    fs.writeSync(fd, typeof data === "string" ? Buffer.from(data, "utf8") : data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

export function writeJsonAtomic(file: string, value: unknown, mode = 0o600): void {
  writeFileAtomic(file, JSON.stringify(value, null, 2) + "\n", mode);
}

export function removeFile(file: string): void {
  try {
    fs.unlinkSync(file);
  } catch {
    /* already gone */
  }
}
