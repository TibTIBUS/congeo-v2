import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
for (const [name, vp] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await (await browser.newContext({ viewport: vp, locale: "fr-FR" })).newPage();
  await page.goto("https://tibtibus.github.io/congeo-v2/", { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `/tmp/live-${name}.png` });
  const m = await page.evaluate(() => {
    const t = document.querySelector(".topbar"); if (!t) return null;
    return { bar: Math.round(t.getBoundingClientRect().width), kids: [...t.children].map((c) => ({ cls: c.className || c.tagName, w: Math.round(c.getBoundingClientRect().width) })), vw: innerWidth };
  });
  console.log(name, JSON.stringify(m));
  await page.context().close();
}
await browser.close();
