// Tests UI reels (navigateur headless) sur le build dist/.
// Couvre : demande salarie, validation + deduction unique, blocage solde
// insuffisant, refus, sauvegarde de gabarit.
import { chromium } from "playwright-core";
import { spawn } from "child_process";

const PORT = 5197;
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: "dist", stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
let failures = 0;
const check = (name, cond) => { console.log((cond ? "  ok " : "KO  ") + name); if (!cond) failures++; };

async function go(page, hash) {
  await page.goto("about:blank");
  await page.goto(BASE + "/" + hash);
  await page.waitForSelector(".topbar");
}
async function fresh(page, hash) {
  await go(page, "");
  await page.evaluate(() => localStorage.clear());
  await go(page, hash);
}
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("congeo-v2-data-v3")));

try {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 900 }, locale: "fr-FR" })).newPage();

  // 1) Le salarie depose une recuperation
  await fresh(page, "#/emp/hugo");
  await page.selectOption(".formrow select", { label: "Journée de récupération" });
  await page.fill('input[type="date"]', "2027-03-13");
  await page.click("text=Envoyer la demande");
  await page.waitForSelector("text=Récupération · 13 mars");
  check("demande recuperation visible chez le salarie", await page.locator("text=Récupération · 13 mars").count() === 1);
  check("statut en attente affiche", await page.locator(".st.pending").count() >= 2); // + celle seedee du 12 mars

  // 2) Le salarie depose des conges
  await fresh(page, "#/emp/ines");
  await page.fill('input[type="date"] >> nth=0', "2027-05-03");
  await page.fill('input[type="date"] >> nth=1', "2027-05-08");
  await page.click("text=Envoyer la demande");
  await page.waitForSelector("text=du 3 mai au 8 mai");
  check("demande de conges visible chez le salarie", true);

  // 3) Admin valide la recuperation d'Hugo (12 mars, 8h30) : deduction unique
  await go(page, "#/admin/demandes");
  await page.waitForSelector("text=Demandes en attente");
  const hugoRow = page.locator(".card", { hasText: "Hugo B. · Récupération · 12 mars" });
  check("ligne recuperation Hugo en attente", await hugoRow.count() === 1);
  check("heures prevues affichees avant validation", (await hugoRow.textContent()).includes("8 h 30 prévues"));
  await hugoRow.locator("text=Valider").click();
  await page.waitForSelector("text=8 h 30 décomptées");
  let s = await store(page);
  const hugoLedger = s.recoveryLedger.filter((l) => l.employeeId === "hugo" && l.deltaMin < 0);
  check("deduction unique de 8h30 au ledger", hugoLedger.length === 1 && hugoLedger[0].deltaMin === -510);
  check("demande marquee validee avec deduction", s.requests.find((r) => r.id === "r2").status === "approved" && s.requests.find((r) => r.id === "r2").deductedMin === 510);

  // 4) Le solde affiche passe a 5 h 30 sur le planning admin
  await go(page, "#/admin/planning");
  await page.waitForSelector("text=Heures à récupérer");
  check("puce Hugo a 5 h 30 apres deduction", (await page.locator(".chip", { hasText: "Hugo B." }).textContent()).includes("5 h 30"));

  // 5) Recuperation au-dela du solde : validation bloquee
  await go(page, "#/emp/emma"); // Emma : solde 0 h
  await page.selectOption(".formrow select", { label: "Journée de récupération" });
  await page.fill('input[type="date"]', "2027-03-08");
  await page.click("text=Envoyer la demande");
  await page.waitForSelector("text=Récupération · 8 mars");
  await go(page, "#/admin/demandes");
  await page.waitForSelector("text=Demandes en attente");
  const emmaRow = page.locator(".card", { hasText: "Emma R. · Récupération · 8 mars" });
  check("message de blocage solde insuffisant", (await emmaRow.textContent()).includes("Solde insuffisant"));
  check("bouton Valider desactive", await emmaRow.locator("text=Valider").isDisabled());
  s = await store(page);
  check("aucune deduction apres blocage", s.recoveryLedger.filter((l) => l.employeeId === "emma").every((l) => l.deltaMin >= 0));

  // 6) Refus d'une demande de conges
  const tomRow = page.locator(".card", { hasText: "Tom D. · Congés" });
  await tomRow.locator("text=Refuser").click();
  await page.waitForSelector(".st.rejected");
  s = await store(page);
  check("demande de conges refusee", s.requests.find((r) => r.id === "r3").status === "rejected");

  // 7) Sauvegarde de gabarit : decocher lundi (semaine paire) de Hugo
  await go(page, "#/admin/gabarits");
  await page.waitForSelector("text=HORAIRES HABITUELS");
  await page.selectOption("select >> nth=1", { label: "Hugo B." });
  await page.waitForSelector("text=— Hugo B.");
  const pairePanel = page.locator(".card", { hasText: "Semaine paire" }).first();
  await pairePanel.locator(".tplrow").first().locator('input[type="checkbox"]').first().click();
  await page.click("text=Enregistrer les gabarits");
  await page.waitForSelector("text=Gabarits enregistrés ✓");
  s = await store(page);
  check("gabarit paire de Hugo : lundi decoche et persiste", s.templates.hugo.paire[0].worked === false);
  await page.reload();
  await page.waitForSelector("text=HORAIRES HABITUELS");
  await page.selectOption("select >> nth=1", { label: "Hugo B." });
  check("gabarit persistant apres rechargement", !(await page.locator(".card", { hasText: "Semaine paire" }).first().locator(".tplrow").first().locator('input[type="checkbox"]').first().isChecked()));

  // 8) Export : bouton genere un telechargement .xlsx
  await go(page, "#/admin/export");
  await page.waitForSelector("text=VUE ANNUELLE");
  check("reperes vacances dans l'apercu", (await page.locator("text=Hiver · 20 févr. - 7 mars").count()) === 1 && (await page.locator("text=Été · 3 juil. - 1 sept.").count()) === 1);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("text=Exporter en Excel (.xlsx)"),
  ]);
  check("telechargement .xlsx", download.suggestedFilename() === "congeo-conges-2027.xlsx");
  const path = await download.path();
  const buf = (await import("fs")).statSync(path).size;
  check("fichier .xlsx non vide", buf > 5000);

  // 9) Gabarits desktop en locale en-US (pire cas 12 h "08:00 AM") : aucun champ heure tronque
  {
    const dpage = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" })).newPage();
    await go(dpage, "#/admin/gabarits");
    await dpage.waitForSelector("text=HORAIRES HABITUELS");
    const overflow = await dpage.evaluate(() => {
      const bad = [];
      document.querySelectorAll(".tplrow").forEach((row) => {
        const cr = row.closest(".card").getBoundingClientRect();
        row.querySelectorAll('input[type="time"]').forEach((inp) => {
          const r = inp.getBoundingClientRect();
          if (r.width < 90 || r.right > cr.right - 1) bad.push(Math.round(r.width));
        });
      });
      return bad;
    });
    check("champs heures gabarits lisibles en entier meme en locale 12 h", overflow.length === 0);
    await dpage.screenshot({ path: "/tmp/v2-admin-gabarits.png" });
  }
} catch (e) {
  console.error("ERREUR TESTS:", e.message);
  failures++;
}
await browser.close();
server.kill();
console.log(failures === 0 ? "TOUS LES TESTS UI PASSENT" : `${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
