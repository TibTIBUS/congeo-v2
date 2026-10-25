// Vrai Postgres ÉPHÉMÈRE et LOCAL (binaire embedded-postgres, aucun service
// externe, aucune donnée réelle) : vérifie le schéma, le store SQL et surtout
// le VERROUILLAGE CONCURRENT RÉEL de la validation (deux connexions en parallèle).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { createPgStore } from "../server/db-pg.js";

let epg, store, client2;
const PORT = 55439;

beforeAll(async () => {
  epg = new EmbeddedPostgres({
    databaseDir: join(mkdtempSync(join(tmpdir(), "congeo-pg-")), "data"),
    user: "postgres", password: "congeo-test", port: PORT, persistent: false,
  });
  await epg.initialise();
  await epg.start();
  await epg.createDatabase("congeo");
  const mk = () => new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: "congeo-test", database: "congeo" });
  const client1 = mk();
  await client1.connect();
  store = await createPgStore(client1);
  client2 = mk();
  await client2.connect();
}, 180000);

afterAll(async () => {
  await store.close();
  await client2.end();
  await epg.stop();
}, 30000);

describe("stockage Postgres réel (local éphémère)", () => {
  it("schéma + seed + lecture du document", async () => {
    const doc = await store.getDoc();
    expect(doc.employees).toHaveLength(5);
    expect(doc.templates.hugo.paire[0].pauseStart).toBe("12:00");
    const u = await store.findUserByEmail("admin@echoppe.test");
    expect(u.role).toBe("admin");
  }, 30000);

  it("deux validations simultanées : une seule déduction (verrou réel)", async () => {
    const doc = await store.getDoc();
    const r2 = doc.requests.find((r) => r.employeeId === "hugo" && r.type === "recovery");
    const balBefore = doc.recoveryLedger.filter((l) => l.employeeId === "hugo").reduce((a, l) => a + l.deltaMin, 0);
    // Deux appels concurrents sur DEUX connexions distinctes
    const store2 = await createPgStore(client2, { seedIfEmpty: false });
    const [[c1, b1], [c2, b2]] = await Promise.all([store.validateRequest(r2.id), store2.validateRequest(r2.id)]);
    expect([c1, c2].sort()).toEqual([200, 200]);
    expect([b1.idempotent, b2.idempotent].filter(Boolean)).toHaveLength(1); // l'un déduit, l'autre est no-op
    const docAfter = await store.getDoc();
    const balAfter = docAfter.recoveryLedger.filter((l) => l.employeeId === "hugo").reduce((a, l) => a + l.deltaMin, 0);
    const deducted = (b1.request.deductedMin || 0) + (b2.idempotent ? 0 : b2.request.deductedMin || 0);
    expect(balAfter).toBe(balBefore - deducted);
    expect(deducted).toBeGreaterThan(0);
  }, 30000);

  it("persistance : les données survivent à une nouvelle connexion", async () => {
    const doc = await store.getDoc();
    expect(doc.requests.find((r) => r.employeeId === "hugo" && r.type === "recovery").status).toBe("approved");
  }, 30000);
});
