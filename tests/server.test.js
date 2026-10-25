// Tests du serveur local authentifie : auth, separation des droits salarie/admin
// cote serveur, validation atomique et idempotente de la recuperation.
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

const api = async (path, { method = "GET", token, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { code: res.status, body: await res.json() };
};
const login = async (email, password) => (await api("/api/login", { method: "POST", body: { email, password } })).body;

let hugo, admin;
describe("serveur authentifie", () => {
  it("refuse un mauvais mot de passe", async () => {
    const r = await api("/api/login", { method: "POST", body: { email: "hugo@echoppe.test", password: "faux" } });
    expect(r.code).toBe(401);
  });
  it("login salarie + admin", async () => {
    hugo = await login("hugo@echoppe.test", "demo-hugo");
    admin = await login("admin@echoppe.test", "demo-admin");
    expect(hugo.user.role).toBe("employee");
    expect(admin.user.role).toBe("admin");
    expect(hugo.token).toBeTruthy();
  });
  it("exige un jeton", async () => {
    expect((await api("/api/requests")).code).toBe(401);
  });
  it("un salarie ne voit que son planning (controle serveur)", async () => {
    expect((await api("/api/planning/lea?year=2027&week=10", { token: hugo.token })).code).toBe(403);
    const own = await api("/api/planning/hugo?year=2027&week=10", { token: hugo.token });
    expect(own.code).toBe(200);
    expect(own.body.days).toHaveLength(7);
  });
  it("un salarie ne voit que ses demandes", async () => {
    const mine = await api("/api/requests", { token: hugo.token });
    expect(mine.body.requests.every((r) => r.employeeId === "hugo")).toBe(true);
    const all = await api("/api/requests", { token: admin.token });
    expect(all.body.requests.length).toBeGreaterThan(mine.body.requests.length);
  });
  it("un salarie ne peut pas valider", async () => {
    expect((await api("/api/requests/r2/validate", { method: "POST", token: hugo.token })).code).toBe(403);
  });
  it("le depot d'une demande impose l'identite cote serveur", async () => {
    const r = await api("/api/requests", { method: "POST", token: hugo.token, body: { type: "leave", dateStart: "2027-05-03", dateEnd: "2027-05-05", employeeId: "lea" } });
    expect(r.code).toBe(201);
    expect(r.body.request.employeeId).toBe("hugo"); // pas "lea" malgre le corps
  });
  it("validation admin atomique et idempotente : deduction unique meme en double appel", async () => {
    const [a, b] = await Promise.all([
      api("/api/requests/r2/validate", { method: "POST", token: admin.token }),
      api("/api/requests/r2/validate", { method: "POST", token: admin.token }),
    ]);
    expect([a.code, b.code].sort()).toEqual([200, 200]);
    expect(a.body.idempotent || b.body.idempotent).toBe(true); // une des deux a vu "deja validee"
    const bal = await api("/api/recovery/hugo", { token: admin.token });
    expect(bal.body.balanceMin).toBe(14 * 60 - 510); // 14 h - 8 h 30, une seule fois
  });
  it("validation bloquee si solde insuffisant, sans ecriture", async () => {
    const req = await api("/api/requests", { method: "POST", token: hugo.token, body: { type: "recovery", dates: ["2027-03-16"] } });
    expect(req.code).toBe(201); // 8 h prevues, solde restant 5 h 30
    const v = await api(`/api/requests/${req.body.request.id}/validate`, { method: "POST", token: admin.token });
    expect(v.code).toBe(409);
    const bal = await api("/api/recovery/hugo", { token: hugo.token });
    expect(bal.body.balanceMin).toBe(14 * 60 - 510); // inchange
    const mine = await api("/api/requests", { token: hugo.token });
    expect(mine.body.requests.find((r) => r.id === req.body.request.id).status).toBe("pending");
  });
  it("un salarie ne lit pas le solde d'un autre", async () => {
    expect((await api("/api/recovery/lea", { token: hugo.token })).code).toBe(403);
  });
  it("bootstrap filtre selon le role", async () => {
    const bh = (await api("/api/bootstrap", { token: hugo.token })).body;
    expect(bh.employees.map((e) => e.id)).toEqual(["hugo"]);
    expect(Object.keys(bh.templates)).toEqual(["hugo"]);
    expect(bh.requests.every((r) => r.employeeId === "hugo")).toBe(true);
    expect(bh.recoveryLedger.every((l) => l.employeeId === "hugo")).toBe(true);
    expect(Object.keys(bh.overrides).every((k) => k.startsWith("hugo|"))).toBe(true);
    const ba = (await api("/api/bootstrap", { token: admin.token })).body;
    expect(ba.employees).toHaveLength(5);
    expect(ba.users).toBeUndefined(); // jamais de hachés côté client
    expect(ba.sessions).toBeUndefined();
  });
  it("gabarits : validation serveur et role admin", async () => {
    const tpl = (await api("/api/bootstrap", { token: admin.token })).body.templates.hugo;
    expect((await api("/api/templates/hugo", { method: "PUT", token: hugo.token, body: tpl })).code).toBe(403);
    expect((await api("/api/templates/hugo", { method: "PUT", token: admin.token, body: { paire: tpl.paire.slice(0, 6), impaire: tpl.impaire } })).code).toBe(400);
    const modif = { ...tpl, paire: tpl.paire.map((d, i) => (i === 0 ? { ...d, worked: false, start: null, end: null, pauseStart: null, pauseEnd: null } : d)) };
    expect((await api("/api/templates/hugo", { method: "PUT", token: admin.token, body: modif })).code).toBe(200);
    const after = (await api("/api/bootstrap", { token: admin.token })).body.templates.hugo;
    expect(after.paire[0].worked).toBe(false);
    // remise en état pour les tests suivants
    await api("/api/templates/hugo", { method: "PUT", token: admin.token, body: tpl });
  });
  it("ajustement jour par jour : pose et retrait, validation du format", async () => {
    const day = { worked: true, start: "09:00", end: "12:00", pauseStart: null, pauseEnd: null, open: true, close: false };
    expect((await api("/api/overrides/hugo/2027-03-15", { method: "PUT", token: hugo.token, body: day })).code).toBe(403);
    expect((await api("/api/overrides/hugo/2027-03-15", { method: "PUT", token: admin.token, body: { worked: true, start: "12:00", end: "09:00" } })).code).toBe(400);
    expect((await api("/api/overrides/hugo/2027-03-15", { method: "PUT", token: admin.token, body: day })).code).toBe(200);
    const plan = (await api("/api/planning/hugo?year=2027&week=11", { token: admin.token })).body;
    expect(plan.days[0].start).toBe("09:00");
    expect((await api("/api/overrides/hugo/2027-03-15", { method: "DELETE", token: admin.token })).code).toBe(200);
  });
  it("saisie d'heures : admin seul, positif seulement", async () => {
    expect((await api("/api/recovery", { method: "POST", token: hugo.token, body: { employeeId: "hugo", deltaMin: 60 } })).code).toBe(403);
    expect((await api("/api/recovery", { method: "POST", token: admin.token, body: { employeeId: "hugo", deltaMin: -60 } })).code).toBe(400);
    expect((await api("/api/recovery", { method: "POST", token: admin.token, body: { employeeId: "hugo", deltaMin: 60, reason: "test" } })).code).toBe(201);
    const bal = (await api("/api/recovery/hugo", { token: admin.token })).body;
    expect(bal.balanceMin).toBe(14 * 60 - 510 + 60);
    await api("/api/recovery", { method: "POST", token: admin.token, body: { employeeId: "hugo", deltaMin: 0 } }); // 400 ignore
  });
  it("export annuel : admin seul, semaines ISO des congés validés", async () => {
    expect((await api("/api/export?year=2027", { token: hugo.token })).code).toBe(403);
    const x = (await api("/api/export?year=2027", { token: admin.token })).body;
    expect(x.weeks).toBe(52);
    expect(x.leavesByEmployee.lea.length).toBeGreaterThan(0);
  });
  it("logout invalide le jeton", async () => {
    const l = await login("lea@echoppe.test", "demo-lea");
    expect((await api("/api/me", { token: l.token })).code).toBe(200);
    await api("/api/logout", { method: "POST", token: l.token });
    expect((await api("/api/me", { token: l.token })).code).toBe(401);
  });
  it("refus admin, puis validation impossible", async () => {
    expect((await api("/api/requests/r3/reject", { method: "POST", token: admin.token })).code).toBe(200);
    expect((await api("/api/requests/r3/validate", { method: "POST", token: admin.token })).code).toBe(409);
  });
});
