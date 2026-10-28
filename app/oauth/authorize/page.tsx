import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { bindWs, wsSessionFrom } from "@/lib/auth";
import { slotOf } from "@/lib/labels";
import { takeOAuthCall } from "@/lib/oauth/limits";
import { checkAuthorize, originFromHost } from "@/lib/oauth/server";
import { clientOf } from "@/lib/ratelimit";
import AuthorizeForm, { type SignedIn } from "./AuthorizeForm";

// OAuth authorization endpoint: an AI app (Claude, ChatGPT, Claude Code, Codex) sends the person here to connect
// Align. The request is checked on the server; a request whose app or redirect can't be trusted is refused here and
// never redirected. The form posts the answer to /api/oauth/approve, which checks everything again.
export default function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Authorize searchParams={searchParams} />
    </Suspense>
  );
}

/** The AI provider a host belongs to, or null. */
function knownProvider(host: string): string | null {
  const h = host.split(":")[0];
  if (h === "claude.ai" || h.endsWith(".claude.ai") || h.endsWith(".anthropic.com")) return "Anthropic";
  if (h === "chatgpt.com" || h.endsWith(".chatgpt.com") || h.endsWith(".openai.com")) return "OpenAI";
  return null;
}

/** Who the app's data goes to, from where it sends the person back. */
function providerOf(redirectHost: string): string {
  const h = redirectHost.split(":")[0];
  const known = knownProvider(h);
  if (known) return known;
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return "the AI provider of the app on your computer (for example Claude Code or Codex)";
  return `the company behind ${h}`;
}

async function signedIn(h: Headers): Promise<SignedIn | null> {
  try {
    const s = wsSessionFrom(new Request("http://align.invalid/", { headers: h }));
    if (!s || s.ws === "northstar") return null;
    const state = await bindWs(s).read();
    const team = state.teams?.[slotOf(s.actor)];
    return { workspace: s.ws, company: state.company ?? "", team: team?.team ?? s.actor, name: team?.lead ?? "" };
  } catch {
    return null; // ended or unreadable: ask for a passcode instead
  }
}

async function Authorize({ searchParams }: { searchParams: PageProps<"/oauth/authorize">["searchParams"] }) {
  await connection();
  const h = await headers();
  try {
    // Each view can make Align fetch an app's client document, so views are limited per client like the token endpoint.
    takeOAuthCall(clientOf(new Request("http://align.invalid/", { headers: h })), "authorize");
  } catch {
    return (
      <main className="mx-auto max-w-[560px] p-6 text-[16px] text-zinc-900">
        <h1 className="mb-3 text-[24px] font-semibold">Can’t connect this app</h1>
        <p>Too many requests from this network. Wait a minute, then reload this page.</p>
      </main>
    );
  }
  const raw = await searchParams;
  const params = Object.fromEntries(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  const check = await checkAuthorize(params, originFromHost(h.get("host")));
  if (!check.ok && "fatal" in check) {
    return (
      <main className="mx-auto max-w-[560px] p-6 text-[16px] text-zinc-900">
        <h1 className="mb-3 text-[24px] font-semibold">Can’t connect this app</h1>
        <p>{check.fatal}</p>
      </main>
    );
  }
  if (!check.ok) {
    return (
      <main className="mx-auto max-w-[560px] p-6 text-[16px] text-zinc-900">
        <h1 className="mb-3 text-[24px] font-semibold">Can’t connect this app</h1>
        <p className="mb-4">The app sent a request Align can’t accept. Go back to the app and try again.</p>
        <a className="text-violet-700 underline" href={check.redirect}>
          Return to the app
        </a>
      </main>
    );
  }
  const host = new URL(check.request.redirect_uri).host;
  return (
    <AuthorizeForm
      params={params}
      clientName={check.request.client.client_name}
      // Every name is the app's own claim (review L4): only a client document published by a known AI provider's site
      // is spared the warning.
      selfNamed={check.request.client.kind === "dcr" || !knownProvider(new URL(check.request.client.client_id).host)}
      redirectHost={host}
      provider={providerOf(host)}
      signedIn={await signedIn(h)}
    />
  );
}
