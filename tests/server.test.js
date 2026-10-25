// Tests du serveur local : accès SANS connexion (modèle V1, décision 25/10 12h57),
// filtrage des données livrées par identité déclarée, validation atomique et
// idempotente de la récupération.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createApp } from "../server/index.js";

let server, base;
beforeAll(async () => {
  server = createApp(join(mkdtempSync(join(tmpdir(), "congeo-")), "db.json"));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => server.close());

const api = async (path, { method = "GET", body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { code: res.status, body: await res.json() };
};

describe("serveur, accès modèle V1 (sans connexion)", () => {
  it("liste les prénoms pour le sélecteur (comme l'accueil V1)", async () => {
    const r = await api("/api/employees");
    expect(r.code).toBe(200);
    expect(r.body.employees.map((e) => e.id).sort()).toEqual(["emma", "hugo", "ines", "lea", "tom"]);
  });
  it("bootstrap : filtrage par identité déclarée, admin complet", async () => {
    expect((await api("/api/bootstrap")).code).toBe(400);
    const bh = (await api("/api/bootstrap?employee=hugo")).body;
    expect(bh.employees.map((e) => e.id)).toEqual(["hugo"]);
    expect(Object.keys(bh.templates)).toEqual(["hugo"]);
    expect(bh.requests.every((r) => r.employeeId === "hugo")).toBe(true);
    expect(bh.recoveryLedger.every((l) => l.employeeId === "hugo")).toBe(true);
    expect(Object.keys(bh.overrides).every((k) => k.startsWith("hugo|"))).toBe(true);
    const ba = (await api("/api/bootstrap?as=admin")).body;
    expect(ba.employees).toHaveLength(5);
    expect(ba.users).toBeUndefined(); // plus de comptes du tout
    expect(ba.sessions).toBeUndefined();
  });
  it("planning d'un salarié déclaré", async () => {
    const own = await api("/api/planning/hugo?year=2027&week=10");
    expect(own.code).toBe(200);
    expect(own.body.days).toHaveLength(7);
    expect((await api("/api/planning/personne?year=2027&week=10")).code).toBe(404);
  });
  it("demandes : filtrage par salarié déclaré", async () => {
    const mine = await api("/api/requests?employee=hugo");
    expect(mine.body.requests.every((r) => r.employeeId === "hugo")).toBe(true);
    const all = await api("/api/requests");
    expect(all.body.requests.length).toBeGreaterThan(mine.body.requests.length);
  });
  it("dépôt d'une demande : identité déclarée dans le corps (comme l'onglet partagé V1)", async () => {
    const r = await api("/api/requests", { method: "POST", body: { type: "leave", dateStart: "2027-05-03", dateEnd: "2027-05-05", employeeId: "hugo" } });
    expect(r.code).toBe(201);
    expect(r.body.request.employeeId).toBe("hugo");
    expect((await api("/api/requests", { method: "POST", body: { type: "leave", dateStart: "2027-05-03", dateEnd: "2027-05-05", employeeId: "personne" } })).code).toBe(400);
  });
  it("validation atomique et idempotente : déduction unique même en double appel", async () => {
    const [a, b] = await Promise.all([
      api("/api/requests/r2/validate", { method: "POST",body:{override:true} }),
      api("/api/requests/r2/validate", { method: "POST",body:{override:true} }),
    ]);
    expect([a.code, b.code].sort()).toEqual([200, 200]);
    expect(a.body.idempotent || b.body.idempotent).toBe(true);
    const bal = await api("/api/recovery/hugo");
    expect(bal.body.balanceMin).toBe(14 * 60 - 510); // 14 h - 8 h 30, une seule fois
  });
  it("validation bloquée si solde insuffisant, sans écriture", async () => {
    const req = await api("/api/requests", { method: "POST", body: { type: "recovery", dates: ["2027-03-16"], employeeId: "hugo" } });
    expect(req.code).toBe(201);
    const v = await api(`/api/requests/${req.body.request.id}/validate`, { method: "POST" });
    expect(v.code).toBe(409);
    const bal = await api("/api/recovery/hugo");
    expect(bal.body.balanceMin).toBe(14 * 60 - 510); // inchangé
    const mine = await api("/api/requests?employee=hugo");
    expect(mine.body.requests.find((r) => r.id === req.body.request.id).status).toBe("pending");
  });
  it("gabarits : validation serveur du format", async () => {
    const tpl = (await api("/api/bootstrap?as=admin")).body.templates.hugo;
    expect((await api("/api/templates/hugo", { method: "PUT", body: { paire: tpl.paire.slice(0, 6), impaire: tpl.impaire } })).code).toBe(400);
    const modif = { ...tpl, paire: tpl.paire.map((d, i) => (i === 0 ? { ...d, worked: false, start: null, end: null, pauseStart: null, pauseEnd: null } : d)) };
    expect((await api("/api/templates/hugo", { method: "PUT", body: modif })).code).toBe(200);
    const after = (await api("/api/bootstrap?as=admin")).body.templates.hugo;
    expect(after.paire[0].worked).toBe(false);
    await api("/api/templates/hugo", { method: "PUT", body: tpl }); // remise en état
  });
  it("ajustement jour par jour : pose et retrait, validation du format", async () => {
    const day = { worked: true, start: "09:00", end: "12:00", pauseStart: null, pauseEnd: null, open: true, close: false };
    expect((await api("/api/overrides/hugo/2027-03-15", { method: "PUT", body: { worked: true, start: "12:00", end: "09:00" } })).code).toBe(400);
    expect((await api("/api/overrides/hugo/2027-03-15", { method: "PUT", body: day })).code).toBe(200);
    const plan = (await api("/api/planning/hugo?year=2027&week=11")).body;
    expect(plan.days[0].start).toBe("09:00");
    expect((await api("/api/overrides/hugo/2027-03-15", { method: "DELETE" })).code).toBe(200);
  });
  it("saisie d'heures : positif seulement", async () => {
    expect((await api("/api/recovery", { method: "POST", body: { employeeId: "hugo", deltaMin: -60 } })).code).toBe(400);
    expect((await api("/api/recovery", { method: "POST", body: { employeeId: "hugo", deltaMin: 60, reason: "test" } })).code).toBe(201);
    const bal = (await api("/api/recovery/hugo")).body;
    expect(bal.balanceMin).toBe(14 * 60 - 510 + 60);
  });
  it("export annuel : semaines ISO des congés validés", async () => {
    const x = (await api("/api/export?year=2027")).body;
    expect(x.weeks).toBe(52);
    expect(x.leavesByEmployee.lea.length).toBeGreaterThan(0);
  });
  it("refus, puis validation impossible", async () => {
    expect((await api("/api/requests/r3/reject", { method: "POST" })).code).toBe(200);
    expect((await api("/api/requests/r3/validate", { method: "POST" })).code).toBe(409);
  });
});
