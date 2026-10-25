// Serveur local de la V2 (test uniquement, aucun deploiement).
// - Sert l'app buildee (dist/) ET l'API sur le meme port.
// - ACCES COMME LA V1 (decision utilisateur 25/10/2026 12h57) : pas de connexion.
//   Le salarie choisit son nom dans l'app (memorise dans SON navigateur) ; l'admin
//   utilise une adresse separee (#/admin), sans lien depuis l'espace salarie.
//   L'identite est DECLAREE par le client (?employee= / ?as=admin) : meme niveau
//   de confiance que la V1, a documenter honnetement (URL admin a ne pas partager).
// - Validation de recuperation atomique et idempotente (section critique JSON,
//   transaction SQL avec verrou de ligne en Postgres).
import {validDate} from '../src/domain/calendarRules.js';
import {restoredApi} from "./restored.js";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, normalize } from "path";
import { openDb } from "./db.js";
import { createPgStore } from "./db-pg.js";
import { getWeekPlan } from "../src/domain/planning.js";
import { isoWeek, isoWeeksInYear, parseISO } from "../src/domain/dates.js";
import { requestDates, leaveDates } from "../src/domain/requests.js";
import { leaveBlockedReason } from "../src/domain/blocks.js";
import { applyDutyAssignments } from "../src/domain/duties.js";

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
  if (pauseStart && (pauseEnd <= pauseStart || pauseStart < d.start || pauseEnd > d.end)) return null;
  return { worked: true, start: d.start, end: d.end, pauseStart, pauseEnd, open: !!d.open, close: !!d.close };
}
function cleanTemplate(t) {
  if (!t || !Array.isArray(t.paire) || !Array.isArray(t.impaire) || t.paire.length !== 7 || t.impaire.length !== 7) return null;
  if(t.paire[6]?.worked||t.impaire[6]?.worked)return null;
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

// Cœur de routage API, partagé entre le serveur Node local (createApp) et
// l'adaptateur Neon Function (server/function.js). Retourne { code, obj }.
export async function handleApi(store, method, url, body) {
  const restored=await restoredApi(store,method,url,body);if(restored)return restored;
  const p = url.pathname;
  let m;

  if(p==='/api/duties'&&method==='PUT'){
    try{let updated=0;await store.transact(db=>{updated=applyDutyAssignments(db,body);});return {code:200,obj:{ok:true,updated}};}
    catch(e){return {code:400,obj:{error:e.message||'Impossible d’enregistrer les affectations.'}};}
  }

  const db = await store.getDoc();

  if (p === "/api/employees" && method === "GET") {
    // Liste des prenoms pour le selecteur de nom (comme l'ecran d'accueil V1).
    return { code: 200, obj: { employees: db.employees.map((e) => ({ id: e.id, name: e.name })) } };
  }

  if (p === "/api/bootstrap" && method === "GET") {
    const empId = url.searchParams.get("employee");
    if (url.searchParams.get("as") === "admin") return { code: 200, obj: { admin: true, ...db } };
    if (empId && db.employees.some((e) => e.id === empId)) return { code: 200, obj: bootstrapFor(db, empId) };
    return { code: 400, obj: { error: "Paramètre employee=<id> ou as=admin requis" } };
  }

  if ((m = p.match(/^\/api\/planning\/([\w-]+)$/)) && method === "GET") {
    const empId = m[1];
    const year = Number(url.searchParams.get("year")), week = Number(url.searchParams.get("week"));
    if (!Number.isInteger(year) || !Number.isInteger(week)) return { code: 400, obj: { error: "Paramètres year/week requis" } };
    if (!db.employees.some((e) => e.id === empId)) return { code: 404, obj: { error: "Salarié introuvable" } };
    return { code: 200, obj: { days: getWeekPlan(db.templates, db.overrides, empId, year, week) } };
  }

  // --- Actions de gestion (utilisees par l'adresse admin separee, comme en V1) ---

  if ((m = p.match(/^\/api\/templates\/([\w-]+)$/)) && method === "PUT") {
    if (!db.employees.some((e) => e.id === m[1])) return { code: 404, obj: { error: "Salarié introuvable" } };
    const tpl = cleanTemplate(body);
    if (!tpl) return { code: 400, obj: { error: "Gabarit invalide (7 jours par parité, horaires HH:MM cohérents)" } };
    try{
      await store.transact(current=>{
        if(body.original!==undefined){
          const emptyWeek=()=>Array.from({length:7},()=>({worked:false}));
          const currentTemplate=cleanTemplate(current.templates[m[1]]||{paire:emptyWeek(),impaire:emptyWeek()});
          const original=cleanTemplate(body.original);
          if(!original||JSON.stringify(original)!==JSON.stringify(currentTemplate))throw Error('Les horaires ou les affectations ont changé. Rechargez cette semaine type avant d’enregistrer.');
        }
        current.templates[m[1]]=tpl;
      });
      return { code: 200, obj: { template: tpl } };
    }catch(e){return {code:409,obj:{error:e.message||'Impossible d’enregistrer les horaires.'}};}
  }

  if ((m = p.match(/^\/api\/overrides\/([\w-]+)\/(\d{4}-\d{2}-\d{2})$/))) {
    const [, empId, day] = m;
    if (!db.employees.some((e) => e.id === empId)) return { code: 404, obj: { error: "Salarié introuvable" } };
    if (!validDate(day)) return { code: 400, obj: { error: "Date invalide" } };
    if (method === "PUT") {
      if(body?.worked&&parseISO(day).getDay()===0)return {code:400,obj:{error:"Le dimanche est un jour de fermeture."}};
      const d2 = cleanDay(body);
      if (!d2) return { code: 400, obj: { error: "Journée invalide" } };
      await store.putOverride(empId, day, d2);
      return { code: 200, obj: { day: d2 } };
    }
    if (method === "DELETE") {
      await store.deleteOverride(empId, day);
      return { code: 200, obj: { ok: true } };
    }
  }

  if (p === "/api/recovery" && method === "POST") {
    if (!db.employees.some((e) => e.id === body.employeeId)) return { code: 404, obj: { error: "Salarié introuvable" } };
    const delta = Math.round(Number(body.deltaMin));
    if (!Number.isInteger(delta) || delta <= 0) return { code: 400, obj: { error: "deltaMin entier positif requis" } };
    const entry = { id: "l" + Date.now(), employeeId: body.employeeId, deltaMin: delta, reason: String(body.reason || "Heures supplémentaires"), at: new Date().toISOString() };
    await store.addRecovery(entry);
    return { code: 201, obj: { entry } };
  }

  if (p === "/api/requests" && method === "GET") {
    const empId = url.searchParams.get("employee");
    return { code: 200, obj: { requests: empId ? db.requests.filter((r) => r.employeeId === empId) : db.requests } };
  }

  if (p === "/api/requests" && method === "POST") {
    // Identite declaree par le client (comme l'onglet partage de la V1).
    const empId = String(body.employeeId || "");
    if (!db.employees.some((e) => e.id === empId)) return { code: 400, obj: { error: "employeeId inconnu" } };
    let r;
    if (body.type === "leave") {
      if (!ISODATE.test(body.dateStart || "") || !ISODATE.test(body.dateEnd || "")) return { code: 400, obj: { error: "dateStart/dateEnd requis" } };
      if (body.dateEnd < body.dateStart) return { code: 400, obj: { error: "Choisissez une période valide." } };
      // Périodes bloquées (mêmes règles que la V1 : semaine n° 1 + périodes nommées, dimanches ignorés)
      const firstWeek = (db.settings || {}).firstWeek !== "false";
      const days = leaveDates({ dateStart: body.dateStart, dateEnd: body.dateEnd });
      const bad = days.find((d) => leaveBlockedReason(d, db.blocks, firstWeek));
      if (bad) return { code: 400, obj: { error: `${bad} : ${leaveBlockedReason(bad, db.blocks, firstWeek)}. Choisissez une autre période.` } };
      r = { employeeId: empId, type: "leave", dateStart: body.dateStart, dateEnd: body.dateEnd };
    } else if (body.type === "recovery") {
      if (!Array.isArray(body.dates) || body.dates.length === 0 || !body.dates.every((d) => ISODATE.test(d))) return { code: 400, obj: { error: "dates requises" } };
      r = { employeeId: empId, type: "recovery", dates: body.dates.slice(0, 30) };
    } else return { code: 400, obj: { error: "type leave|recovery requis" } };
    r.id = "r" + Date.now(); r.status = "pending"; r.createdAt = new Date().toISOString();
    await store.createRequest(r);
    return { code: 201, obj: { request: r } };
  }

  if ((m = p.match(/^\/api\/requests\/([\w-]+)\/validate$/)) && method === "POST") {
    // Atomique et idempotent dans le store (section critique synchrone en JSON,
    // transaction SQL avec verrou de ligne en Postgres).
    const [code, obj] = await store.validateRequest(m[1]);
    return { code, obj };
  }

  if ((m = p.match(/^\/api\/requests\/([\w-]+)\/reject$/)) && method === "POST") {
    const [codeR, objR] = await store.rejectRequest(m[1]);
    return { code: codeR, obj: objR };
  }

  if ((m = p.match(/^\/api\/recovery\/([\w-]+)$/)) && method === "GET") {
    const empId = m[1];
    return { code: 200, obj: { balanceMin: db.recoveryLedger.filter((l) => l.employeeId === empId).reduce((sum, l) => sum + l.deltaMin, 0) } };
  }

  if (p === "/api/export" && method === "GET") {
    const year = Number(url.searchParams.get("year"));
    if (!Number.isInteger(year)) return { code: 400, obj: { error: "Paramètre year requis" } };
    const leavesByEmployee = {};
    db.employees.forEach((e) => { leavesByEmployee[e.id] = []; });
    db.requests.filter((r) => r.type === "leave" && r.status === "approved").forEach((r) => {
      const weeks = new Set();
      requestDates(r).forEach((iso) => { const w = isoWeek(parseISO(iso)); if (w.year === year) weeks.add(w.week); });
      leavesByEmployee[r.employeeId] = [...new Set([...(leavesByEmployee[r.employeeId]||[]),...weeks])].sort((a,b)=>a-b);
    });
    return { code: 200, obj: { year, weeks: isoWeeksInYear(year), leavesByEmployee } };
  }

  return { code: 404, obj: { error: "Route inconnue" } };
}

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
    const out = await handleApi(store, req.method, url, body);
    return json(res, out.code, out.obj);
  });
}
