// Test-only gates force the reviewed interleavings in separate hook processes.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const config = JSON.parse(process.argv[2]);
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [config.now])); }
  static now() { return config.now; }
};
const handlers = await import(pathToFileURL(config.handlers).href);
const send = (value) => fs.writeSync(1, JSON.stringify(value) + "\n");
const gate = () => {
  const byte = Buffer.alloc(1);
  for (;;) {
    try { if (fs.readSync(0, byte, 0, 1, null) !== 1) throw new Error("gate closed"); return; }
    catch (error) {
      if (error.code !== "EAGAIN") throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
    }
  }
};
let reads = 0, paused = false;
const read = fs.readFileSync, mkdir = fs.mkdirSync, append = fs.appendFileSync;
let activityRead = false;
const pause = () => { paused = true; send({ paused: true }); gate(); };
fs.readFileSync = (...args) => {
  const result = read(...args);
  if (args[0] === config.state && ++reads === config.pauseRead) pause();
  if (config.activityGate && !activityRead && args[0] === config.activity && /at (siblingChanges|collisions) /.test(new Error().stack)) {
    activityRead = true;
    send({ activityReady: true }); gate();
  }
  return result;
};
fs.appendFileSync = (...args) => {
  const result = append(...args);
  if (config.pauseAppend && args[0] === config.activity && !paused) pause();
  return result;
};
fs.mkdirSync = (...args) => {
  try { return mkdir(...args); }
  catch (error) {
    if (args[0] === config.state + ".lock" && config.pauseLock && !paused) pause();
    throw error;
  }
};
send({ ready: true });
gate();
const output = handlers.preToolUse(config.home, "claude-code", config.input);
if ((config.pauseRead || config.pauseLock || config.pauseAppend) && !paused) throw new Error("hook missed its scheduled race point");
send({ output });
