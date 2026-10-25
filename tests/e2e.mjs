// Tests BOUT EN BOUT de la version intégrée : app buildée servie par le serveur,
// accès SANS connexion (modèle V1) : le salarié choisit son nom, l'admin est à
// l'adresse séparée #/admin. Workflows métier réels : demande, validation avec
// décompte atomique, blocage solde insuffisant, saisie d'heures, gabarits.
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
const safeGoto = async (url) => { for (let i = 0; i < 3; i++) { try { await page.goto(url); return; } catch (e) { if (i === 2 || !String(e).includes("ERR_ABORTED")) throw e; await page.waitForTimeout(300); } } };
const pickName = async (name) => { // choix du nom, comme l'accueil de la V1
  await safeGoto(BASE + "/");
  await page.evaluate(() => localStorage.clear());
  await safeGoto(BASE + "/");
  await page.waitForSelector("text=Qui es-tu ?");
  await page.click(`button:has-text("${name}")`);
};
const goAdmin = async () => { // adresse admin séparée (non liée depuis l'espace salarié)
  await page.evaluate(() => localStorage.clear());
  await safeGoto(BASE + "/#/admin");
  await page.waitForSelector("text=PLANNING · L'ÉCHOPPE");
};

try {
  // 1) Porte d'entrée : sélection du nom (pas de connexion), vue salarié
  await safeGoto(BASE + "/");
  await page.waitForSelector("text=Qui es-tu ?");
  check("accueil = choix du nom, aucun champ de connexion", (await page.locator('input[type="password"]').count()) === 0);
  await page.click('button:has-text("Hugo B.")');
  await page.waitForSelector("text=Poser une demande");
  check("vue salarié après choix du nom", true);
  check("deux plages séparées par la coupure visibles au planning", (await page.locator("text=08h00 – 12h00 / 13h00 – 17h00").count()) > 0);
  check("pas d'onglets admin pour un salarié", (await page.locator("text=Semaines paire/impaire").count()) === 0);
  check("aucun lien vers l'adresse admin depuis l'espace salarié", (await page.locator('a[href*="#/admin"], a[href*="admin"]').count()) === 0);

  // 2) Hugo dépose une récupération (9 mars 2027, 8 h 30 prévues)
  await page.selectOption(".formrow select", { label: "Journée de récupération" });
  await page.fill('input[type="date"]', "2027-03-09");
  await page.click("text=Envoyer la demande");
  await page.waitForSelector("text=9 mars");
  check("demande de récupération déposée après choix du nom", true);

  // 3) Changer de nom → retour au sélecteur
  await page.click("text=Changer de nom");
  await page.waitForSelector("text=Qui es-tu ?");
  check("changement de nom effectif", true);

  // 4) Adresse admin séparée : la demande de Hugo est là, validation déduit 8 h 30
  await goAdmin();
  check("adresse admin séparée : planning équipe affiché", true);
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

  // 5) Persistance : rechargement, solde conservé
  await page.reload();
  await page.waitForSelector("text=Heures à récupérer");
  check("solde persisté côté serveur", (await page.locator(".chip", { hasText: "Hugo B." }).first().textContent()).includes("5 h 30"));

  // 6) Blocage solde insuffisant : Emma (0 h) dépose, admin bloqué
  await pickName("Emma R.");
  await page.waitForSelector("text=Poser une demande");
  await page.selectOption(".formrow select", { label: "Journée de récupération" });
  await page.fill('input[type="date"]', "2027-03-15"); // lundi S11 impaire : 8 h prévues
  await page.click("text=Envoyer la demande");
  await page.waitForSelector("text=15 mars");
  await goAdmin();
  await page.click(".tab >> text=Demandes");
  const emmaRow = page.locator(".card", { hasText: "15 mars" }).first();
  check("validation bloquée si solde insuffisant (bouton désactivé)", await emmaRow.locator("text=Valider").isDisabled());
  check("message de blocage explicite", (await emmaRow.textContent()).includes("Solde insuffisant"));

  // 7) Saisie admin de 8 h pour Emma, puis validation possible
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

  // 8) Gabarits admin : modification persistée après rechargement
  await page.click(".tab >> text=Semaines paire/impaire");
  await page.waitForSelector("text=HORAIRES HABITUELS");
  await page.selectOption("select", { label: "Hugo B." });
  const paire = page.locator(".card", { hasText: "Semaine paire" }).first();
  await paire.locator(".tplrow").first().locator('input[type="checkbox"]').first().click();
  await page.click("text=Enregistrer les gabarits");
  await page.waitForSelector("text=Gabarits enregistrés ✓");
  await page.reload();
  await page.waitForSelector("text=PLANNING · L'ÉCHOPPE");
  await page.click(".tab >> text=Semaines paire/impaire");
  await page.waitForSelector("text=HORAIRES HABITUELS");
  await page.selectOption("select", { label: "Hugo B." });
  check("gabarit modifié persisté côté serveur", !(await page.locator(".card", { hasText: "Semaine paire" }).first().locator(".tplrow").first().locator('input[type="checkbox"]').first().isChecked()));

  // 9) Choix du nom persisté dans le navigateur après rechargement (comme la V1)
  await pickName("Léa M.");
  await page.waitForSelector("text=Poser une demande");
  await page.reload();
  await page.waitForSelector("text=Poser une demande");
  check("nom conservé après rechargement (pas de re-sélection)", (await page.locator(".topbar").textContent()).includes("Léa M."));
} catch (e) {
  console.error("ERREUR E2E:", e.message);
  try { await page.screenshot({ path: "/tmp/e2e-fail.png" }); console.error("capture: /tmp/e2e-fail.png"); console.error("PAGE:", (await page.locator("body").textContent()).replace(/\s+/g, " ").slice(0, 400)); } catch {}
  failures++;
}
await browser.close();
server.close();
console.log(failures === 0 ? "TOUS LES TESTS E2E PASSENT" : `${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
