// Périodes bloquées — OPTION B (validée par Thibaut le 19/11/2026) : le dépôt
// reste possible pendant une période bloquée (bloc nommé ou semaine n° 1), la
// demande est signalée « Période bloquée · décision de la gérante » et Aline
// tranche. Les blocs existants ne sont pas modifiés.
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

async function requestsOf(store, empId) {
  const r = await handleApi(store, "GET", U(`/api/planning?employee=${empId}`));
  expect(r.code).toBe(200);
  return r.obj.requests;
}

describe("périodes bloquées (option B)", () => {
  it("accepte un congé pendant une période bloquée nommée, avec le drapeau", async () => {
    const { store, empId } = await makeStore([BLOCK], { firstWeek: "true" });
    const r = await handleApi(store, "POST", U("/api/requests"), { type: "leave", dateStart: "2027-04-12", dateEnd: "2027-04-14", employeeId: empId });
    expect(r.code).toBe(201);
    const reqs = await requestsOf(store, empId);
    const ours = reqs.find((r) => r.start === "2027-04-12");
    expect(ours.blocked).toBe(1);
    expect(ours.status).toBe("pending");
  });
  it("accepte un congé qui chevauche partiellement une période bloquée, avec le drapeau", async () => {
    const { store, empId } = await makeStore([BLOCK], { firstWeek: "false" });
    const r = await handleApi(store, "POST", U("/api/requests"), { type: "leave", dateStart: "2027-04-15", dateEnd: "2027-04-20", employeeId: empId });
    expect(r.code).toBe(201);
    expect((await requestsOf(store, empId)).find((x) => x.start === "2027-04-15").blocked).toBe(1);
  });
  it("accepte un congé en semaine n° 1 quand le réglage firstWeek est actif, avec le drapeau", async () => {
    const { store, empId } = await makeStore([], { firstWeek: "true" });
    const r = await handleApi(store, "POST", U("/api/requests"), { type: "leave", dateStart: "2027-01-04", dateEnd: "2027-01-06", employeeId: empId });
    expect(r.code).toBe(201);
    expect((await requestsOf(store, empId)).find((x) => x.start === "2027-01-04").blocked).toBe(1);
  });
  it("semaine n° 1 sans réglage firstWeek : dépôt accepté, pas de drapeau", async () => {
    const { store, empId } = await makeStore([BLOCK], { firstWeek: "false" });
    const r = await handleApi(store, "POST", U("/api/requests"), { type: "leave", dateStart: "2027-01-04", dateEnd: "2027-01-06", employeeId: empId });
    expect(r.code).toBe(201);
    expect((await requestsOf(store, empId)).find((x) => x.start === "2027-01-04").blocked ?? 0).toBe(0);
  });
  it("congé ordinaire hors période bloquée : pas de drapeau", async () => {
    const { store, empId } = await makeStore([BLOCK], { firstWeek: "true" });
    const r = await handleApi(store, "POST", U("/api/requests"), { type: "leave", dateStart: "2027-05-03", dateEnd: "2027-05-05", employeeId: empId });
    expect(r.code).toBe(201);
    expect((await requestsOf(store, empId)).find((x) => x.start === "2027-05-03").blocked ?? 0).toBe(0);
  });
  it("la gérante peut valider une demande signalée « période bloquée »", async () => {
    const { store, empId } = await makeStore([BLOCK], { firstWeek: "false" });
    await handleApi(store, "POST", U("/api/requests"), { type: "leave", dateStart: "2027-04-12", dateEnd: "2027-04-13", employeeId: empId });
    const req = (await requestsOf(store, empId)).find((x) => x.start === "2027-04-12");
    expect(req.blocked).toBe(1);
    const dec = await handleApi(store, "POST", U("/api/planning"), { admin: true, action: "approve", id: req.id });
    expect(dec.code).toBe(200);
    expect((await requestsOf(store, empId)).find((x) => x.id === req.id).status).toBe("approved");
  });
  it("le bloc existant reste visible dans le planning", async () => {
    const { store, empId } = await makeStore([BLOCK], { firstWeek: "true" });
    const r = await handleApi(store, "GET", U(`/api/planning?employee=${empId}`));
    expect(r.obj.blocks.map((b) => b.label)).toContain("Pas possibilité de poser des congés");
  });
});
