// LIM-2472 workstream S screenshots: node design/prototypes/lim-2472/s/shots.mjs <BASE> <OUT> [--seed <seed.json>] [--clean]
//   --seed: the out.json of seed-agent.mjs (a server started with ALIGN_TEST_IDP=1): signs in as its owner with the
//           test password and shoots the seeded workspace, the full set. Without it, the clean-sample flow below.
//   --clean: the smaller clean-sample set (dark 1440 and 390, files prefixed clean-), for the truthful empty states.
//   BASE: a running Align, e.g. http://127.0.0.1:3803
//   OUT:  a directory for the PNGs (never committed): <nn>-<screen>-<theme>-<width>.png, and .profile (the browser
//         profile that keeps the sign-in between runs)
// Signs in with ALIGN_SIGNIN_URL (the link the server prints, or `npm run sign-in-link`), or with the newest link in
// $ALIGN_DATA_DIR/v2/sign-in.txt. Uses the first workspace on /app, creating the fictional Northstar sample when there
// is none. Dark at 1440/390/320, light at 1440. Chrome from CHROME_PATH or the usual macOS path.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(resolve("components/legacy-project-wrapper/implementation/package.json"));
const puppeteer = require("puppeteer-core");

const argv = process.argv.slice(2);
const opt = (n) => {
  const i = argv.indexOf(n);
  if (i < 0) return undefined;
  const [, v] = argv.splice(i, 2);
  return v;
};
const CLEAN = argv.includes("--clean") ? (argv.splice(argv.indexOf("--clean"), 1), true) : false;
const SEED = opt("--seed");
const [BASE = "http://127.0.0.1:3803", OUT = "/tmp/lim-2472-s-shots"] = argv;
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
// A profile beside the shots keeps the sign-in, so a re-run needs no new code (codes are limited per address).
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, userDataDir: join(OUT, ".profile"), args: ["--no-first-run"] });
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

let ws, cr, seed;
if (SEED) {
  // The seeded owner signs in with the test-IdP password (this local server only), from the page, so the cookie lands
  // in the browser.
  seed = JSON.parse(readFileSync(SEED, "utf8"));
  await page.goto(`${BASE}/app/sign-in`, { waitUntil: "networkidle0" });
  const ok = await page.evaluate(
    async (email, password) => (await fetch("/api/v2/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).status,
    seed.accounts.owner.email,
    seed.accounts.owner.password,
  );
  if (ok !== 200) throw new Error(`seeded sign-in: ${ok}`);
  ws = seed.ws;
  cr = { id: seed.change_requests.launched, goal: seed.goals.security };
} else {
  // Sign in when the profile has no session: the link fills the email and code; Sign in submits.
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle0" });
  if (page.url().includes("/sign-in")) {
    await page.goto(signInUrl(), { waitUntil: "networkidle0" });
    await clickText("button", "Sign in");
    await page.waitForFunction(() => !location.pathname.startsWith("/app/sign-in"), { timeout: 20000 });
  }
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle0" });
  ws = await page.evaluate(() => document.querySelector('a[href^="/app/w/"]')?.getAttribute("href")?.split("/")[3] ?? null);
  if (!ws) {
    await clickText("button", "Create the Northstar sample");
    await page.waitForFunction(() => location.pathname.startsWith("/app/w/"), { timeout: 30000 });
    ws = new URL(page.url()).pathname.split("/")[3];
  }
  cr = await page.evaluate(async (w) => {
    const r = await fetch(`/api/v2/workspaces/${w}/change-requests`).then((x) => x.json());
    const c = [...(r.waiting_on_me ?? []), ...(r.mine ?? []), ...(r.others ?? [])][0];
    return c ? { id: c.id, goal: c.goal.id } : null;
  }, ws);
}

const DARK = [
  ["dark", 1440],
  ["dark", 390],
  ["dark", 320],
];
const FULL = [...DARK, ["light", 1440]];
// Work and the record also in light at 390.
const PHONE_LIGHT = [...FULL, ["light", 390]];
const SCREENS = CLEAN
  ? [
      ["record", `/app/w/${ws}/record`, DARK.slice(0, 2)],
      ["work", `/app/w/${ws}/work`, DARK.slice(0, 2)],
      ["apps", `/app/w/${ws}/apps`, DARK.slice(0, 2)],
      ["sessions", `/app/w/${ws}/sessions`, DARK.slice(0, 2)],
    ]
  : [
      // The three evidence classes side by side on one goal's Work page (Receipt, Agent reported, Not observed).
      ["three-states", `/app/w/${ws}/work?goal=${cr?.goal ?? ""}`, [["dark", 1440], ["light", 1440]], 0],
      ["record", `/app/w/${ws}/record`, PHONE_LIGHT],
      ...(cr ? [["record-cr", `/app/w/${ws}/record?cr=${cr.id}`, FULL]] : []),
      ["work", `/app/w/${ws}/work`, PHONE_LIGHT],
      ...(cr ? [["work-goal", `/app/w/${ws}/work?goal=${cr.goal}`, PHONE_LIGHT]] : []),
      ["dependencies", `/app/w/${ws}/dependencies`, FULL],
      ["apps", `/app/w/${ws}/apps`, FULL],
      ["sessions", `/app/w/${ws}/sessions`, FULL],
    ];
let n = 0;
for (const [screen, path, runs, fixed] of SCREENS) {
    for (const [theme, width] of runs) {
    await page.evaluateOnNewDocument((t) => localStorage.setItem("align-theme", t), theme);
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
    await page.setViewport({ width, height: 900 });
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 400));
    // A single change request's record opens its disclosures, so the shot shows the compare.
    if (screen === "record-cr") await page.evaluate(() => document.querySelectorAll("[data-surface=decision-record] details").forEach((d) => (d.open = true)));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const nn = fixed === 0 ? "00" : String(++n).padStart(2, "0");
    const file = join(OUT, `${CLEAN ? "clean-" : ""}${nn}-${screen}-${theme}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${file}${overflow > 0 ? `  HORIZONTAL SCROLL ${overflow}px` : ""}`);
  }
}
await browser.close();
