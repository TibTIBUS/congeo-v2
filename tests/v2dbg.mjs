import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on("console", (m) => console.log("[console]", m.type(), m.text().slice(0, 200)));
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("response", (r) => { if (r.url().includes("neon.tech")) console.log("[api]", r.status(), r.request().method(), r.url().slice(-40)); });
page.on("requestfailed", (r) => { if (r.url().includes("neon.tech")) console.log("[reqfail]", r.url().slice(-50), r.failure()?.errorText); });
await page.goto("https://tibtibus.github.io/congeo-v2/", { waitUntil: "load", timeout: 45000 });
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Lhomme")), null, { timeout: 20000 });
console.log("accueil OK");
await page.click("button:has-text('Lhomme Chloé')");
for (let i = 0; i < 15; i++) {
  const t = await page.evaluate(() => document.body.innerText);
  if (t.includes("Total travaillé")) { console.log("Total travaillé visible après", i, "s"); break; }
  if (i === 14) console.log("JAMAIS visible. Corps:", t.slice(0, 400).replace(/\n/g, " | "));
  await page.waitForTimeout(1000);
}
await browser.close();
