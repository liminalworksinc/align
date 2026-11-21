import fs from "node:fs";
import { api, bindDevice, loadCredentials, signedIn } from "./api.ts";
import { excerptSource } from "./analysis.ts";
import type { Ctx } from "./context.ts";
import { kvGet, kvSet, tx } from "./db.ts";
import { getShare } from "./hot.ts";
import { confirmedPreview, previewCode } from "./preview-code.ts";

const CONSENT = "excerpt_sharing_consent";
const BIDI_OR_CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u;

export function excerptSharingOn(ctx: Ctx): boolean {
  const device = loadCredentials(ctx.home);
  return !!device && !device.signed_out && kvGet(ctx.db, CONSENT) === device.device_id;
}

export async function setExcerptSharing(ctx: Ctx, enabled: boolean) {
  const device = loadCredentials(ctx.home);
  if (!device || !signedIn(ctx.home)) {
    if (enabled) throw new Error("Sign in on this machine before allowing excerpt sharing.");
    kvSet(ctx.db, CONSENT, "");
    return false;
  }
  const revisionKey = `excerpt_sharing_revision:${device.device_id}`;
  const revision = tx(ctx.db, () => {
    const next = Number(kvGet(ctx.db, revisionKey) ?? 0) + 1;
    kvSet(ctx.db, revisionKey, String(next));
    kvSet(ctx.db, CONSENT, "");
    return next;
  });
  const unbind = bindDevice(ctx, device.device_id);
  try {
    const response = await api(ctx, "PUT", "/api/v2/devices/self/data-sharing", {
      body: { tier: 4, enabled, revision }, redirect: "error",
    });
    return tx(ctx.db, () => {
      if (kvGet(ctx.db, revisionKey) !== String(revision) || !signedIn(ctx.home)
        || loadCredentials(ctx.home)?.device_id !== device.device_id || response.json?.revision > revision) {
        throw new Error("A newer sharing choice or pairing replaced this request.");
      }
      if (response.status !== 200 || response.json?.enabled !== enabled || response.json?.revision !== revision) {
        throw new Error("Align did not save this sharing choice.");
      }
      if (enabled) kvSet(ctx.db, CONSENT, device.device_id);
      return true;
    });
  } finally {
    unbind();
  }
}

function sessionDestination(ctx: Ctx, lid: string) {
  const device = loadCredentials(ctx.home);
  const share = getShare(ctx, lid);
  if (!device || !excerptSharingOn(ctx)) throw new Error("Allow excerpts on this machine with align data-sharing excerpts on.");
  if (share?.state !== "shared") throw new Error("Choose a session you are sharing from this machine.");
  return {
    device: device.device_id,
    server: device.server_url,
    ws: share.workspace_id,
    url: `/api/v2/workspaces/${encodeURIComponent(share.workspace_id)}/sessions/${encodeURIComponent(share.session_key)}/excerpts`,
  };
}

type Reader = { id: string; name: string };

async function readersAt(ctx: Ctx, url: string): Promise<Reader[]> {
  const reply = await api(ctx, "GET", url, { redirect: "error" });
  if (reply.status === 404) throw new Error("This shared session is unavailable.");
  if (reply.status !== 200 || reply.json?.enabled !== true || !Array.isArray(reply.json.readers)) {
    throw new Error("This session cannot share excerpts. Check the workspace's sharing settings.");
  }
  return reply.json.readers;
}

export async function excerptReadersOnMachine(ctx: Ctx, lid: string): Promise<Reader[]> {
  const { device, url } = sessionDestination(ctx, lid);
  const unbind = bindDevice(ctx, device);
  try {
    return await readersAt(ctx, url);
  } finally {
    unbind();
  }
}

function loadExactText(file: string) {
  try {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    try {
      if (!fs.fstatSync(fd).isFile()) throw new Error();
      const bytes = Buffer.alloc(4001);
      let length = 0;
      while (length < bytes.length) {
        const n = fs.readSync(fd, bytes, length, bytes.length - length, null);
        if (!n) break;
        length += n;
      }
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length));
      if (!text.trim() || length > 4000 || BIDI_OR_CONTROL.test(text)) throw new Error();
      return text;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    throw new Error("The excerpt file must contain plain text up to 4,000 bytes with no hidden controls.");
  }
}

export type ExcerptChoice = { turn: string; file: string; purpose: string; readerIds: string[]; hours: number };

export async function prepareExcerpt(ctx: Ctx, lid: string, choice: ExcerptChoice, code?: string) {
  const { url, device, server, ws } = sessionDestination(ctx, lid);
  const { turn, file, purpose, readerIds, hours } = choice;
  if (!purpose.trim() || purpose.length > 160 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(purpose) || BIDI_OR_CONTROL.test(purpose)) {
    throw new Error("Enter a purpose on one line, up to 160 characters.");
  }
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw new Error("Choose an expiry from 1 to 168 whole hours.");
  if (!readerIds.length || readerIds.length > 5 || new Set(readerIds).size !== readerIds.length) {
    throw new Error("Choose one to five different readers.");
  }
  const text = loadExactText(file);
  const source = excerptSource(ctx, lid, turn);
  if (!source || ![source.prompt, ...source.replies, source.finalReply].some((part) => part?.includes(text))) {
    throw new Error("The excerpt must exactly match part of a prompt or reply in the selected completed turn.");
  }
  const readers = [...readerIds].sort();
  const scope = ["session excerpt", server, url, device, lid, turn, text, purpose, readers, hours];
  if (code !== undefined && !confirmedPreview(ctx.secret, scope, code)) {
    throw new Error("The preview changed or expired. Preview the excerpt again before sharing.");
  }
  const unbind = bindDevice(ctx, device);
  try {
    const roster = await readersAt(ctx, url);
    const selected = readers.map((id) => roster.find((reader) => reader.id === id));
    if (selected.some((reader) => !reader)) throw new Error("Choose readers from this workspace. Run align excerpt readers.");
    if (code === undefined) return { text, purpose, readers: selected as Reader[], hours, server, ws, code: previewCode(ctx.secret, scope) };
    if (!excerptSharingOn(ctx) || sessionDestination(ctx, lid).device !== device || sessionDestination(ctx, lid).url !== url) {
      throw new Error("The session's sharing changed. Preview the excerpt again.");
    }
    const id = `ex_${code.slice(14)}`;
    const reply = await api(ctx, "POST", url, { body: { id, text, purpose, readers, hours }, redirect: "error" });
    if (reply.status !== 200 || reply.json?.id !== id || typeof reply.json?.expires_at !== "string") {
      throw new Error(reply.json?.message ?? "Align did not confirm the excerpt was shared.");
    }
    return { id, expiresAt: reply.json.expires_at as string, server, ws };
  } finally {
    unbind();
  }
}

export function terminalText(text: string) {
  return JSON.stringify(text).replace(/[\p{Cc}\p{Cf}\p{Z}\p{M}\p{Default_Ignorable_Code_Point}]/gu, (char) => {
    if (char === " ") return char;
    return Array.from({ length: char.length }, (_, i) => `\\u${char.charCodeAt(i).toString(16).padStart(4, "0")}`).join("");
  });
}
