// Captures de vérification post-publication sur le site RÉEL (lecture seule).
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable" });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" })).newPage();
const BASE = "https://tibtibus.github.io/congeo-v2/";
try {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Sélectionnez votre nom", { timeout: 20000 });
  await page.screenshot({ path: "/downloads/05-live-accueil.png" });

  // Vue salarié : Chloé (ses demandes sont les plus suivies), onglet Mes horaires
  await page.click('[aria-label="Sélectionnez votre nom"]');
  await page.click('[role="option"]:has-text("Lhomme Chloé")');
  await page.waitForSelector("text=Mon calendrier", { timeout: 20000 });
  await page.click('role=tab[name="Mes horaires"]').catch(() => page.click('button:has-text("Mes horaires")'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/downloads/06-live-salarie-horaires.png" });

  // Admin : onglet Récupération — soldes « à renseigner »
  await page.goto(BASE + "#/admin", { waitUntil: "networkidle" });
  await page.waitForSelector("text=Le planning de l’équipe", { timeout: 20000 }).catch(() => {});
  await page.click('role=tab[name="Récupération"]').catch(() => page.click('button:has-text("Récupération")'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/downloads/07-live-admin-recuperation.png" });

  // Admin : Demandes — Benjamin 02/01 et Gaspard 28/12→02/01 importés en attente
  await page.click('role=tab[name^="Demandes"]').catch(() => page.click('button:has-text("Demandes")'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/downloads/08-live-admin-demandes.png" });
  console.log("captures live OK");
} finally {
  await browser.close();
}
