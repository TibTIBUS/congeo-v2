import { chromium } from "playwright-core";
const SITE = "https://tibtibus.github.io/congeo-v2/";
const until = async (page, fn, secs = 30) => {
  for (let i = 0; i < secs; i++) { if (await page.evaluate(fn)) return true; await page.waitForTimeout(1000); }
  return false;
};
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
for (const [name, vp] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, locale: "fr-FR" });
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "load", timeout: 45000 });
  const acc = await until(page, () => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Lhomme")));
  if (!acc) { console.log(name, "ECHEC accueil"); continue; }
  await page.screenshot({ path: `/downloads/v2-live-${name}-accueil.png` });
  await page.click("button:has-text('Lhomme Chloé')");
  const sal = await until(page, () => document.body.innerText.includes("Total travaillé"));
  await page.screenshot({ path: `/downloads/v2-live-${name}-salarie.png` });
  await page.goto(SITE + "#/admin", { waitUntil: "load", timeout: 45000 });
  const adm = await until(page, () => document.body.innerText.includes("10 salariés"));
  const fictif = await page.evaluate(() => document.body.innerText.includes("FICTIF"));
  await page.screenshot({ path: `/downloads/v2-live-${name}-admin.png` });
  await page.goto(SITE, { waitUntil: "load", timeout: 45000 });
  const ret = await until(page, () => document.body.innerText.includes("Total travaillé") && document.body.innerText.includes("Lhomme Chloé"));
  console.log(`${name}: accueil=${acc} salarié=${sal} admin10=${adm} FICTIF=${fictif} retourSalarié=${ret}`);
  await ctx.close();
}
await browser.close();
