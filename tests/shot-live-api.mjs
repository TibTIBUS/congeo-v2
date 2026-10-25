import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";
const dist = new URL("../dist", import.meta.url).pathname;
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer(async (req, res) => {
  let p = req.url.split("?")[0].split("#")[0]; if (p.endsWith("/")) p += "index.html";
  try { const b = await readFile(join(dist, p)); res.writeHead(200, { "content-type": mime[extname(p)] || "application/octet-stream" }); res.end(b); }
  catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" })).newPage();
await page.goto(BASE + "/", { waitUntil: "load" });
await page.waitForSelector("text=Qui es-tu", { timeout: 15000 });
const names = await page.$$eval(".card button", (bs) => bs.map((b) => b.textContent.trim()));
console.log("sélecteur :", names.length, "salariés réels —", names.slice(0, 3).join(", "), "…");
await page.screenshot({ path: "/tmp/live-api-picker.png" });
// vue salarié réel (premier de la liste)
await page.click(`.card button >> nth=0`);
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/live-api-employee.png", fullPage: false });
const empTxt = await page.evaluate(() => document.body.innerText.slice(0, 300));
console.log("vue salarié :", empTxt.split("\n").slice(0, 8).join(" | "));
// vue admin
await page.goto(BASE + "/#/admin", { waitUntil: "load" });
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/live-api-admin.png" });
const admTxt = await page.evaluate(() => document.body.innerText);
console.log("admin contient couverture :", /ouvertures couvertes/.test(admTxt), "| congés :", /emandes|ongés/.test(admTxt));
await browser.close(); server.close();
