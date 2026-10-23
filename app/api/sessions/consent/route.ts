import { requireSession, type Session } from "@/lib/auth";
import { body, handle, requireJson, requireSameOrigin } from "@/lib/http";
import { captureConsents, HttpError, id, mutate, now, readState, setCaptureConsents, type CaptureHarness } from "@/lib/store";

// Capture consent (B1-1): a server-side record per harness and repo. /api/sessions/events refuses events
// (403, nothing written) for any harness and repo without one. Listing needs a signed-in session; granting and
// revoking are leadership only, and each is an audit row carrying only the harness and repo.
// Revoking also purges that harness and repo's captured sessions and their mappings (ruling R1 default:
// sessions without consent do not persist), so nothing of that repo is mapped or sent to the model again.

const REPO = /^[\w.-]{1,120}$/;

function parse(b: { harness?: unknown; repo?: unknown }): { harness: CaptureHarness; repo: string } {
  const harness = b.harness === "claude-code" || b.harness === "codex" ? b.harness : null;
  if (!harness) throw new HttpError(400, "harness must be claude-code or codex");
  const repo = typeof b.repo === "string" ? b.repo.trim() : "";
  if (!REPO.test(repo) || repo === "." || repo === "..") throw new HttpError(400, "repo must be a repository folder name");
  return { harness, repo };
}

function requireLeadership(req: Request): Session {
  const who = requireSession(req);
  if (who.actor !== "leadership") throw new HttpError(403, "Only leadership can grant or revoke capture consent.");
  return who;
}

export async function GET(req: Request) {
  return handle(async () => {
    requireSession(req);
    return { consents: captureConsents(await readState()) };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const who = requireLeadership(req);
    requireJson(req);
    requireSameOrigin(req); // cross-port CSRF (review M4)
    const { harness, repo } = parse(await body(req));
    return mutate((s) => {
      const list = captureConsents(s).filter((c) => !(c.harness === harness && c.repo === repo));
      const record = { harness, repo, granted_by: who.actor, granted_at: now() };
      setCaptureConsents(s, [...list, record]);
      s.audit.push({ id: id("a"), actor: who.actor, session_id: who.sid, action: "grant_capture_consent", target: `${harness}/${repo}`, at: record.granted_at });
      return { ok: true, consent: record };
    });
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const who = requireLeadership(req);
    requireJson(req);
    requireSameOrigin(req); // cross-port CSRF (review M4)
    const { harness, repo } = parse(await body(req));
    return mutate((s) => {
      const before = captureConsents(s);
      const after = before.filter((c) => !(c.harness === harness && c.repo === repo));
      setCaptureConsents(s, after);
      const purged = new Set(s.sessions.filter((x) => x.harness === harness && x.repo === repo).map((x) => x.id));
      if (purged.size) {
        s.sessions = s.sessions.filter((x) => !purged.has(x.id));
        s.mappings = s.mappings.filter((m) => !purged.has(m.session_id));
      }
      const revoked = before.length !== after.length;
      // A revoke that changed nothing (no record, no sessions) is not an event.
      if (revoked || purged.size) s.audit.push({ id: id("a"), actor: who.actor, session_id: who.sid, action: "revoke_capture_consent", target: `${harness}/${repo}`, at: now() });
      return { ok: true, revoked, purged_sessions: purged.size };
    });
  });
}
