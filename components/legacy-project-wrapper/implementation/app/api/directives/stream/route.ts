import { agentOrRefuse, assertSessionInGrant } from "@/lib/agent-token";
import { describeEvent, pendingFor, recipientsFor } from "@/lib/directives";
import { bus, listening, type AuthorityEvent } from "@/lib/events";
import { assertLocal } from "@/lib/local-guard";
import { HttpError, now, readState } from "@/lib/store";

// Server-Sent Events: Align pushes authority changes to agent watchers the moment they commit.
//   ?session=<harness:id>  directives for one agent session (pending ones replay on connect)
//   ?session=*             every authority event and delivery (read-only wire view)
export async function GET(req: Request) {
  try {
    assertLocal(req);
  } catch (e) {
    return Response.json({ error: (e as HttpError).message }, { status: 403 });
  }
  const sid = new URL(req.url).searchParams.get("session") || "*";
  // With an agent token, this stream serves that workspace's session only (the wire view (*) is the default store's),
  // and only a session of the token's own harness and repo. A token that no longer verifies is 401, never the default.
  let agent: ReturnType<typeof agentOrRefuse>;
  try {
    agent = agentOrRefuse(req);
    if (agent && sid !== "*") assertSessionInGrant(await readState(agent.ws), agent, sid);
  } catch (e) {
    return Response.json({ error: (e as HttpError).message }, { status: (e as HttpError).status ?? 500 });
  }
  if (agent && sid === "*") return Response.json({ error: "An agent token streams one session, not the wire view" }, { status: 400 });
  const ws = agent?.ws;
  // `listening` is the default store's live view (GET /api/sessions, the wire view): workspace streams stay out of it.
  const tracksListening = sid !== "*" && !ws;
  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    async start(ctrl) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      send("hello", { session: sid, at: now() });
      const sent = new Set<string>();
      const flush = async () => {
        if (sid === "*") return;
        for (const d of pendingFor(await readState(ws), sid)) {
          if (sent.has(d.event_id)) continue;
          sent.add(d.event_id);
          send("directive", d);
        }
      };
      if (tracksListening) listening.set(sid, now());
      await flush();

      const onAuthority = async (e: AuthorityEvent) => {
        if (e.ws !== ws) return; // another store's event: a workspace's never reaches the default store, and back
        if (sid === "*") {
          const st = await readState();
          const all = recipientsFor(st, e.event_id);
          const live = all.filter((id) => listening.has(id));
          send("authority", { ...e, title: describeEvent(st, e.event_id), recipients: live, later: all.length - live.length });
        }
        else await flush();
      };
      const onDelivered = (d: { session: string; event_id: string; at: string }) => {
        if (sid === "*") send("delivered", d);
      };
      bus.on("authority", onAuthority);
      bus.on("delivered", onDelivered);
      const ping = setInterval(() => {
        if (closed) return;
        try {
          ctrl.enqueue(enc.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          closed = true;
        }
      }, 15000);
      cleanup = () => {
        closed = true;
        bus.off("authority", onAuthority);
        bus.off("delivered", onDelivered);
        clearInterval(ping);
        if (tracksListening) listening.delete(sid);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          ctrl.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
