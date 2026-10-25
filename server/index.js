// Serveur local de la V2 (test uniquement, aucun deploiement).
// - Sert l'app buildee (dist/) ET l'API sur le meme port.
// - ACCES COMME LA V1 (decision utilisateur 25/10/2026 12h57) : pas de connexion.
//   Le salarie choisit son nom dans l'app (memorise dans SON navigateur) ; l'admin
//   utilise une adresse separee (#/admin), sans lien depuis l'espace salarie.
//   L'identite est DECLAREE par le client (?employee= / ?as=admin) : meme niveau
//   de confiance que la V1, a documenter honnetement (URL admin a ne pas partager).
// - Validation de recuperation atomique et idempotente (section critique JSON,
//   transaction SQL avec verrou de ligne en Postgres).
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, normalize } from "path";
import { openDb } from "./db.js";
import { createPgStore } from "./db-pg.js";
import { getWeekPlan } from "../src/domain/planning.js";
import { isoWeek, isoWeeksInYear, parseISO } from "../src/domain/dates.js";
import { requestDates } from "../src/domain/requests.js";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISODATE = /^\d{4}-\d{2}-\d{2}$/;
// Normalise et valide un jour de planning ; null si invalide.
function cleanDay(d) {
  if (!d || typeof d !== "object") return null;
  if (!d.worked) return { worked: false, start: null, end: null, pauseStart: null, pauseEnd: null, open: false, close: false };
  if (!HHMM.test(d.start || "") || !HHMM.test(d.end || "") || d.end <= d.start) return null;
  const pauseStart = d.pauseStart && HHMM.test(d.pauseStart) ? d.pauseStart : null;
  const pauseEnd = d.pauseEnd && HHMM.test(d.pauseEnd) ? d.pauseEnd : null;
  if (!pauseStart !== !pauseEnd) return null; // les deux ou aucun
  if (pauseStart && pauseEnd <= pauseStart) return null;
  return { worked: true, start: d.start, end: d.end, pauseStart, pauseEnd, open: !!d.open, close: !!d.close };
}
function cleanTemplate(t) {
  if (!t || !Array.isArray(t.paire) || !Array.isArray(t.impaire) || t.paire.length !== 7 || t.impaire.length !== 7) return null;
  const paire = t.paire.map(cleanDay), impaire = t.impaire.map(cleanDay);
  return paire.some((d) => !d) || impaire.some((d) => !d) ? null : { paire, impaire };
}

// Donnees filtrees pour un salarie declare : il ne RECOIT que les siennes
// (meme filtrage que la V1 cote donnees, sans authentification).
function bootstrapFor(db, empId) {
  return {
    employeeId: empId,
    employees: db.employees.filter((e) => e.id === empId),
    templates: { [empId]: db.templates[empId] },
    overrides: Object.fromEntries(Object.entries(db.overrides).filter(([k]) => k.startsWith(empId + "|"))),
    requests: db.requests.filter((r) => r.employeeId === empId),
    recoveryLedger: db.recoveryLedger.filter((l) => l.employeeId === empId),
  };
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon", ".json": "application/json", ".map": "application/json" };

// storeOrPath : un store (interface async de db.js / db-pg.js) ou un chemin JSON.
export function createApp(storeOrPath, distDir) {
  const store = typeof storeOrPath === "string" ? openDb(storeOrPath) : storeOrPath;
  const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
  const readBody = (req) => new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } }); });

  return createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    let m;

    if (!p.startsWith("/api/")) { // fichiers statiques de l'app buildee
      if (!distDir) return json(res, 404, { error: "App non buildee (npm run build)" });
      let fp = join(distDir, normalize(p === "/" ? "/index.html" : p));
      if (!fp.startsWith(distDir) || !existsSync(fp)) fp = join(distDir, "index.html");
      res.writeHead(200, { "content-type": MIME[extname(fp)] || "application/octet-stream" });
      return res.end(readFileSync(fp));
    }

    const body = req.method === "POST" || req.method === "PUT" ? await readBody(req) : {};
    const db = await store.getDoc();

    if (p === "/api/employees" && req.method === "GET") {
      // Liste des prenoms pour le selecteur de nom (comme l'ecran d'accueil V1).
      return json(res, 200, { employees: db.employees.map((e) => ({ id: e.id, name: e.name })) });
    }

    if (p === "/api/bootstrap" && req.method === "GET") {
      const empId = url.searchParams.get("employee");
      if (url.searchParams.get("as") === "admin") return json(res, 200, { admin: true, ...db });
      if (empId && db.employees.some((e) => e.id === empId)) return json(res, 200, bootstrapFor(db, empId));
      return json(res, 400, { error: "Paramètre employee=<id> ou as=admin requis" });
    }

    if ((m = p.match(/^\/api\/planning\/([\w-]+)$/)) && req.method === "GET") {
      const empId = m[1];
      const year = Number(url.searchParams.get("year")), week = Number(url.searchParams.get("week"));
      if (!Number.isInteger(year) || !Number.isInteger(week)) return json(res, 400, { error: "Paramètres year/week requis" });
      if (!db.employees.some((e) => e.id === empId)) return json(res, 404, { error: "Salarié introuvable" });
      return json(res, 200, { days: getWeekPlan(db.templates, db.overrides, empId, year, week) });
    }

    // --- Actions de gestion (utilisees par l'adresse admin separee, comme en V1) ---

    if ((m = p.match(/^\/api\/templates\/([\w-]+)$/)) && req.method === "PUT") {
      if (!db.employees.some((e) => e.id === m[1])) return json(res, 404, { error: "Salarié introuvable" });
      const tpl = cleanTemplate(body);
      if (!tpl) return json(res, 400, { error: "Gabarit invalide (7 jours par parité, horaires HH:MM cohérents)" });
      await store.putTemplate(m[1], tpl);
      return json(res, 200, { template: tpl });
    }

    if ((m = p.match(/^\/api\/overrides\/([\w-]+)\/(\d{4}-\d{2}-\d{2})$/))) {
      const [, empId, day] = m;
      if (!db.employees.some((e) => e.id === empId)) return json(res, 404, { error: "Salarié introuvable" });
      if (!ISODATE.test(day)) return json(res, 400, { error: "Date invalide" });
      if (req.method === "PUT") {
        const d2 = cleanDay(body);
        if (!d2) return json(res, 400, { error: "Journée invalide" });
        await store.putOverride(empId, day, d2);
        return json(res, 200, { day: d2 });
      }
      if (req.method === "DELETE") {
        await store.deleteOverride(empId, day);
        return json(res, 200, { ok: true });
      }
    }

    if (p === "/api/recovery" && req.method === "POST") {
      if (!db.employees.some((e) => e.id === body.employeeId)) return json(res, 404, { error: "Salarié introuvable" });
      const delta = Math.round(Number(body.deltaMin));
      if (!Number.isInteger(delta) || delta <= 0) return json(res, 400, { error: "deltaMin entier positif requis" });
      const entry = { id: "l" + Date.now(), employeeId: body.employeeId, deltaMin: delta, reason: String(body.reason || "Heures supplémentaires"), at: new Date().toISOString() };
      await store.addRecovery(entry);
      return json(res, 201, { entry });
    }

    if (p === "/api/requests" && req.method === "GET") {
      const empId = url.searchParams.get("employee");
      return json(res, 200, { requests: empId ? db.requests.filter((r) => r.employeeId === empId) : db.requests });
    }

    if (p === "/api/requests" && req.method === "POST") {
      // Identite declaree par le client (comme l'onglet partage de la V1).
      const empId = String(body.employeeId || "");
      if (!db.employees.some((e) => e.id === empId)) return json(res, 400, { error: "employeeId inconnu" });
      let r;
      if (body.type === "leave") {
        if (!ISODATE.test(body.dateStart || "") || !ISODATE.test(body.dateEnd || "")) return json(res, 400, { error: "dateStart/dateEnd requis" });
        r = { employeeId: empId, type: "leave", dateStart: body.dateStart, dateEnd: body.dateEnd };
      } else if (body.type === "recovery") {
        if (!Array.isArray(body.dates) || body.dates.length === 0 || !body.dates.every((d) => ISODATE.test(d))) return json(res, 400, { error: "dates requises" });
        r = { employeeId: empId, type: "recovery", dates: body.dates.slice(0, 30) };
      } else return json(res, 400, { error: "type leave|recovery requis" });
      r.id = "r" + Date.now(); r.status = "pending"; r.createdAt = new Date().toISOString();
      await store.createRequest(r);
      return json(res, 201, { request: r });
    }

    if ((m = p.match(/^\/api\/requests\/([\w-]+)\/validate$/)) && req.method === "POST") {
      // Atomique et idempotent dans le store (section critique synchrone en JSON,
      // transaction SQL avec verrou de ligne en Postgres).
      const out = await store.validateRequest(m[1]);
      return json(res, out[0], out[1]);
    }

    if ((m = p.match(/^\/api\/requests\/([\w-]+)\/reject$/)) && req.method === "POST") {
      const out = await store.rejectRequest(m[1]);
      return json(res, out[0], out[1]);
    }

    if ((m = p.match(/^\/api\/recovery\/([\w-]+)$/)) && req.method === "GET") {
      const empId = m[1];
      return json(res, 200, { balanceMin: db.recoveryLedger.filter((l) => l.employeeId === empId).reduce((sum, l) => sum + l.deltaMin, 0) });
    }

    if (p === "/api/export" && req.method === "GET") {
      const year = Number(url.searchParams.get("year"));
      if (!Number.isInteger(year)) return json(res, 400, { error: "Paramètre year requis" });
      const leavesByEmployee = {};
      db.employees.forEach((e) => { leavesByEmployee[e.id] = []; });
      db.requests.filter((r) => r.type === "leave" && r.status === "approved").forEach((r) => {
        const weeks = new Set();
        requestDates(r).forEach((iso) => { const w = isoWeek(parseISO(iso)); if (w.year === year) weeks.add(w.week); });
        leavesByEmployee[r.employeeId] = [...weeks].sort((a, b) => a - b);
      });
      return json(res, 200, { year, weeks: isoWeeksInYear(year), leavesByEmployee });
    }

    return json(res, 404, { error: "Route inconnue" });
  });
}

async function main() {
  const port = Number(process.env.PORT || 4180);
  const dist = new URL("../dist", import.meta.url).pathname;
  let store, label;
  if (process.env.DATABASE_URL) { // base Postgres dédiée (ex. version de test en ligne)
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    store = await createPgStore(client, { seedIfEmpty: process.env.CONGEO_SEED_DEMO !== "0" });
    label = "Postgres (DATABASE_URL)";
  } else {
    const path = process.env.CONGEO_DB || new URL("./data/server-db.json", import.meta.url).pathname;
    store = openDb(path);
    label = `fichier ${path}`;
  }
  createApp(store, dist).listen(port, () => console.log(`Congéo V2 : http://127.0.0.1:${port} — stockage : ${label} — accès sans connexion (modèle V1), admin sur /#/admin`));
}
if (import.meta.url === `file://${process.argv[1]}`) main();
