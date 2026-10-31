// Test-only stand-in for the Anthropic API, for scripts/test-interview.mjs. Loaded into the server with
// NODE_OPTIONS=--import, never in production (.dockerignore keeps scripts/ out of the image, except ws-admin.mjs).
// Every POST to https://api.anthropic.com/v1/messages is answered here, never sent. The reply is chosen by a marker
// in the person's last message:
//   REFUSE  -> stop_reason "refusal"           BADJSON -> text that isn't JSON
//   DIRTY   -> a draft with control/bidi characters and an over-long field, to check the server cleans it
//   DONE    -> done: true                      anything else -> a normal next question
// Each request is appended as one JSON line to ALIGN_TEST_INTERVIEW_LOG: the headers the test checks and the body.
import { appendFileSync } from "node:fs";

const realFetch = globalThis.fetch;
const LOG = process.env.ALIGN_TEST_INTERVIEW_LOG;

const draft = (over = {}) => ({
  company: "Stubfield Labs",
  company_goal: "Ship the spring release",
  requirement: "",
  asking_team: "Mobile",
  asking_lead: "Ana Test",
  asking_goal: "",
  owning_team: "",
  owning_lead: "",
  owning_goal: "",
  owning_measure: "",
  dependency: "",
  asking_work: "",
  owning_work: "",
  plan: "",
  ...over,
});

function message(text, stop = "end_turn") {
  return new Response(
    JSON.stringify({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text }],
      stop_reason: stop,
      stop_sequence: null,
      stop_details: stop === "refusal" ? { type: "refusal", category: null, explanation: null } : null,
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
    { status: 200, headers: { "content-type": "application/json", "request-id": "req_test" } },
  );
}

globalThis.fetch = async function fetch(input, init = {}) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith("https://api.anthropic.com/")) return realFetch(input, init);
  const headers = new Headers(init.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined));
  const raw = typeof init.body === "string" ? init.body : init.body ? Buffer.from(await new Response(init.body).arrayBuffer()).toString("utf8") : "";
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {}
  if (LOG)
    appendFileSync(
      LOG,
      JSON.stringify({ url, key: headers.get("x-api-key"), auth: headers.get("authorization"), beta: headers.get("anthropic-beta"), body }) + "\n",
    );
  const msgs = body?.messages ?? [];
  const last = String(msgs[msgs.length - 1]?.content ?? "");
  if (last.includes("REFUSE")) return message("", "refusal");
  if (last.includes("BADJSON")) return message("this is not json");
  if (last.includes("DIRTY"))
    return message(JSON.stringify({ reply: "Next?‮​\u0007", draft: draft({ company: "Bad‮Co\u0000", dependency: "x".repeat(900) }), done: false }));
  if (last.includes("DONE")) return message(JSON.stringify({ reply: "All set. Check the form below.", draft: draft({ plan: "A plan that is long enough." }), done: true }));
  return message(JSON.stringify({ reply: "Which team owns the goal that would change?", draft: draft(), done: false }));
};
