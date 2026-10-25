// Persistance JSON locale du serveur de test (mode par défaut, zéro service).
// mutate() est une SECTION CRITIQUE SYNCHRONE : lire-verifier-ecrire sans await,
// donc atomique dans le processus Node (single-thread).
// Meme interface que server/db-pg.js (methodes async) : le routeur index.js
// ne sait pas quel stockage est derriere. En production : base Postgres
// dédiée (DATABASE_URL), ou validateRequest devient une vraie transaction SQL.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { seedDb } from "./seed.js";
import { checkRecoveryValidation } from "../src/domain/requests.js";

const balance = (db, empId) => db.recoveryLedger.filter((l) => l.employeeId === empId).reduce((s, l) => s + l.deltaMin, 0);

export function openDb(path) {
  let db;
  const persist = () => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(db, null, 2)); };
  // Version de schéma/données : une base ancienne est régénérée depuis le seed
  // (v3 = comptes/sessions retirés, accès sans connexion comme la V1, 25 oct 12h57).
  const SEED_VERSION = 3;
  if (existsSync(path)) db = JSON.parse(readFileSync(path, "utf8"));
  const withDefaults = (d) => { if (d) { d.blocks = d.blocks || []; d.settings = d.settings || {}; } return d; };
  db = withDefaults(db);
  if (!db || db.seedVersion !== SEED_VERSION) { db = { ...seedDb(), seedVersion: SEED_VERSION }; persist(); }
  const mutate = (fn) => { const r = fn(db); persist(); return r; };
  return {
    async transact(fn){const next=structuredClone(db);const result=fn(next);if(result?.then)throw Error('Local transactions must be synchronous.');db=next;persist();return result;},
    // Document complet (petit volume : boutique de 5 salariés)
    getDoc: async () => db,
    // --- mutations métier ---
    putTemplate: async (empId, tpl) => mutate((d) => { d.templates = { ...d.templates, [empId]: tpl }; }),
    putOverride: async (empId, day, d2) => mutate((d) => { d.overrides = { ...d.overrides, [`${empId}|${day}`]: d2 }; }),
    deleteOverride: async (empId, day) => mutate((d) => { const o = { ...d.overrides }; delete o[`${empId}|${day}`]; d.overrides = o; }),
    addRecovery: async (entry) => mutate((d) => { d.recoveryLedger = [...d.recoveryLedger, entry]; }),
    createRequest: async (r) => mutate((d) => { d.requests.push(r); }),
    // Validation atomique et idempotente : relecture + règle métier + écritures liées.
    validateRequest: async (id) => mutate((d) => {
      const r = d.requests.find((x) => x.id === id);
      if (!r) return [404, { error: "Demande introuvable" }];
      if (r.status === "approved") return [200, { request: r, idempotent: true }];
      if (r.status !== "pending") return [409, { error: "Demande déjà refusée" }];
      if (r.type === "recovery") {
        const chk = checkRecoveryValidation(r, d.templates, d.overrides, balance(d, r.employeeId));
        if (!chk.ok) return [409, { error: chk.reason }];
        r.status = "approved"; r.deductedMin = chk.deductMinutes;
        if (chk.deductMinutes > 0) d.recoveryLedger.push({ id: "l" + Date.now(), employeeId: r.employeeId, deltaMin: -chk.deductMinutes, reason: "Récupération validée", at: new Date().toISOString() });
      } else r.status = "approved";
      return [200, { request: r }];
    }),
    rejectRequest: async (id) => mutate((d) => {
      const r = d.requests.find((x) => x.id === id);
      if (!r) return [404, { error: "Demande introuvable" }];
      if (r.status !== "pending") return [409, { error: "Demande déjà tranchée" }];
      r.status = "rejected"; r.decidedAt = new Date().toISOString();
      return [200, { request: r }];
    }),
    close: async () => {},
  };
}
