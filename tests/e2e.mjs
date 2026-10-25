// Tests BOUT EN BOUT de la version intégrée : app buildee servie par le serveur
// authentifie, vraies sessions admin/salarie, droits appliques cote serveur.
import { chromium } from "playwright-core";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createApp } from "../server/index.js";

let failures = 0;
const check = (name, cond) => { console.log((cond ? "  ok " : "  KO ") + name); if (!cond) failures++; };

const dbPath = join(mkdtempSync(join(tmpdir(), "congeo-e2e-")), "db.json");
const server = createApp(dbPath, new URL("../dist", import.meta.url).pathname);
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
const page = await ctx.newPage();
const loginAs = async (email, pw) => {
  const safeGoto = async (url) => { for (let i = 0; i < 3; i++) { try { await page.goto(url); return; } catch (e) { if (i === 2 || !String(e).includes("ERR_ABORTED")) throw e; await page.waitForTimeout(300); } } };
  await safeGoto(BASE + "/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("about:blank");
  await safeGoto(BASE + "/");
  await page.waitForSelector("text=Connexion");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pw);
  await page.click("text=Se connecter");
};

try {
  // 1) Porte d'entrée : écran de connexion, mauvais mot de passe refusé
  await page.goto(BASE + "/");
  await page.waitForSelector("text=Connexion");
  await page.fill('input[type="email"]', "hugo@echoppe.test");
  await page.fill('input[type="password"]', "mauvais");
  await page.click("text=Se connecter");
  await page.waitForSelector("text=Identifiants incorrects");
  check("mauvais mot de passe refuse", true);

  // 2) Session salarié : Hugo ne voit que sa vue, aucune trace admin
  await loginAs("hugo@echoppe.test", "demo-hugo");
  await page.waitForSelector("text=Poser une demande");
  check("session salarié : vue salarié affichée", true);
  check("deux plages séparées par la coupure visibles au planning", (await page.locator("text=08h00 – 12h00 / 13h00 – 17h00").count()) > 0);
  check("pas d'onglets admin pour un salarié", (await page.locator("text=Semaines paire/impaire").count()) === 0);
  check("pas de sélecteur de vue en mode authentifié", (await page.locator(".topbar select").count()) === 0);
  await page.goto(BASE + "/#/admin/planning");
  await page.waitForTimeout(400);
  check("hash admin ignoré pour un salarié (vue salarié conservée)", (await page.locator("text=Poser une demande").count()) === 1 && (await page.locator("text=PLANNING · L'ÉCHOPPE").count()) === 0);

  // 3) Hugo dépose une récupération (19 mars 2027, 8 h 30 prévues)
  await page.selectOption(".formrow select", { label: "Journée de récupération" });
  await page.fill('input[type="date"]', "2027-03-09");
  await page.click("text=Envoyer la demande");
  await page.waitForSelector("text=9 mars");
  check("demande de récupération déposée via la session", true);

  // 4) Déconnexion → retour à l'écran de connexion
  await page.click("text=Déconnexion");
  await page.waitForSelector("text=Connexion");
  check("déconnexion effective", true);

  // 5) Session admin : la demande de Hugo est là, validation déduit 8 h 30
  await loginAs("admin@echoppe.test", "demo-admin");
  await page.waitForSelector("text=PLANNING · L'ÉCHOPPE");
  check("session admin : planning équipe affiché", true);
  check("horaires magasin + caractère indicatif visibles", (await page.locator("text=9h00 – 12h30 / 14h00 – 19h00").count()) > 0 && (await page.locator("text=coches indicatives").count()) > 0);
  await page.click(".tab >> text=Demandes");
  await page.waitForSelector("text=Demandes en attente");
  const row = page.locator(".card", { hasText: "9 mars" }).first();
  await row.locator("text=Valider").click();
  await page.waitForSelector("text=8 h 30 décomptées");
  check("validation admin : 8 h 30 décomptées affichées", true);
  await page.click(".tab >> text=Planning");
  await page.waitForSelector("text=Heures à récupérer");
  check("solde Hugo 14 h → 5 h 30 après validation", (await page.locator(".chip", { hasText: "Hugo B." }).first().textContent()).includes("5 h 30"));

  // 6) Persistance : rechargement, session conservée, solde conservé
  await page.reload();
  await page.waitForSelector("text=Heures à récupérer");
  check("session persiste après rechargement", (await page.locator(".topbar").textContent()).includes("Admin"));
  check("solde persisté côté serveur", (await page.locator(".chip", { hasText: "Hugo B." }).first().textContent()).includes("5 h 30"));

  // 7) Blocage solde insuffisant en session réelle : Emma (0 h) dépose, admin bloqué
  await page.click("text=Déconnexion");
  await loginAs("emma@echoppe.test", "demo-emma");
  await page.waitForSelector("text=Poser une demande");
  await page.selectOption(".formrow select", { label: "Journée de récupération" });
  await page.fill('input[type="date"]', "2027-03-15"); // lundi S11 impaire : 8 h prévues
  await page.click("text=Envoyer la demande");
  await page.waitForSelector("text=15 mars");
  await page.click("text=Déconnexion");
  await loginAs("admin@echoppe.test", "demo-admin");
  await page.waitForSelector("text=PLANNING · L'ÉCHOPPE");
  await page.click(".tab >> text=Demandes");
  const emmaRow = page.locator(".card", { hasText: "15 mars" }).first();
  check("validation bloquée si solde insuffisant (bouton désactivé)", await emmaRow.locator("text=Valider").isDisabled());
  check("message de blocage explicite", (await emmaRow.textContent()).includes("Solde insuffisant"));

  // 8) Saisie admin de 8 h pour Emma, puis validation possible
  await page.click(".tab >> text=Planning");
  await page.click("text=+ Saisir des heures à récupérer");
  await page.selectOption(".card select", { label: "Emma R." });
  await page.fill('input[placeholder="Heures"]', "8");
  await page.fill('input[placeholder^="Motif"]', "Inventaire de mars");
  await page.click("text=Enregistrer");
  await page.waitForSelector("text=8 h >> nth=0");
  check("saisie d'heures admin enregistrée", (await page.locator(".chip", { hasText: "Emma R." }).first().textContent()).includes("8 h"));
  await page.click(".tab >> text=Demandes");
  await emmaRow.locator("text=Valider").click();
  await page.waitForSelector("text=8 h décomptées");
  await page.click(".tab >> text=Planning");
  await page.waitForSelector("text=Heures à récupérer");
  check("solde Emma 8 h → 0 h après validation", /0 h(?! 30)/.test((await page.locator(".chip", { hasText: "Emma R." }).first().textContent())));

  // 9) Gabarits en session admin : modification persistée après rechargement
  await page.click(".tab >> text=Semaines paire/impaire");
  await page.waitForSelector("text=HORAIRES HABITUELS");
  await page.selectOption("select", { label: "Hugo B." });
  const paire = page.locator(".card", { hasText: "Semaine paire" }).first();
  await paire.locator(".tplrow").first().locator('input[type="checkbox"]').first().click();
  await page.click("text=Enregistrer les gabarits");
  await page.waitForSelector("text=Gabarits enregistrés ✓");
  await page.reload(); // rechargement : retour sur l'onglet Planning (hash vide), on repasse sur Gabarits
  await page.waitForSelector("text=PLANNING · L'ÉCHOPPE");
  await page.click(".tab >> text=Semaines paire/impaire");
  await page.waitForSelector("text=HORAIRES HABITUELS");
  await page.selectOption("select", { label: "Hugo B." });
  check("gabarit modifié persisté côté serveur", !(await page.locator(".card", { hasText: "Semaine paire" }).first().locator(".tplrow").first().locator('input[type="checkbox"]').first().isChecked()));
} catch (e) {
  console.error("ERREUR E2E:", e.message);
  try { await page.screenshot({ path: "/tmp/e2e-fail.png" }); console.error("capture: /tmp/e2e-fail.png"); console.error("PAGE:", (await page.locator("body").textContent()).replace(/\s+/g, " ").slice(0, 400)); } catch {}
  failures++;
}
await browser.close();
server.close();
console.log(failures === 0 ? "TOUS LES TESTS E2E PASSENT" : `${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
