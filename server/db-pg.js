// Stockage Postgres : base DÉDIÉE à la V2 (séparée de la V1), schéma schema.sql.
// Meme interface async que server/db.js (JSON local) : le routeur ne sait pas
// quel stockage est derriere. La validation de récupération est une vraie
// transaction SQL : verrou de ligne (SELECT … FOR UPDATE) + règle métier +
// écritures liées, idempotente. La portée "salarié = ses données seules" reste
// appliquée par le routeur ; des policies RLS pourront durcir la base plus tard.
//
// Vérifié localement de deux façons, sans service externe ni déploiement :
// - pg-mem (émulation en processus) dans tests/pg.test.js ;
// - un vrai Postgres éphémère (embedded-postgres, binaire local) dans
//   tests/pg-real.test.js, avec un test de verrouillage concurrent réel.
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
  status: r.status, createdAt: r.created_at,
  ...(r.deducted_min != null ? { deductedMin: r.deducted_min } : {}),
  ...(r.decided_at ? { decidedAt: r.decided_at } : {}),
});
const ledgerFromRow = (l) => ({ id: String(l.id), employeeId: l.employee_id, deltaMin: l.delta_min, reason: l.reason, at: l.at });
const userFromRow = (u) => (u ? { id: u.id, email: u.email, passwordHash: u.password, name: u.name, role: u.role, employeeId: u.employee_id } : null);

// client : client pg déjà connecté (vrai pg ou pg-mem). seedIfEmpty : injecte
// les données fictives si la base est vide (démo/test), à désactiver en réel.
export async function createPgStore(client, { seedIfEmpty = true } = {}) {
  const q = async (text, values) => (await client.query(text, values)).rows;
  await client.query(readFileSync(fileURLToPath(new URL("../schema.sql", import.meta.url)), "utf8"));

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
            [empId, parity, wd, d.worked, d.start, d.end, d.pauseStart, d.pauseEnd, d.open, d.close]);
        }
    for (const r of s.requests)
      await client.query(
        "INSERT INTO requests (employee_id,type,date_start,date_end,dates,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [r.employeeId, r.type, r.dateStart ?? null, r.dateEnd ?? null, r.dates ?? null, r.status, r.createdAt]);
    for (const l of s.recoveryLedger)
      await client.query("INSERT INTO recovery_ledger (employee_id,delta_min,reason,at) VALUES ($1,$2,$3,$4)", [l.employeeId, l.deltaMin, l.reason, l.at]);
    for (const u of s.users)
      await client.query("INSERT INTO app_users (id,email,password,name,role,employee_id) VALUES ($1,$2,$3,$4,$5,$6)", [u.id, u.email, u.passwordHash, u.name, u.role, u.employeeId]);
  }

  const templatesOf = async (empId) => {
    const out = { paire: [], impaire: [] };
    for (const r of await q("SELECT * FROM templates WHERE employee_id=$1", [empId])) out[r.parity][r.weekday] = dayRow(r);
    return out;
  };
  const balanceOf = async (empId) =>
    Number((await q("SELECT COALESCE(SUM(delta_min),0) AS b FROM recovery_ledger WHERE employee_id=$1", [empId]))[0].b);

  return {
    async getDoc() {
      const employees = (await q("SELECT * FROM employees ORDER BY id")).map((e) => ({ id: e.id, name: e.name, role: e.role, color: e.color }));
      const templates = {};
      for (const e of employees) templates[e.id] = await templatesOf(e.id);
      const overrides = {};
      for (const r of await q("SELECT * FROM plan_overrides")) overrides[`${r.employee_id}|${iso(r.day)}`] = dayRow(r);
      const requests = (await q("SELECT * FROM requests ORDER BY created_at")).map(reqFromRow);
      const recoveryLedger = (await q("SELECT * FROM recovery_ledger ORDER BY at")).map(ledgerFromRow);
      return { employees, templates, overrides, requests, recoveryLedger };
    },

    // --- comptes et sessions ---
    findUserByEmail: async (email) => userFromRow((await q("SELECT * FROM app_users WHERE email=$1", [email]))[0]),
    getSessionUser: async (token) =>
      userFromRow((await q("SELECT u.* FROM sessions s JOIN app_users u ON u.id = s.user_id WHERE s.token=$1", [token]))[0]),
    createSession: async (token, userId) => client.query("INSERT INTO sessions (token,user_id) VALUES ($1,$2)", [token, userId]),
    deleteSession: async (token) => client.query("DELETE FROM sessions WHERE token=$1", [token]),

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
              [empId, parity, wd, d.worked, d.start, d.end, d.pauseStart, d.pauseEnd, d.open, d.close]);
          }
        await client.query("COMMIT");
      } catch (e) { await client.query("ROLLBACK"); throw e; }
    },
    putOverride: (empId, day, d) =>
      client.query(
        `INSERT INTO plan_overrides (employee_id,day,worked,start_time,end_time,pause_start,pause_end,is_open,is_close)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (employee_id, day) DO UPDATE SET worked=$3,start_time=$4,end_time=$5,pause_start=$6,pause_end=$7,is_open=$8,is_close=$9`,
        [empId, day, d.worked, d.start, d.end, d.pauseStart, d.pauseEnd, d.open, d.close]),
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
        const row = (await q("SELECT * FROM requests WHERE id=$1 FOR UPDATE", [requestId]))[0];
        if (!row) { await client.query("ROLLBACK"); return [404, { error: "Demande introuvable" }] };
        if (row.status !== "pending") { await client.query("ROLLBACK"); return [409, { error: "Demande déjà tranchée" }] };
        await client.query("UPDATE requests SET status='rejected', decided_at=now() WHERE id=$1", [requestId]);
        await client.query("COMMIT");
        return [200, { request: { ...reqFromRow(row), status: "rejected" } }];
      } catch (e) { await client.query("ROLLBACK"); throw e; }
    },

    close: () => client.end(),
  };

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
  const client = new (mem.adapters.createPg().Client)();
  await client.connect();
  const store = await createPgStore(client);
  store.close = async () => {};
  return store;
}
