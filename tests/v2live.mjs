import { chromium } from "playwright-core";
const SITE = "https://tibtibus.github.io/congeo-v2/";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
for (const [name, vp] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, locale: "fr-FR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
  // 1. Accueil : 10 vrais salariés
  await page.goto(SITE, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Lhomme")), null, { timeout: 20000 });
  const n = await page.evaluate(() => document.querySelectorAll(".card button").length);
  await page.screenshot({ path: `/downloads/v2-live-${name}-accueil.png` });
  // 2. Vue salarié (données réelles)
  await page.click("button:has-text('Lhomme Chloé')");
  await page.waitForFunction(() => document.body.innerText.includes("Total travaillé"), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/downloads/v2-live-${name}-salarie.png` });
  // 3. Navigation salarié -> admin : DOIT afficher 10 salariés (pas 1)
  await page.goto(SITE + "#/admin", { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction(() => /(\d+) salariés/.exec(document.body.innerText)?.[1] === "10", null, { timeout: 20000 });
  await page.waitForTimeout(400);
  const fictif = await page.evaluate(() => document.body.innerText.includes("FICTIF"));
  await page.screenshot({ path: `/downloads/v2-live-${name}-admin.png` });
  // 4. Navigation admin -> salarié : propre vue seulement
  await page.goto(SITE, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction(() => document.body.innerText.includes("Total travaillé"), null, { timeout: 20000 });
  const emp = await page.evaluate(() => document.body.innerText.includes("Lhomme Chloé"));
  console.log(`${name}: accueil=${n} boutons, admin 10 salariés OK, FICTIF présent=${fictif}, retour salarié=${emp}`);
  await ctx.close();
}
await browser.close();
