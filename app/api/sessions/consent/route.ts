import { requireSession } from "@/lib/auth";
import { body, handle, requireJson } from "@/lib/http";
import { captureConsents, HttpError, mutate, now, readState, setCaptureConsents, type CaptureHarness } from "@/lib/store";

// Capture consent (B1-1): a server-side record per harness and repo. /api/sessions/events refuses events
// (403, nothing written) for any harness and repo without one. Granting or revoking needs a signed-in session.

const REPO = /^[\w.-]{1,120}$/;

function parse(b: { harness?: unknown; repo?: unknown }): { harness: CaptureHarness; repo: string } {
  const harness = b.harness === "claude-code" || b.harness === "codex" ? b.harness : null;
  if (!harness) throw new HttpError(400, "harness must be claude-code or codex");
  const repo = typeof b.repo === "string" ? b.repo.trim() : "";
  if (!REPO.test(repo) || repo === "." || repo === "..") throw new HttpError(400, "repo must be a repository folder name");
  return { harness, repo };
}

export async function GET(req: Request) {
  return handle(async () => {
    requireSession(req);
    return { consents: captureConsents(await readState()) };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const who = requireSession(req);
    requireJson(req);
    const { harness, repo } = parse(await body(req));
    return mutate((s) => {
      const list = captureConsents(s).filter((c) => !(c.harness === harness && c.repo === repo));
      const record = { harness, repo, granted_by: who.actor, granted_at: now() };
      setCaptureConsents(s, [...list, record]);
      return { ok: true, consent: record };
    });
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    requireSession(req);
    requireJson(req);
    const { harness, repo } = parse(await body(req));
    return mutate((s) => {
      const before = captureConsents(s);
      const after = before.filter((c) => !(c.harness === harness && c.repo === repo));
      setCaptureConsents(s, after);
      return { ok: true, revoked: before.length !== after.length };
    });
  });
}
