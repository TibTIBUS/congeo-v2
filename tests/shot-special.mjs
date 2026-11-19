// Captures locales du lot « compteur férié/dimanche + période bloquée (option B) ».
// Données seed + actions admin/salarié via l'API locale, rien ne sort de la machine.
import { chromium } from "playwright-core";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createApp } from "../server/index.js";

const dbPath = join(mkdtempSync(join(tmpdir(), "congeo-shot-")), "db.json");
const server = createApp(dbPath, new URL("../dist", import.meta.url).pathname);
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const api = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
};

// État : Hugo a 2 jours au compteur férié/dimanche, pose 1 jour (validé : 2 -> 1),
// et un congé pendant un bloc « Inventaire » (signalé, en attente).
const emps = (await api("GET", "/api/employees")).employees;
const hugo = emps.find((e) => e.name.includes("Hugo"));
await api("POST", "/api/planning", { admin: true, action: "specialSetBalance", target: hugo.id, days: 2 });
await api("POST", "/api/planning", { admin: true, action: "settings", firstWeek: true, blocks: [{ label: "Inventaire", start: "2027-03-15", end: "2027-03-19" }] });
await api("POST", "/api/requests", { type: "recovery_other", dateStart: "2027-06-01", dateEnd: "2027-06-01", employeeId: hugo.id });
const plan = await api("GET", "/api/planning?admin=1");
const rec = plan.requests.find((r) => r.leave_type === "recovery_other" && r.employee_id === hugo.id && r.status === "pending");
await api("POST", "/api/planning", { admin: true, action: "approve", id: rec.id });
await api("POST", "/api/requests", { type: "leave", dateStart: "2027-03-16", dateEnd: "2027-03-17", employeeId: hugo.id });

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
const page = await ctx.newPage();
const safeGoto = async (url) => { for (let i = 0; i < 3; i++) { try { await page.goto(url); return; } catch (e) { if (i === 2 || !String(e).includes("ERR_ABORTED")) throw e; await page.waitForTimeout(300); } } };
const shot = (name) => page.screenshot({ path: "/downloads/" + name });

try {
  // 1) Salarié : compteur férié/dimanche dans « Mes horaires »
  await safeGoto(BASE + "/");
  await page.evaluate(() => localStorage.clear());
  await safeGoto(BASE + "/");
  await page.waitForSelector("text=Sélectionnez votre nom");
  await page.click('[aria-label="Sélectionnez votre nom"]');
  await page.click('[role="option"]:has-text("Hugo B.")');
  await page.waitForSelector("text=Mon calendrier");
  await page.click('role=tab[name="Mes horaires"]').catch(() => page.click('button:has-text("Mes horaires")'));
  await page.waitForSelector(".special-summary");
  await page.locator(".special-summary").scrollIntoViewIfNeeded();
  await shot("01-salarie-compteur-ferie.png");

  // 2) Salarié : formulaire « Autre récupération · férié/dimanche » = un seul jour
  await page.click('button:has-text("Demander un congé")');
  await page.waitForSelector(".absence-options");
  await page.click('.absence-option:has-text("Autre récupération")');
  await page.waitForSelector('text=Un jour entier');
  await page.fill('.date-fields input[type="date"]', "2027-06-08");
  await page.locator(".modal").screenshot({ path: "/downloads/02-formulaire-recuperation-ferie.png" });
  await page.click('button:has-text("Annuler")');

  // 3) Admin : tableau des compteurs férié/dimanche (onglet Récupération)
  await page.evaluate(() => localStorage.clear());
  await safeGoto(BASE + "/#/admin");
  await page.waitForSelector("text=ESPACE GÉRANTE");
  await page.click('.desktop-navigation button:has-text("Heures")');
  await page.click('role=tab[name="Récupération"]').catch(() => {});
  await page.waitForSelector(".special-overview");
  await page.locator(".special-overview").scrollIntoViewIfNeeded();
  await shot("03-admin-compteur-ferie.png");

  // 4) Admin : demande signalée « Période bloquée · décision de la gérante »
  await page.click('.desktop-navigation button:has-text("Congés")');
  await page.click('role=tab[name^="Demandes"]');
  await page.waitForSelector("text=Période bloquée · décision de la gérante");
  await page.locator(".requestcard", { hasText: "Période bloquée" }).first().scrollIntoViewIfNeeded();
  await shot("04-admin-periode-bloquee.png");

  console.log("captures OK");
} finally {
  await browser.close();
  server.close();
}
