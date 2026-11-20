// LIM-2472 workstream S: no evidence chip is cut at 320.
//   node design/prototypes/lim-2472/s/chips-320.check.mjs <seed-agent out.json> [path ...]
// Signs in to the seeded Mode L server as each role (test-IdP passwords from out.json, that server only) and opens each
// path at 320 wide, dark and light: Home, Work, the record and the review of every seeded request by default. For every
// evidence chip ([data-evidence]) it checks that nothing inside is clipped (scroll width within its box), nothing ends in
// an ellipsis, and the chip lies inside the viewport; and that the page doesn't scroll sideways. Exits 1 on any failure.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(resolve("components/legacy-project-wrapper/implementation/package.json"));
const puppeteer = require("puppeteer-core");
const [seedFile, ...extra] = process.argv.slice(2);
if (!seedFile) throw new Error("usage: chips-320.check.mjs <seed out.json> [path ...]");
const seed = JSON.parse(readFileSync(seedFile, "utf8"));
const paths = extra.length
  ? extra
  : ["", "work", ...Object.values(seed.goals).map((g) => `work?goal=${g}`), "record", ...Object.values(seed.change_requests).map((c) => `record?cr=${c}`)];
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

let failed = 0;
let chips = 0;
for (const who of ["owner", "member", "viewer"]) {
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage();
  await page.goto(`${seed.base}/app/sign-in`, { waitUntil: "networkidle0" });
  const a = seed.accounts[who];
  const ok = await page.evaluate(
    async (email, password) => (await fetch("/api/v2/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).status,
    a.email,
    a.password,
  );
  if (ok !== 200) throw new Error(`${who} sign-in: ${ok}`);
  for (const theme of ["dark", "light"]) {
    await page.evaluateOnNewDocument((t) => localStorage.setItem("align-theme", t), theme);
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
    await page.setViewport({ width: 320, height: 900 });
    for (const p of paths) {
      await page.goto(`${seed.base}/app/w/${seed.ws}/${p}`, { waitUntil: "networkidle0" });
      await page.waitForFunction(() => !document.body.innerText.includes("Reading evidence…"), { timeout: 15000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
      const r = await page.evaluate(() => {
        const bad = [];
        const all = [...document.querySelectorAll("[data-evidence]")].filter((el) => el.offsetParent && !el.closest('[aria-hidden="true"]'));
        for (const el of all) {
          const box = el.getBoundingClientRect();
          const cut = [el, ...el.querySelectorAll("*")].some((n) => n.scrollWidth > n.clientWidth + 1 || getComputedStyle(n).textOverflow === "ellipsis");
          if (cut || box.left < -0.5 || box.right > innerWidth + 0.5) bad.push(el.innerText.replace(/\s+/g, " ").trim());
        }
        return { n: all.length, bad, hscroll: document.documentElement.scrollWidth > innerWidth };
      });
      chips += r.n;
      const fail = r.bad.length > 0 || r.hscroll;
      if (fail) failed++;
      console.log(`${fail ? "FAIL" : "ok  "} ${who} ${theme} /${p || "(home)"}: ${r.n} chips${r.bad.length ? `; cut: ${r.bad.join(" | ")}` : ""}${r.hscroll ? "; scrolls sideways" : ""}`);
    }
  }
  await browser.close();
}
console.log(failed ? `\n${failed} pages failed` : `\nall passed (${chips} chips)`);
process.exit(failed ? 1 : 0);
