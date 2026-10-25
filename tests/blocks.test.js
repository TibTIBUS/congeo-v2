// Périodes bloquées (règles reprises de la V1) : semaine n° 1 ISO + périodes
// nommées. Le serveur refuse les demandes de congés qui les touchent.
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { openDb } from "../server/db.js";
import { handleApi } from "../server/index.js";
import { seedDb } from "../server/seed.js";

const U = (p) => new URL(p, "http://x");
async function makeStore(blocks, settings) {
  const f = join(mkdtempSync(join(tmpdir(), "congeo-")), "db.json");
  writeFileSync(f, JSON.stringify({ ...seedDb(), seedVersion: 3, blocks, settings }));
  const store = openDb(f);
  const db = await store.getDoc();
  return { store, empId: db.employees[0].id };
}
const BLOCK = { id: "b1", label: "Pas possibilité de poser des congés", start: "2027-04-12", end: "2027-04-17" };

describe("périodes bloquées (règles V1)", () => {
  it("refuse un congé pendant une période bloquée nommée", async () => {
    const { store, empId } = await makeStore([BLOCK], { firstWeek: "true" });
    const r = await handleApi(store, "POST", U("/api/requests"), { type: "leave", dateStart: "2027-04-12", dateEnd: "2027-04-14", employeeId: empId });
    expect(r.code).toBe(400);
    expect(r.obj.error).toContain("Pas possibilité de poser des congés");
  });
  it("refuse un congé qui chevauche partiellement une période bloquée", async () => {
    const { store, empId } = await makeStore([BLOCK], { firstWeek: "false" });
    const r = await handleApi(store, "POST", U("/api/requests"), { type: "leave", dateStart: "2027-04-15", dateEnd: "2027-04-20", employeeId: empId });
    expect(r.code).toBe(400);
  });
  it("refuse un congé en semaine n° 1 quand le réglage firstWeek est actif", async () => {
    const { store, empId } = await makeStore([], { firstWeek: "true" });
    const r = await handleApi(store, "POST", U("/api/requests"), { type: "leave", dateStart: "2027-01-04", dateEnd: "2027-01-06", employeeId: empId });
    expect(r.code).toBe(400);
    expect(r.obj.error).toContain("Semaine n° 1");
  });
  it("autorise la semaine n° 1 si le réglage firstWeek est retiré", async () => {
    const { store, empId } = await makeStore([], { firstWeek: "false" });
    const r = await handleApi(store, "POST", U("/api/requests"), { type: "leave", dateStart: "2027-01-04", dateEnd: "2027-01-06", employeeId: empId });
    expect(r.code).toBe(201);
  });
  it("autorise un congé ordinaire hors périodes bloquées", async () => {
    const { store, empId } = await makeStore([BLOCK], { firstWeek: "true" });
    const r = await handleApi(store, "POST", U("/api/requests"), { type: "leave", dateStart: "2027-05-03", dateEnd: "2027-05-05", employeeId: empId });
    expect(r.code).toBe(201);
  });
});
