import { all, audit, get, run, sql, tx } from "./db";
import { currentDeviceWorkspace, dispatchRevisionMatches, grantDispatchWindow, tierBlocked } from "./data-sharing";
import type { DevicePrincipal } from "./devices";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { event } from "./events";
import { deleteExpiredExcerpts } from "./excerpt-retention.mts";
import { nowIso } from "./ids";
import { scheduleOptionalSessionExpiry } from "./retention";
import type { PolicyPrincipal } from "./policy";
import { ownSession } from "./sessions";
import { isBlankText } from "./text-core.mts";
import type { Body } from "./validate";
import { memberName, memberPrincipal, need } from "./workspaces";

export const EXCERPT_ID = /^ex_[a-f0-9]{32}$/;

interface Excerpt {
  id: string;
  session_key: string;
  shared_by: string;
  text: string;
  purpose: string;
  created_at: string;
  expires_at: string;
}

const HOUR_MS = 3_600_000;
const BIDI_OR_CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u;
const SUMMARY = "e.id, e.shared_by, e.purpose, e.created_at, e.expires_at";
const VISIBLE = `e.ws_id = ? AND e.expires_at > ?
  AND (e.shared_by = ? OR EXISTS (SELECT 1 FROM v2_excerpt_readers r
    WHERE r.ws_id = e.ws_id AND r.excerpt_id = e.id AND r.user_id = ?))`;

function view(row: Omit<Excerpt, "session_key" | "text">, userId: string) {
  const { shared_by, ...summary } = row;
  return { ...summary, shared_by: memberName(shared_by), can_revoke: shared_by === userId };
}

function excerptPolicy(pp: PolicyPrincipal, dev: DevicePrincipal, key: string) {
  const current = currentDeviceWorkspace(pp, dev);
  const session = ownSession(current, dev, key);
  need(current, "session.share");
  const revision = get<{ revision: number }>("SELECT revision FROM v2_device_excerpt_consent WHERE device_id = ? AND enabled = 1", dev.deviceId)?.revision;
  return { enabled: session.state === "shared" && !tierBlocked(pp.wsId, 4) && revision !== undefined, revision };
}

export function excerptReaders(pp: PolicyPrincipal, dev: DevicePrincipal, key: string) {
  const { enabled } = excerptPolicy(pp, dev, key);
  return {
    enabled,
    readers: enabled ? all<{ id: string; name: string }>(`SELECT u.id, u.name
      FROM v2_members m JOIN ba_user u ON u.id = m.user_id
      WHERE m.ws_id = ? AND m.user_id <> ? ORDER BY u.name, u.id`, pp.wsId, pp.userId) : [],
  };
}

export async function excerptDispatch(pp: PolicyPrincipal, dev: DevicePrincipal, key: string,
  phase: "dispatch" | "answer", revision: string | null) {
  return tx(() => {
    const choices = excerptReaders(pp, dev, key);
    if (!choices.enabled) return choices;
    if (phase === "answer") return dispatchRevisionMatches(pp.wsId, "excerpt", revision)
      ? choices : { enabled: false, readers: [] };
    return { ...choices, ...grantDispatchWindow(pp.wsId, "excerpt") };
  });
}

function selection(b: Body) {
  const { id, text, purpose, readers, hours } = b;
  if (Object.keys(b).some((key) => !["id", "text", "purpose", "readers", "hours"].includes(key))) {
    throw badRequest("Send only the excerpt and its sharing details.");
  }
  if (typeof id !== "string" || !EXCERPT_ID.test(id)) throw badRequest("Confirm the excerpt preview again.");
  if (typeof text !== "string" || !text.length || !text.isWellFormed() || BIDI_OR_CONTROL.test(text)
    || Buffer.byteLength(text) > 4000) throw badRequest("Choose excerpt text that fits in 4,000 bytes and has no hidden controls.");
  if (typeof purpose !== "string" || isBlankText(purpose) || [...purpose].length > 160 || !purpose.isWellFormed()
    || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(purpose) || BIDI_OR_CONTROL.test(purpose)) {
    throw badRequest("Enter a purpose on one line, up to 160 characters.");
  }
  if (!Array.isArray(readers) || !readers.length || readers.length > 5 || new Set(readers).size !== readers.length
    || readers.some((reader) => typeof reader !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(reader))) {
    throw badRequest("Choose one to five different readers.");
  }
  if (typeof hours !== "number" || !Number.isInteger(hours) || hours < 1 || hours > 168) {
    throw badRequest("Choose an expiry from 1 to 168 whole hours.");
  }
  return { id, text, purpose, readers: readers as string[], hours };
}

async function expire(ws: string) {
  const at = nowIso();
  if (get("SELECT 1 FROM v2_session_excerpts WHERE ws_id = ? AND expires_at <= ? LIMIT 1", ws, at)) {
    await tx(() => deleteExpiredExcerpts(sql, nowIso(), ws));
  }
}

export async function shareExcerpt(pp: PolicyPrincipal, dev: DevicePrincipal, key: string, b: Body, ifMatch: string | null) {
  await expire(pp.wsId);
  const shared = await tx(() => {
    const { enabled, revision } = excerptPolicy(pp, dev, key);
    if (!enabled) throw forbidden("excerpts_off", "Sharing excerpts is off.");
    if (ifMatch !== `"${revision}"`) throw conflict("excerpt_preview_expired", "The sharing choice changed. Preview the excerpt again.");
    const input = selection(b);
    const at = nowIso();
    const { id, text, purpose, readers, hours } = input;
    for (const reader of readers) {
      if (reader === pp.userId || !get("SELECT 1 FROM v2_members WHERE ws_id = ? AND user_id = ?", pp.wsId, reader)) throw notFound();
    }
    const old = get<Excerpt>("SELECT * FROM v2_session_excerpts WHERE id = ?", id);
    if (old) {
      if (old.session_key !== key || old.shared_by !== pp.userId || !get("SELECT 1 FROM v2_session_excerpts WHERE id = ? AND ws_id = ?", id, pp.wsId)
        || old.expires_at <= at) throw notFound();
      const audience = all<{ user_id: string }>("SELECT user_id FROM v2_excerpt_readers WHERE ws_id = ? AND excerpt_id = ?", pp.wsId, id);
      if (text !== old.text || purpose !== old.purpose || Date.parse(old.expires_at) - Date.parse(old.created_at) !== hours * HOUR_MS
        || audience.length !== readers.length || !audience.every(({ user_id }) => readers.includes(user_id))) {
        throw conflict("excerpt_changed", "The excerpt or its sharing details changed. Preview a new share.");
      }
      return { id, expires_at: old.expires_at };
    }
    if (!run("INSERT INTO v2_excerpt_share_ids (id, ws_id) VALUES (?, ?) ON CONFLICT(id) DO NOTHING", id, pp.wsId)) throw notFound();
    const expires_at = new Date(Date.parse(at) + hours * HOUR_MS).toISOString();
    run(`INSERT INTO v2_session_excerpts (id, ws_id, session_key, shared_by, text, purpose, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, pp.wsId, key, pp.userId, text, purpose, at, expires_at);
    for (const reader of readers) run("INSERT INTO v2_excerpt_readers VALUES (?, ?, ?)", pp.wsId, id, reader);
    audit(pp.wsId, pp.userId, "session_excerpt.shared", id, at);
    event("session_excerpt_shared", { ws: pp.wsId, user: pp.userId, at });
    return { id, expires_at };
  });
  scheduleOptionalSessionExpiry();
  return shared;
}

export async function listExcerpts(pp: PolicyPrincipal) {
  return tx(() => {
    need(memberPrincipal(pp.wsId, pp.userId), "workspace.read");
    const at = nowIso();
    deleteExpiredExcerpts(sql, at, pp.wsId);
    const rows = all<Omit<Excerpt, "text" | "session_key">>(`SELECT ${SUMMARY} FROM v2_session_excerpts e
      WHERE ${VISIBLE} ORDER BY e.created_at DESC, e.id`, pp.wsId, at, pp.userId, pp.userId);
    return { excerpts: rows.map((row) => view(row, pp.userId)) };
  });
}

export async function readExcerpt(pp: PolicyPrincipal, id: string) {
  const row = await tx(() => {
    need(memberPrincipal(pp.wsId, pp.userId), "workspace.read");
    const at = nowIso();
    deleteExpiredExcerpts(sql, at, pp.wsId);
    return get<Omit<Excerpt, "session_key">>(`SELECT ${SUMMARY}, e.text FROM v2_session_excerpts e
      WHERE e.id = ? AND ${VISIBLE}`, id, pp.wsId, at, pp.userId, pp.userId);
  });
  if (!row) throw notFound();
  const { text, ...summary } = row;
  return { ...view(summary, pp.userId), text };
}

export async function revokeExcerpt(pp: PolicyPrincipal, id: string) {
  const removed = await tx(() => {
    need(memberPrincipal(pp.wsId, pp.userId), "workspace.read");
    const at = nowIso();
    deleteExpiredExcerpts(sql, at, pp.wsId);
    const count = run("DELETE FROM v2_session_excerpts WHERE ws_id = ? AND id = ? AND shared_by = ? AND expires_at > ?", pp.wsId, id, pp.userId, at);
    if (count) audit(pp.wsId, pp.userId, "session_excerpt.revoked", id, at);
    return count;
  });
  if (!removed) throw notFound();
}
