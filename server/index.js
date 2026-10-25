// Serveur local authentifie de la V2 (test uniquement, aucun deploiement).
// - Sert l'app buildee (dist/) ET l'API sur le meme port.
// - Controle des roles COTE SERVEUR : un salarie ne recoit que ses donnees.
// - Validation de recuperation atomique et idempotente (section critique synchrone).
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, normalize } from "path";
import { openDb } from "./db.js";
import { createPgStore } from "./db-pg.js";
import { verifyPassword, newToken } from "./auth.js";
import { getWeekPlan } from "../src/domain/planning.js";
import { checkRecoveryValidation } from "../src/domain/requests.js";
import { isoWeek, isoWeeksInYear, parseISO } from "../src/domain/dates.js";
import { requestDates } from "../src/domain/requests.js";

const pub = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, employeeId: u.employeeId });

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

// Donnees de demarrage, deja filtrees selon le role : un salarie ne RECOIT que les siennes.
function bootstrap(db, me) {
  if (me.role === "admin") {
    const { users, sessions, ...rest } = db;
    return { me: pub(me), ...rest };
  }
  const empId = me.employeeId;
  return {
    me: pub(me),
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
  const authUser = async (req) => {
    const t = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    return { token: t, user: t ? await store.getSessionUser(t) : null };
  };

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

    if (p === "/api/login" && req.method === "POST") {
      const u = await store.findUserByEmail(String(body.email || "").toLowerCase());
      if (!u || !verifyPassword(String(body.password || ""), u.passwordHash)) return json(res, 401, { error: "Identifiants incorrects" });
      const token = newToken();
      await store.createSession(token, u.id);
      return json(res, 200, { token, user: pub(u) });
    }

    const { token, user: me } = await authUser(req);
    if (!me) return json(res, 401, { error: "Authentification requise" });

    if (p === "/api/logout" && req.method === "POST") {
      await store.deleteSession(token);
      return json(res, 200, { ok: true });
    }
    if (p === "/api/me" && req.method === "GET") return json(res, 200, { user: pub(me) });
    if (p === "/api/bootstrap" && req.method === "GET") return json(res, 200, bootstrap(await store.getDoc(), me));

    if (p === "/api/employees" && req.method === "GET") {
      const all = (await store.getDoc()).employees;
      return json(res, 200, { employees: me.role === "admin" ? all : all.filter((e) => e.id === me.employeeId) });
    }

    if ((m = p.match(/^\/api\/planning\/([\w-]+)$/)) && req.method === "GET") {
      const empId = m[1];
      if (me.role !== "admin" && me.employeeId !== empId) return json(res, 403, { error: "Un salarié ne voit que son propre planning" });
      const year = Number(url.searchParams.get("year")), week = Number(url.searchParams.get("week"));
      if (!Number.isInteger(year) || !Number.isInteger(week)) return json(res, 400, { error: "Paramètres year/week requis" });
      const db = await store.getDoc();
      if (!db.employees.some((e) => e.id === empId)) return json(res, 404, { error: "Salarié introuvable" });
      return json(res, 200, { days: getWeekPlan(db.templates, db.overrides, empId, year, week) });
    }

    if ((m = p.match(/^\/api\/templates\/([\w-]+)$/)) && req.method === "PUT") {
      if (me.role !== "admin") return json(res, 403, { error: "Gabarits réservés à l'admin" });
      const db = await store.getDoc();
      if (!db.employees.some((e) => e.id === m[1])) return json(res, 404, { error: "Salarié introuvable" });
      const tpl = cleanTemplate(body);
      if (!tpl) return json(res, 400, { error: "Gabarit invalide (7 jours par parité, horaires HH:MM cohérents)" });
      await store.putTemplate(m[1], tpl);
      return json(res, 200, { template: tpl });
    }

    if ((m = p.match(/^\/api\/overrides\/([\w-]+)\/(\d{4}-\d{2}-\d{2})$/))) {
      if (me.role !== "admin") return json(res, 403, { error: "Ajustements réservés à l'admin" });
      const [, empId, day] = m;
      const db = await store.getDoc();
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
      if (me.role !== "admin") return json(res, 403, { error: "Saisie d'heures réservée à l'admin" });
      const db = await store.getDoc();
      if (!db.employees.some((e) => e.id === body.employeeId)) return json(res, 404, { error: "Salarié introuvable" });
      const delta = Math.round(Number(body.deltaMin));
      if (!Number.isInteger(delta) || delta <= 0) return json(res, 400, { error: "deltaMin entier positif requis" });
      const entry = { id: "l" + Date.now(), employeeId: body.employeeId, deltaMin: delta, reason: String(body.reason || "Heures supplémentaires"), at: new Date().toISOString() };
      await store.addRecovery(entry);
      return json(res, 201, { entry });
    }

    if (p === "/api/requests" && req.method === "GET") {
      const all = (await store.getDoc()).requests;
      return json(res, 200, { requests: me.role === "admin" ? all : all.filter((r) => r.employeeId === me.employeeId) });
    }

    if (p === "/api/requests" && req.method === "POST") {
      if (!me.employeeId) return json(res, 403, { error: "Ce compte n'est pas rattaché à une fiche salarié" });
      // employeeId impose cote serveur : un client ne peut pas deposer pour un autre.
      let r;
      if (body.type === "leave") {
        if (!ISODATE.test(body.dateStart || "") || !ISODATE.test(body.dateEnd || "")) return json(res, 400, { error: "dateStart/dateEnd requis" });
        r = { employeeId: me.employeeId, type: "leave", dateStart: body.dateStart, dateEnd: body.dateEnd };
      } else if (body.type === "recovery") {
        if (!Array.isArray(body.dates) || body.dates.length === 0 || !body.dates.every((d) => ISODATE.test(d))) return json(res, 400, { error: "dates requises" });
        r = { employeeId: me.employeeId, type: "recovery", dates: body.dates.slice(0, 30) };
      } else return json(res, 400, { error: "type leave|recovery requis" });
      r.id = "r" + Date.now(); r.status = "pending"; r.createdAt = new Date().toISOString();
      await store.createRequest(r);
      return json(res, 201, { request: r });
    }

    if ((m = p.match(/^\/api\/requests\/([\w-]+)\/validate$/)) && req.method === "POST") {
      if (me.role !== "admin") return json(res, 403, { error: "Validation réservée à l'admin" });
      // Atomique et idempotent dans le store (section critique synchrone en JSON,
      // transaction SQL avec verrou de ligne en Postgres).
      const out = await store.validateRequest(m[1]);
      return json(res, out[0], out[1]);
    }

    if ((m = p.match(/^\/api\/requests\/([\w-]+)\/reject$/)) && req.method === "POST") {
      if (me.role !== "admin") return json(res, 403, { error: "Refus réservé à l'admin" });
      const out = await store.rejectRequest(m[1]);
      return json(res, out[0], out[1]);
    }

    if ((m = p.match(/^\/api\/recovery\/([\w-]+)$/)) && req.method === "GET") {
      const empId = m[1];
      if (me.role !== "admin" && me.employeeId !== empId) return json(res, 403, { error: "Un salarié ne voit que son propre solde" });
      const db = await store.getDoc();
      return json(res, 200, { balanceMin: db.recoveryLedger.filter((l) => l.employeeId === empId).reduce((sum, l) => sum + l.deltaMin, 0) });
    }

    if (p === "/api/export" && req.method === "GET") {
      if (me.role !== "admin") return json(res, 403, { error: "Export réservé à l'admin" });
      const year = Number(url.searchParams.get("year"));
      if (!Number.isInteger(year)) return json(res, 400, { error: "Paramètre year requis" });
      const db = await store.getDoc();
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
  createApp(store, dist).listen(port, () => console.log(`Congéo V2 (authentifié) : http://127.0.0.1:${port} — stockage : ${label}`));
}
if (import.meta.url === `file://${process.argv[1]}`) main();
