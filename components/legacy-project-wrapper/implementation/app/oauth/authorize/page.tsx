import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { takeOAuthCall } from "@/lib/oauth/limits";
import { knownProvider } from "@/lib/oauth/clients";
import { checkAuthorize, originFromHost } from "@/lib/oauth/server";
import { clientOf } from "@/lib/ratelimit";
import { getAuth } from "@/lib/v2/auth";
import { all } from "@/lib/v2/db";
import { signedInRecently } from "@/lib/v2/http";
import { ready } from "@/lib/v2/init";
import AuthorizeForm, { type Person } from "./AuthorizeForm";

// OAuth authorization endpoint: an AI app (Claude, ChatGPT, Claude Code, Codex) sends the person here to connect
// Align. The request is checked on the server first; a request whose app or redirect can't be trusted is refused here
// and never redirected, and every check runs before any sign-in check. Then the person must be signed in to Align
// (Better Auth), recently, and picks one of their workspaces. The form posts the answer to /api/oauth/approve, which
// checks everything again.
export default function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Authorize searchParams={searchParams} />
    </Suspense>
  );
}

/** Who the app's data goes to, from where it sends the person back. */
function providerOf(redirectHost: string): string {
  const h = redirectHost.replace(/:\d+$/, "");
  const known = knownProvider(h);
  if (known) return known;
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return "the AI provider of the app on your computer (for example Claude Code or Codex)";
  return `the company behind ${h}`;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The signed-in person, whether their sign-in is recent, and the workspaces where they may connect an app. */
async function personFrom(h: Headers): Promise<Person | null> {
  await ready();
  const s = await getAuth().api.getSession({ headers: h });
  if (!s?.user) return null;
  const workspaces = all<{ id: string; name: string; role: "owner" | "member" }>(
    "SELECT w.id, w.name, m.role FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? WHERE m.role IN ('owner','member') ORDER BY w.name, w.id",
    s.user.id,
  ).map((w) => ({ id: w.id, name: w.name, role: w.role })); // plain objects: SQLite rows can't cross to a client component
  return { name: s.user.name, email: s.user.email, recent: signedInRecently(s.session.createdAt), workspaces };
}

function Refused({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-[560px] bg-[var(--al-bg)] p-6 text-[16px] text-zinc-900">
      <h1 className="mb-3 text-[24px] font-semibold">Can’t connect this app</h1>
      {children}
    </main>
  );
}

async function Authorize({ searchParams }: { searchParams: PageProps<"/oauth/authorize">["searchParams"] }) {
  await connection();
  const h = await headers();
  try {
    // Each view can make Align fetch an app's client document, so views are limited per client like the token endpoint.
    takeOAuthCall(clientOf(new Request("http://align.invalid/", { headers: h })), "authorize");
  } catch {
    return (
      <Refused>
        <p>Too many requests from this network. Wait a minute, then reload this page.</p>
      </Refused>
    );
  }
  const raw = await searchParams;
  const params = Object.fromEntries(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  const check = await checkAuthorize(params, originFromHost(h.get("host")));
  if (!check.ok && "fatal" in check) {
    return (
      <Refused>
        <p>{check.fatal}</p>
      </Refused>
    );
  }
  if (!check.ok) {
    return (
      <Refused>
        <p className="mb-4">The app sent a request Align can’t accept. Go back to the app and try again.</p>
        <a className="text-violet-700 underline" href={check.redirect}>
          Return to the app
        </a>
      </Refused>
    );
  }
  const redirect = new URL(check.request.redirect_uri);
  const loopback = redirect.protocol === "http:" && LOOPBACK.has(redirect.hostname);
  return (
    <AuthorizeForm
      params={params}
      here={`/oauth/authorize?${new URLSearchParams(params)}`}
      clientName={check.request.client.client_name}
      // Every name is the app's own claim (review L4): only a client document published by a known AI provider's site
      // is spared the warning.
      selfNamed={check.request.client.kind === "dcr" || !knownProvider(new URL(check.request.client.client_id).host)}
      redirectHost={redirect.host}
      loopback={loopback}
      provider={providerOf(redirect.host)}
      person={await personFrom(h)}
    />
  );
}
