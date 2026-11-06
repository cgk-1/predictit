// Playwright smoke test against a running deployment (local wrangler dev or the workers.dev URL).
// Usage: BASE_URL=https://... GATE_PASSPHRASE=... node apps/web/e2e/smoke.mjs [outDir]
const { chromium } = require("playwright");
const { mkdirSync } = require("node:fs");

(async () => {
const base = process.env.BASE_URL ?? "http://127.0.0.1:8787";
const pass = process.env.GATE_PASSPHRASE ?? "";
const out = process.argv[2] ?? "e2e-out";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
// 1. unauthenticated → login shell, not the app
let res = await page.goto(base + "/", { waitUntil: "domcontentloaded" });
if (res.status() !== 401) throw new Error(`expected 401 login shell, got ${res.status()}`);
await page.fill("#p", pass);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle" }), page.click("button[type=submit]")]);
await page.waitForTimeout(1500);
if ((await page.title()).includes("sign in")) throw new Error("login did not succeed");
// 2. authenticated app routes
const routes = ["/", "/setups", "/gamma", "/closing", "/lean", "/positions", "/replay", "/performance", "/settings"];
for (const r of routes) {
  const rr = await page.goto(base + r, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const title = await page.title();
  const text = (await page.innerText("body")).slice(0, 120).replace(/\s+/g, " ");
  console.log(`${r} → ${rr.status()} | ${title} | ${text}`);
  await page.screenshot({ path: `${out}/${r === "/" ? "today" : r.slice(1)}.png`, fullPage: true });
}
// 3. phone width
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}/today-phone.png`, fullPage: true });
const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
console.log(`phone scrollWidth=${scrollW} (must be ≤ 390)`);
await browser.close();
if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("smoke ok");
})();
