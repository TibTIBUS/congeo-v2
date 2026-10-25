import { chromium } from "playwright-core";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createApp } from "../server/index.js";

const dbPath = join(mkdtempSync(join(tmpdir(), "congeo-shots-")), "db.json");
const server = createApp(dbPath, new URL("../dist", import.meta.url).pathname);
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable" });
const login = async (page, email, pw) => {
  await page.goto(BASE + "/");
  await page.waitForSelector("text=Connexion");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pw);
  await page.click("text=Se connecter");
};
// admin desktop
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
const p2 = await ctx2.newPage();
await login(p2, "admin@echoppe.test", "demo-admin");
await p2.waitForSelector("text=PLANNING · L'ÉCHOPPE");
await p2.waitForTimeout(500);
await p2.screenshot({ path: "/tmp/v2-admin-coupure.png", fullPage: true });
// admin mobile 390
const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR" });
const p3 = await ctx3.newPage();
await login(p3, "admin@echoppe.test", "demo-admin");
await p3.waitForSelector("text=PLANNING · L'ÉCHOPPE");
await p3.waitForTimeout(500);
await p3.screenshot({ path: "/tmp/v2-admin-coupure-mobile.png", fullPage: true });
// salarié mobile
await login(p3, "hugo@echoppe.test", "demo-hugo");
await p3.waitForSelector("text=Poser une demande");
await p3.waitForTimeout(500);
await p3.screenshot({ path: "/tmp/v2-hugo-coupure.png", fullPage: true });
console.log("captures ok");
await browser.close();
server.close();
