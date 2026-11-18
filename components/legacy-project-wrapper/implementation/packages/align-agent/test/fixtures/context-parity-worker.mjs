// Each side gets fresh module state, the same clock and ids, and the same starting files.
import crypto from "node:crypto";
const { name, home, harness, cwd, counted, source, at } = JSON.parse(process.argv[2]);
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [at])); }
  static now() { return RealDate.parse(at); }
};
Object.defineProperty(process, "pid", { value: 1 });
let sequence = 0;
crypto.randomBytes = (size) => crypto.createHash("sha256").update(String(sequence++)).digest().subarray(0, size);
const handlers = await import("../../src/hooks/handlers.ts");
const fn = handlers[counted ? name : `${name}Uncounted`];
const sid = "paired-context";
const input = { session_id: sid, cwd, source, prompt: "continue", prompt_id: "paired_prompt", turn_id: "paired_prompt", tool_name: "Bash", tool_input: { command: "true" } };
const output = name === "failureDeny" ? fn(home, harness, sid)
  : name === "command" ? fn(home, harness, sid, cwd, "::align status")
  : fn(home, harness, input, ...(name === "sessionStart" ? [{}] : []));
process.stdout.write(JSON.stringify(output));
