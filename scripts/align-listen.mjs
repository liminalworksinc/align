#!/usr/bin/env node
// Read-only view of Align's authority stream: every ratified change and every agent session it reached.
const ALIGN = process.env.ALIGN_URL || "http://localhost:3100";
const ts = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString("en-US", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
};
const short = (id) => id.replace(/^claude-code:/, "Claude Code ").replace(/^codex:/, "Codex ").slice(0, 26);
const C = { dim: "\x1b[2m", bold: "\x1b[1m", violet: "\x1b[35m", amber: "\x1b[33m", reset: "\x1b[0m" };

async function run() {
  for (;;) {
    try {
      const res = await fetch(`${ALIGN}/api/directives/stream?session=*`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const event = /^event: (.+)$/m.exec(frame)?.[1];
          const data = /^data: (.+)$/m.exec(frame)?.[1];
          if (!event || !data) continue;
          const d = JSON.parse(data);
          if (event === "hello") console.log(`${C.dim}${ts()}  connected to Align · waiting for ratified changes${C.reset}`);
          if (event === "authority") {
            const lag = Date.now() - Date.parse(d.at);
            console.log(`${C.bold}← ${ts()}  ${d.title}${C.reset}  ${C.dim}(${lag} ms after the decision)${C.reset}`);
            const live = d.recipients.length ? `pushing now to ${d.recipients.map(short).join(", ")}` : "no agent session listening right now";
            console.log(`${C.dim}   ${live}${d.later ? ` · ${d.later} other session(s) receive it on their next turn` : ""}${C.reset}`);
          }
          if (event === "delivered") console.log(`${C.violet}→ ${ts(d.at)}  delivered to ${short(d.session)} · agent woken to replan${C.reset}`);
        }
      }
    } catch {
      console.log(`${C.amber}${ts()}  Align not reachable, retrying…${C.reset}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
run();
