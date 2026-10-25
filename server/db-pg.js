// Stockage Postgres : base DÉDIÉE à la V2 (séparée de la V1), schéma schema.sql.
// Meme interface async que server/db.js (JSON local) : le routeur ne sait pas
// quel stockage est derriere. La validation de récupération est une vraie
// transaction SQL : verrou de ligne (SELECT … FOR UPDATE) + règle métier +
// écritures liées, idempotente. L'accès suit le modèle V1 (pas de connexion : nom choisi, admin à
// adresse séparée) ; le filtrage des données livrées reste fait par le routeur.
//
// Vérifié localement de deux façons, sans service externe ni déploiement :
// - pg-mem (émulation en processus) dans tests/pg.test.js ;
// - un vrai Postgres éphémère (embedded-postgres, binaire local) dans
//   tests/pg-real.test.js, avec un test de verrouillage concurrent réel.
import {persistChanges} from "./persist.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { seedDb } from "./seed.js";
import { checkRecoveryValidation } from "../src/domain/requests.js";

const iso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const hm = (v) => (v == null ? null : String(v).slice(0, 5));
const dayRow = (r) => ({ worked: r.worked, start: hm(r.start_time), end: hm(r.end_time), pauseStart: hm(r.pause_start), pauseEnd: hm(r.pause_end), open: r.is_open, close: r.is_close });
const reqFromRow = (r) => ({
  id: String(r.id), employeeId: r.employee_id, type: r.type,
  ...(r.date_start ? { dateStart: iso(r.date_start) } : {}),
  ...(r.date_end ? { dateEnd: iso(r.date_end) } : {}),
  ...(r.dates ? { dates: r.dates.map(iso) } : {}),
  details:r.details||{}, status: r.status, createdAt: r.created_at,
  ...(r.deducted_min != null ? { deductedMin: r.deducted_min } : {}),
  ...(r.decided_at ? { decidedAt: r.decided_at } : {}),
});
const ledgerFromRow = (l) => ({ id: String(l.id), employeeId: l.employee_id, deltaMin: l.delta_min, reason: l.reason, at: l.at, requestId:l.request_ref });

// client : client pg déjà connecté (vrai pg ou pg-mem). seedIfEmpty : injecte
// les données fictives si la base est vide (démo/test), à désactiver en réel.
export async function createPgStore(client, { seedIfEmpty = true, schemaSql = null, applySchema = true, schemaName="public" } = {}) {
  if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName))throw Error("Invalid schema name");
  const connection=client;
  client={query:(sql,args)=>connection.query(sql.replace(/(?<![\w.])(employees|templates|plan_overrides|requests|recovery_ledger|blocks|settings|outbox)\b/g,schemaName+'.$1'),args),end:()=>connection.end()};
  const q = async (text, values) => (await client.query(text, values)).rows;
  // schemaSql : texte injecté au bundling (Neon Function, pas de fs) ; sinon lecture fichier.
  if (applySchema) await client.query(schemaSql ?? readFileSync(fileURLToPath(new URL("../schema.sql", import.meta.url)), "utf8"));

  if (seedIfEmpty && (await q("SELECT COUNT(*)::int AS n FROM employees"))[0].n === 0) {
    const s = seedDb();
    for (const e of s.employees)
      await client.query("INSERT INTO employees (id,name,role,color) VALUES ($1,$2,$3,$4)", [e.id, e.name, e.role, e.color]);
    for (const [empId, t] of Object.entries(s.templates))
      for (const parity of ["paire", "impaire"])
        for (let wd = 0; wd < 7; wd++) {
          const d = t[parity][wd];
          await client.query(
            "INSERT INTO templates (employee_id,parity,weekday,worked,start_time,end_time,pause_start,pause_end,is_open,is_close) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
            [empId, parity, wd, !!d.worked, d.start||null, d.end||null, d.pauseStart||null, d.pauseEnd||null, !!d.open, !!d.close]);
        }
    for (const r of s.requests)
      await client.query(
        "INSERT INTO requests (employee_id,type,date_start,date_end,dates,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [r.employeeId, r.type, r.dateStart ?? null, r.dateEnd ?? null, r.dates ?? null, r.status, r.createdAt]);
    for (const l of s.recoveryLedger)
      await client.query("INSERT INTO recovery_ledger (employee_id,delta_min,reason,at) VALUES ($1,$2,$3,$4)", [l.employeeId, l.deltaMin, l.reason, l.at]);
  }

  const templatesOf = async (empId) => {
    const out = { paire: Array.from({length:7},()=>({worked:false})), impaire: Array.from({length:7},()=>({worked:false})) };
    for (const r of await q("SELECT * FROM templates WHERE employee_id=$1", [empId])) out[r.parity][r.weekday] = dayRow(r);
    return out;
  };
  const balanceOf = async (empId) =>
    Number((await q("SELECT COALESCE(SUM(delta_min),0) AS b FROM recovery_ledger WHERE employee_id=$1", [empId]))[0].b);

  const store = {
    async getDoc() {
      const employees = (await q("SELECT * FROM employees ORDER BY id")).map((e) => ({ id: e.id, name: e.name, role: e.role, color: e.color,active:e.active!==false,email:e.email||"",notify:!!e.notify }));
      const templates = {};
      for (const e of employees) templates[e.id] = await templatesOf(e.id);
      const overrides = {};
      for (const r of await q("SELECT * FROM plan_overrides")) overrides[`${r.employee_id}|${iso(r.day)}`] = dayRow(r);
      const requests = (await q("SELECT * FROM requests ORDER BY created_at")).map(reqFromRow);
      const recoveryLedger = (await q("SELECT * FROM recovery_ledger ORDER BY at")).map(ledgerFromRow);
      const blocks = (await q("SELECT * FROM blocks ORDER BY start_date")).map((b) => ({ id: b.id, label: b.label, start: b.start_date, end: b.end_date }));
      const settings = Object.fromEntries((await q("SELECT * FROM settings")).map((r) => [r.key, r.value]));
      const outbox=await q("SELECT * FROM outbox ORDER BY created DESC LIMIT 100");
      return { employees, templates, overrides, requests, recoveryLedger, blocks, settings,outbox };
    },


    // --- mutations métier ---
    async putTemplate(empId, tpl) {
      await client.query("BEGIN");
      try {
        await client.query("DELETE FROM templates WHERE employee_id=$1", [empId]);
        for (const parity of ["paire", "impaire"])
          for (let wd = 0; wd < 7; wd++) {
            const d = tpl[parity][wd];
            await client.query(
              "INSERT INTO templates (employee_id,parity,weekday,worked,start_time,end_time,pause_start,pause_end,is_open,is_close) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
              [empId, parity, wd, !!d.worked, d.start||null, d.end||null, d.pauseStart||null, d.pauseEnd||null, !!d.open, !!d.close]);
          }
        await client.query("COMMIT");
      } catch (e) { await client.query("ROLLBACK"); throw e; }
    },
    putOverride: (empId, day, d) =>
      client.query(
        `INSERT INTO plan_overrides (employee_id,day,worked,start_time,end_time,pause_start,pause_end,is_open,is_close)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (employee_id, day) DO UPDATE SET worked=$3,start_time=$4,end_time=$5,pause_start=$6,pause_end=$7,is_open=$8,is_close=$9`,
        [empId, day, !!d.worked, d.start||null, d.end||null, d.pauseStart||null, d.pauseEnd||null, !!d.open, !!d.close]),
    deleteOverride: (empId, day) => client.query("DELETE FROM plan_overrides WHERE employee_id=$1 AND day=$2", [empId, day]),
    async addRecovery(entry) {
      const rows = await q("INSERT INTO recovery_ledger (employee_id,delta_min,reason,at) VALUES ($1,$2,$3,$4) RETURNING id", [entry.employeeId, entry.deltaMin, entry.reason, entry.at]);
      entry.id = String(rows[0].id);
    },
    async createRequest(r) {
      const rows = await q(
        "INSERT INTO requests (employee_id,type,date_start,date_end,dates,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        [r.employeeId, r.type, r.dateStart ?? null, r.dateEnd ?? null, r.dates ?? null, r.status, r.createdAt]);
      r.id = String(rows[0].id);
    },

    // Validation atomique : une seule transaction = verrou ligne + règle métier + écritures liées.
    // Idempotente : revalider une demande déjà validée est un no-op (pas de double décompte).
    async validateRequest(requestId) {
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock(25102026)");
        const row = (await q("SELECT * FROM requests WHERE id=$1 FOR UPDATE", [requestId]))[0];
        if (!row) { await client.query("ROLLBACK"); return [404, { error: "Demande introuvable" }] };
        const r = reqFromRow(row);
        if (r.status === "approved") { await client.query("COMMIT"); return [200, { request: r, idempotent: true }] };
        if (r.status !== "pending") { await client.query("ROLLBACK"); return [409, { error: "Demande déjà refusée" }] };
        let deduct = 0;
        if (r.type === "recovery") {
          const chk = checkRecoveryValidation(r, { [r.employeeId]: await templatesOf(r.employeeId) }, await overridesOf(r.employeeId), await balanceOf(r.employeeId));
          if (!chk.ok) { await client.query("ROLLBACK"); return [409, { error: chk.reason }] };
          deduct = chk.deductMinutes;
        }
        await client.query("UPDATE requests SET status='approved', deducted_min=$1, decided_at=now() WHERE id=$2", [deduct, requestId]);
        if (deduct > 0)
          await client.query("INSERT INTO recovery_ledger (employee_id,delta_min,reason) VALUES ($1,$2,$3)", [r.employeeId, -deduct, "Récupération validée"]);
        await client.query("COMMIT");
        return [200, { request: { ...r, status: "approved", deductedMin: deduct } }];
      } catch (e) { await client.query("ROLLBACK"); throw e; }
    },

    async rejectRequest(requestId) {
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock(25102026)");
        const row = (await q("SELECT * FROM requests WHERE id=$1 FOR UPDATE", [requestId]))[0];
        if (!row) { await client.query("ROLLBACK"); return [404, { error: "Demande introuvable" }] };
        if (row.status !== "pending") { await client.query("ROLLBACK"); return [409, { error: "Demande déjà tranchée" }] };
        await client.query("UPDATE requests SET status='rejected', decided_at=now() WHERE id=$1", [requestId]);
        await client.query("COMMIT");
        return [200, { request: { ...reqFromRow(row), status: "rejected" } }];
      } catch (e) { await client.query("ROLLBACK"); throw e; }
    },

    async transact(fn){
      await client.query("BEGIN");
      try{
        await client.query("SELECT pg_advisory_xact_lock(25102026)");
        const before=await store.getDoc(),after=structuredClone(before);
        const result=await fn(after);
        await persistChanges(client,before,after);
        await client.query("COMMIT");return result;
      }catch(e){await client.query("ROLLBACK");throw e;}
    },
    close: () => client.end(),
  };
  return store;

  async function overridesOf(empId) {
    const out = {};
    for (const r of await q("SELECT * FROM plan_overrides WHERE employee_id=$1", [empId])) out[`${empId}|${iso(r.day)}`] = dayRow(r);
    return out;
  }
}

// Fabrique pour les tests : Postgres émulé en processus (pg-mem).
export async function createPgMemStore() {
  const { newDb } = await import("pg-mem");
  const mem = newDb();
  mem.public.registerFunction({name:"pg_advisory_xact_lock",args:["integer"],returns:"integer",implementation:()=>1});
  const client = new (mem.adapters.createPg().Client)();
  await client.connect();
  const store = await createPgStore(client);
  store.close = async () => {};
  return store;
}
