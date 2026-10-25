import { chromium } from "playwright-core";
const SITE = "https://tibtibus.github.io/congeo-v2/#/admin";
const until = async (page, fn, secs = 30) => { for (let i = 0; i < secs; i++) { if (await page.evaluate(fn)) return true; await page.waitForTimeout(1000); } return false; };
const cellState = () => {
  const row = [...document.querySelectorAll("table.grid tr")].find((tr) => tr.textContent.includes("Lecouillard Lucie"));
  return row ? row.querySelectorAll("td")[1].textContent.trim() : "absente";
};
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" })).newPage();
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.goto(SITE, { waitUntil: "load", timeout: 45000 });
await until(page, () => document.body.innerText.includes("10 salariés"));
console.log("avant:", await page.evaluate(cellState));
await page.click('table.grid tr:has-text("Lecouillard Lucie") td:nth-child(2)');
await page.waitForSelector('text=Revenir au gabarit', { timeout: 10000 });
const boxes = await page.$$('div.card input[type="checkbox"]');
await boxes[0].check();           // Travaillé
const times = await page.$$('div.card input[type="time"]');
await times[0].fill("09:00");     // début
await times[1].fill("12:30");     // fin
await boxes[1].check();           // Ouverture
await page.click('button:has-text("Enregistrer")');
const ok1 = await until(page, () => {
  const row = [...document.querySelectorAll("table.grid tr")].find((tr) => tr.textContent.includes("Lecouillard Lucie"));
  return row && !row.querySelectorAll("td")[1].textContent.includes("Repos");
}, 15);
console.log("écriture visible après save:", ok1, "→", await page.evaluate(cellState));
await page.screenshot({ path: "/downloads/v2-live-ecriture-admin.png" });
await page.goto(SITE, { waitUntil: "load", timeout: 45000 });
await until(page, () => document.body.innerText.includes("10 salariés"));
const apres = await page.evaluate(cellState);
console.log("persiste après rechargement:", apres !== "Repos", "→", apres);
await page.click('table.grid tr:has-text("Lecouillard Lucie") td:nth-child(2)');
await page.waitForSelector('text=Revenir au gabarit', { timeout: 10000 });
await page.click('button:has-text("Revenir au gabarit")');
const ok3 = await until(page, () => {
  const row = [...document.querySelectorAll("table.grid tr")].find((tr) => tr.textContent.includes("Lecouillard Lucie"));
  return row && row.querySelectorAll("td")[1].textContent.includes("Repos");
}, 15);
console.log("remise à zéro:", ok3, "→", await page.evaluate(cellState));
await browser.close();
