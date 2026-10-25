import { chromium } from "playwright-core";
const port = process.env.V2PORT;
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
for (const [name, vp] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, locale: "fr-FR" });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent.includes("Lhomme")), null, { timeout: 15000 });
  await page.screenshot({ path: `/downloads/v2-reel-${name}-accueil.png` });
  await page.click("button:has-text('Lhomme Chloé')");
  await page.waitForFunction(() => document.body.innerText.includes("Total travaillé"), null, { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/downloads/v2-reel-${name}-salarie.png` });
  await page.goto(`http://127.0.0.1:${port}/#/admin`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => document.body.innerText.includes("Administration") && document.body.innerText.includes("Planning"), null, { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/downloads/v2-reel-${name}-admin.png` });
  console.log(name, "OK");
  await ctx.close();
}
await browser.close();
