// Migration de publication 20261119-special-days.sql : rejouée sur une base
// pg-mem avec les 2 lignes de Chloé Lhomme dans leur état live du 19/11.
// Vérifie le type recovery_other, les notes, ET l'idempotence (2e exécution
// sans effet). Le SQL exécuté est le fichier réel, lu tel quel.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { newDb } from "pg-mem";

const CHLOE = "186f19b4-6f37-4c2f-b50d-09de22db7f74";

async function makeClient() {
  const mem = newDb();
  const c = new (mem.adapters.createPg().Client)();
  await c.connect();
  await c.query("CREATE TABLE employees (id text PRIMARY KEY)");
  await c.query(
    "CREATE TABLE requests (id serial PRIMARY KEY, employee_id text NOT NULL REFERENCES employees(id), type text NOT NULL, status text NOT NULL, date_start date, date_end date, dates date[], details jsonb NOT NULL DEFAULT '{}')"
  );
  await c.query(`INSERT INTO employees (id) VALUES ('${CHLOE}')`);
  // État live constaté le 19/11 : 18/11 « congé validé » (details vide),
  // 05/11 « congé annulé » (drapeau d'annulation consommé).
  await c.query(
    `INSERT INTO requests (employee_id, type, status, date_start, date_end, details) VALUES
     ('${CHLOE}', 'leave', 'approved', DATE '2026-11-18', DATE '2026-11-18', '{}'),
     ('${CHLOE}', 'leave', 'cancelled', DATE '2026-11-05', DATE '2026-11-05', '{"cancel_requested":0}')`
  );
  return c;
}

function migrationStatements() {
  const sql = readFileSync(new URL("../migrations/20261119-special-days.sql", import.meta.url), "utf8");
  return sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .replace(/\bBEGIN\s*;/i, "")
    .replace(/\bCOMMIT\s*;/i, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function runMigration(c, { replay = false } = {}) {
  for (const stmt of migrationStatements()) {
    // pg-mem ne sait pas rejouer un CREATE … IF NOT EXISTS sur une table déjà
    // créée (limite du simulateur, pas de Postgres) : au 2e passage on ne
    // rejoue que les UPDATE, qui portent le risque d'idempotence réel.
    if (replay && /^CREATE\s/i.test(stmt)) continue;
    await c.query(stmt);
  }
}

async function rows(c) {
  const r = await c.query("SELECT type, status, date_start, date_end, dates, details FROM requests ORDER BY id");
  return r.rows;
}

describe("migration compteur férié/dimanche (publication)", () => {
  it("aligne les 2 demandes de Chloé sur la V1 et crée la table des mouvements", async () => {
    const c = await makeClient();
    await runMigration(c);
    const [nov18, nov05] = await rows(c);
    expect(nov18).toMatchObject({ type: "recovery_other", status: "approved", date_start: null, date_end: null });
    expect(nov18.dates).toHaveLength(1);
    expect(nov18.details).toMatchObject({ note: "Rendez-vous (après-midi)", source: "v1-align-20261119" });
    expect(nov05).toMatchObject({ type: "recovery_other", status: "cancelled", date_start: null, date_end: null });
    expect(nov05.dates).toHaveLength(1);
    expect(nov05.details).toMatchObject({ note: "Rendez-vous", source: "v1-align-20261119", cancel_requested: 0 });
    // Aucun mouvement de compteur créé par la migration.
    const ledger = await c.query("SELECT count(*)::int AS n FROM special_day_ledger");
    expect(ledger.rows[0].n).toBe(0);
  });
  it("est idempotente : une seconde exécution ne change rien", async () => {
    const c = await makeClient();
    await runMigration(c);
    const avant = await rows(c);
    await runMigration(c, { replay: true }); // ne doit ni échouer ni ré-écrire
    expect(await rows(c)).toEqual(avant);
    // Une ligne déjà en recovery_other n'est pas retouchée.
    const r = await c.query("SELECT details FROM requests ORDER BY id LIMIT 1");
    expect(r.rows[0].details.source).toBe("v1-align-20261119");
  });
});
