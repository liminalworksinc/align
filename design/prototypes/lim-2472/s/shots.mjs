// LIM-2472 workstream S screenshots: node design/prototypes/lim-2472/s/shots.mjs <BASE> <OUT>
//   BASE: a running Align, e.g. http://127.0.0.1:3803
//   OUT:  a directory for the PNGs (never committed): <nn>-<screen>-<theme>-<width>.png
// Signs in with ALIGN_SIGNIN_URL (the link the server prints, or `npm run sign-in-link`), or with the newest link in
// $ALIGN_DATA_DIR/v2/sign-in.txt. Uses the first workspace on /app, creating the fictional Northstar sample when there
// is none. Dark at 1440/390/320, light at 1440. Chrome from CHROME_PATH or the usual macOS path.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(resolve("components/legacy-project-wrapper/implementation/package.json"));
const puppeteer = require("puppeteer-core");

const [BASE = "http://127.0.0.1:3803", OUT = "/tmp/lim-2472-s-shots"] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });

function signInUrl() {
  if (process.env.ALIGN_SIGNIN_URL) return process.env.ALIGN_SIGNIN_URL;
  const f = join(process.env.ALIGN_DATA_DIR ?? "components/legacy-project-wrapper/implementation/data", "v2", "sign-in.txt");
  if (!existsSync(f)) throw new Error(`No sign-in link: set ALIGN_SIGNIN_URL or ALIGN_DATA_DIR (looked for ${f})`);
  const m = [...readFileSync(f, "utf8").matchAll(/https?:\/\/\S+/g)].pop();
  if (!m) throw new Error(`No link in ${f}`);
  return m[0].replace(/^https?:\/\/[^/]+/, BASE);
}

const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-first-run"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });

const clickText = async (sel, text) => {
  const ok = await page.evaluate(
    (s, t) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.textContent?.trim().startsWith(t) && !e.disabled);
      if (el) el.click();
      return !!el;
    },
    sel,
    text,
  );
  if (!ok) throw new Error(`No ${sel} "${text}" on ${page.url()}`);
};

// Sign in: the link fills the email and code; Sign in submits.
await page.goto(signInUrl(), { waitUntil: "networkidle0" });
if (page.url().includes("/sign-in")) {
  await clickText("button", "Sign in");
  await page.waitForFunction(() => !location.pathname.startsWith("/app/sign-in"), { timeout: 20000 });
}
await page.goto(`${BASE}/app`, { waitUntil: "networkidle0" });
let ws = await page.evaluate(() => document.querySelector('a[href^="/app/w/"]')?.getAttribute("href")?.split("/")[3] ?? null);
if (!ws) {
  await clickText("button", "Create the Northstar sample");
  await page.waitForFunction(() => location.pathname.startsWith("/app/w/"), { timeout: 30000 });
  ws = new URL(page.url()).pathname.split("/")[3];
}
const cr = await page.evaluate(async (w) => {
  const r = await fetch(`/api/v2/workspaces/${w}/change-requests`).then((x) => x.json());
  return [...(r.waiting_on_me ?? []), ...(r.mine ?? []), ...(r.others ?? [])][0]?.id ?? null;
}, ws);

const SCREENS = [
  ["record", `/app/w/${ws}/record`],
  ...(cr ? [["record-cr", `/app/w/${ws}/record?cr=${cr}`]] : []),
  ["apps", `/app/w/${ws}/apps`],
  ["sessions", `/app/w/${ws}/sessions`],
];
const RUNS = [
  ["dark", 1440],
  ["dark", 390],
  ["dark", 320],
  ["light", 1440],
];

let n = 0;
for (const [screen, path] of SCREENS) {
  for (const [theme, width] of RUNS) {
    await page.evaluateOnNewDocument((t) => localStorage.setItem("align-theme", t), theme);
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
    await page.setViewport({ width, height: 900 });
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 400));
    // A single change request's record opens its disclosures, so the shot shows the compare.
    if (screen === "record-cr") await page.evaluate(() => document.querySelectorAll("[data-surface=decision-record] details").forEach((d) => (d.open = true)));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const file = join(OUT, `${String(++n).padStart(2, "0")}-${screen}-${theme}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${file}${overflow > 0 ? `  HORIZONTAL SCROLL ${overflow}px` : ""}`);
  }
}
await browser.close();
