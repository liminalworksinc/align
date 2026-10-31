// Device secrets and the keyed identifiers from WIRE.md. The device secret never leaves the machine.
import crypto from "node:crypto";
import fs from "node:fs";
import { layout } from "./shared/layout.ts";
import { b64url, writeFileAtomic } from "./shared/fsx.ts";
import type { Harness } from "./shared/types.ts";

export class DeviceSecretError extends Error {}

/**
 * The 32-byte device secret behind every keyed id. Created once, exclusively, when the file does not exist. Any other
 * problem fails closed: regenerating would silently change every session, repo and request key and orphan sessions
 * this device already shared.
 */
export function deviceSecret(alignHome: string): Buffer {
  const file = layout.deviceSecret(alignHome);
  for (let attempt = 0; attempt < 2; attempt++) {
    let buf: Buffer;
    try {
      buf = fs.readFileSync(file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new DeviceSecretError(`cannot read ${file}: ${(e as Error).message}`);
      try {
        fs.writeFileSync(file, crypto.randomBytes(32), { flag: "wx", mode: 0o600 });
      } catch (w) {
        if ((w as NodeJS.ErrnoException).code !== "EEXIST") throw w; // another process created it first: read theirs
      }
      continue;
    }
    if (buf.length === 32) return buf;
    throw new DeviceSecretError(`${file} is ${buf.length} bytes, expected 32; refusing to replace it (restore it from backup or run align uninstall --purge)`);
  }
  throw new DeviceSecretError(`could not create ${file}`);
}

function hmac(secret: Buffer, msg: string): string {
  return b64url(crypto.createHmac("sha256", secret).update(msg, "utf8").digest());
}

/** session_key = base64url(HMAC-SHA256(device_secret, ws \0 harness \0 native_session_id)), 43 chars. */
export function sessionKey(secret: Buffer, ws: string, harness: Harness, nativeId: string): string {
  return hmac(secret, `${ws}\0${harness}\0${nativeId}`);
}

/** repo_key = base64url(HMAC-SHA256(device_secret, ws + "\0repo\0" + realpath(toplevel or cwd))). */
export function repoKey(secret: Buffer, ws: string, realRoot: string): string {
  return hmac(secret, `${ws}\0repo\0${realRoot}`);
}

/** request_key = base64url HMAC of the provider request id (namespaced by provider). */
export function requestKey(secret: Buffer, provider: string, providerId: string): string {
  return hmac(secret, `req\0${provider}\0${providerId}`);
}

export interface DeviceKey {
  publicKeyB64: string;
  sign(message: string): string;
}

/** Fresh Ed25519 keypair stored as PKCS#8 PEM in a 0600 file (not the Keychain, per plan). */
export function generateDeviceKey(alignHome: string): DeviceKey {
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  writeFileAtomic(layout.deviceKey(alignHome), privateKey.export({ type: "pkcs8", format: "pem" }) as string, 0o600);
  return loadDeviceKey(alignHome) as DeviceKey;
}

export function loadDeviceKey(alignHome: string): DeviceKey | null {
  let pem: string;
  try {
    pem = fs.readFileSync(layout.deviceKey(alignHome), "utf8");
  } catch {
    return null;
  }
  const priv = crypto.createPrivateKey(pem);
  const pub = crypto.createPublicKey(priv);
  const jwk = pub.export({ format: "jwk" }) as { x: string };
  return {
    publicKeyB64: jwk.x,
    sign: (message: string) => b64url(crypto.sign(null, Buffer.from(message, "utf8"), priv)),
  };
}

export function refreshMessage(deviceId: string, refreshToken: string, ts: string): string {
  const h = crypto.createHash("sha256").update(refreshToken, "utf8").digest("hex");
  return `align-refresh\n${deviceId}\n${h}\n${ts}`;
}
