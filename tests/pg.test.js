import { describe, it, expect } from "vitest";
import { createPgMemStore } from "../server/db-pg.js";

// Stockage Postgres vérifié via pg-mem (émulation en processus, aucun service externe).
// Limites : pg-mem ne reproduit pas le verrouillage concurrent réel — voir pg-real.test.js.
describe("stockage Postgres (pg-mem)", () => {
  it("charge le schéma et le seed fictif : soldes", async () => {
    const s = await createPgMemStore();
    const doc = await s.getDoc();
    expect(doc.employees).toHaveLength(5);
    expect(doc.recoveryLedger.filter((l) => l.employeeId === "hugo").reduce((a, l) => a + l.deltaMin, 0)).toBe(14 * 60);
  });

  it("validation récupération atomique : décompte lié, idempotente", async () => {
    const s = await createPgMemStore();
    const doc = await s.getDoc();
    const r2 = doc.requests.find((r) => r.employeeId === "hugo" && r.type === "recovery");
    const [c1, b1] = await s.validateRequest(r2.id);
    expect(c1).toBe(200);
    expect(b1.request.deductedMin).toBeGreaterThan(0);
    const doc2 = await s.getDoc();
    const bal = doc2.recoveryLedger.filter((l) => l.employeeId === "hugo").reduce((a, l) => a + l.deltaMin, 0);
    expect(bal).toBe(14 * 60 - b1.request.deductedMin);
    const [c2, b2] = await s.validateRequest(r2.id);
    expect(c2).toBe(200);
    expect(b2.idempotent).toBe(true);
    const doc3 = await s.getDoc();
    expect(doc3.recoveryLedger.filter((l) => l.employeeId === "hugo").reduce((a, l) => a + l.deltaMin, 0)).toBe(bal);
  });

  it("validation bloquée si solde insuffisant (règle prudente)", async () => {
    const s = await createPgMemStore();
    const r = { id: "x", employeeId: "emma", type: "recovery", dates: ["2027-03-12"], status: "pending", createdAt: "2027-03-05T09:00:00" };
    await s.createRequest(r);
    const [code, body] = await s.validateRequest(r.id);
    expect(code).toBe(409);
    expect(String(body.error)).toContain("Solde insuffisant");
    const doc = await s.getDoc();
    expect(doc.recoveryLedger.filter((l) => l.employeeId === "emma")).toHaveLength(0);
    expect(doc.requests.find((x) => x.id === r.id).status).toBe("pending");
  });

  it("congé validé sans décompte ; refus tranché", async () => {
    const s = await createPgMemStore();
    const doc = await s.getDoc();
    const r3 = doc.requests.find((r) => r.employeeId === "tom" && r.type === "leave");
    const [c1] = await s.validateRequest(r3.id);
    expect(c1).toBe(200);
    const [c2] = await s.rejectRequest(r3.id);
    expect(c2).toBe(409); // déjà tranchée
  });

  it("gabarit remplacé en transaction, override posé puis retiré", async () => {
    const s = await createPgMemStore();
    const doc = await s.getDoc();
    const tpl = doc.templates.hugo;
    tpl.paire[0] = { ...tpl.paire[0], start: "07:30" };
    await s.putTemplate("hugo", tpl);
    expect((await s.getDoc()).templates.hugo.paire[0].start).toBe("07:30");
    await s.putOverride("hugo", "2027-03-12", { worked: false, start: null, end: null, pauseStart: null, pauseEnd: null, open: false, close: false });
    expect((await s.getDoc()).overrides["hugo|2027-03-12"].worked).toBe(false);
    await s.deleteOverride("hugo", "2027-03-12");
    expect((await s.getDoc()).overrides["hugo|2027-03-12"]).toBeUndefined();
  });
});
