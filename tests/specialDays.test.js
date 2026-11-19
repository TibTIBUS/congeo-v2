// Compteur « autre récupération · férié/dimanche » : crédits calculés depuis le
// planning (jamais stockés), solde « à renseigner », validation suspendue ou
// bloquée selon le solde.
import { describe, it, expect } from "vitest";
import { creditableDays, specialDayCredits, specialBalance, checkSpecialDebit, worksForCredit, specialHistory } from "../src/domain/specialDays.js";

const OFF = { worked: false, start: null, end: null, pauseStart: null, pauseEnd: null, open: false, close: false };
const W = (h = 8) => ({ worked: true, start: "09:00", end: "09:00" && `${String(9 + h).padStart(2, "0")}:00`, pauseStart: null, pauseEnd: null, open: false, close: false });

function fixture(over = {}, extra = {}) {
  return {
    employees: [{ id: "e1", name: "Test", active: true }, { id: "e2", name: "Autre", active: true }],
    templates: { e1: { paire: Array.from({ length: 7 }, () => OFF), impaire: Array.from({ length: 7 }, () => OFF) } },
    overrides: over,
    requests: [],
    specialDayLedger: [],
    settings: {
      holidayCalendar: JSON.stringify({ years: { "2027": { effectiveFrom: "2027-01-01", closed: ["2027-12-25"] } } }),
      sundayOpenings: JSON.stringify(["2027-03-14"]),
      specialKnown: JSON.stringify({ e1: true }),
    },
    ...extra,
  };
}

describe("jours ouvrant droit au crédit", () => {
  it("fériés ouverts des années configurées + dimanches ouverts, jamais le 1er mai ni les fériés fermés", () => {
    const days = creditableDays(fixture()).map((d) => d.day);
    expect(days).toContain("2027-05-08");
    expect(days).toContain("2027-03-14"); // dimanche ouvert
    expect(days).not.toContain("2027-05-01"); // toujours fermé
    expect(days).not.toContain("2027-12-25"); // configuré fermé
    expect(days.filter((d) => d.startsWith("2028"))).toHaveLength(0); // année non configurée
  });
  it("crédit seulement si la journée est travaillée au planning", () => {
    expect(specialDayCredits(fixture())).toHaveLength(0);
    const d = fixture({ "e1|2027-05-08": W() });
    const credits = specialDayCredits(d);
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ employeeId: "e1", day: "2027-05-08", reason: "Férié travaillé · Victoire 1945", deltaDays: 1 });
  });
  it("dimanche ouvert travaillé : crédité ; dimanche non travaillé : rien", () => {
    expect(specialDayCredits(fixture({ "e1|2027-03-14": W() })).map((c) => c.reason)).toEqual(["Dimanche travaillé"]);
    expect(specialDayCredits(fixture({ "e2|2027-03-14": W() })).map((c) => c.employeeId)).toEqual(["e2"]);
  });
  it("pas de crédit si absence validée, arrêt, école ou avant l'arrivée ce jour-là", () => {
    const base = { "e1|2027-05-08": W() };
    expect(worksForCredit(fixture(base, { requests: [{ id: "r", employeeId: "e1", type: "leave", dateStart: "2027-05-08", dateEnd: "2027-05-08", status: "approved" }] }), "e1", "2027-05-08")).toBe(false);
    expect(worksForCredit(fixture(base, { settings: { ...fixture().settings, sickLeaves: JSON.stringify([{ id: "s", employeeId: "e1", dateStart: "2027-05-08", dateEnd: "2027-05-08", status: "active" }]) } }), "e1", "2027-05-08")).toBe(false);
    expect(worksForCredit(fixture(base, { settings: { ...fixture().settings, schoolPeriods: JSON.stringify([{ employeeId: "e1", start: "2027-05-08", end: "2027-05-08" }]) } }), "e1", "2027-05-08")).toBe(false);
    expect(worksForCredit(fixture(base, { settings: { ...fixture().settings, employmentStarts: JSON.stringify({ e1: "2027-06-01" }) } }), "e1", "2027-05-08")).toBe(false);
  });
  it("le crédit disparaît si la journée est retirée du planning (rien à rejouer)", () => {
    const d = fixture({ "e1|2027-05-08": W() });
    expect(specialBalance(d, "e1")).toBe(1);
    d.overrides["e1|2027-05-08"] = OFF;
    expect(specialBalance(d, "e1")).toBe(0);
  });
});

describe("solde et validation", () => {
  it("solde = crédits du planning + mouvements ; historique fusionné", () => {
    const d = fixture({ "e1|2027-05-08": W() });
    d.specialDayLedger.push({ id: "m1", employeeId: "e1", deltaDays: 2, reason: "Compteur initial férié/dimanche renseigné", at: "2027-03-01T10:00:00" });
    d.specialDayLedger.push({ id: "m2", employeeId: "e1", deltaDays: -1, reason: "Autre récupération validée", day: "2027-06-01", at: "2027-05-20T10:00:00" });
    expect(specialBalance(d, "e1")).toBe(2);
    const h = specialHistory(d, "e1");
    expect(h.map((x) => x.deltaDays)).toEqual([-1, 1, 2]);
  });
  it("validation suspendue tant que le solde est « à renseigner »", () => {
    const d = fixture({ "e1|2027-05-08": W() });
    d.settings.specialKnown = "{}";
    const chk = checkSpecialDebit(d, "e1", ["2027-06-01"]);
    expect(chk.ok).toBe(false);
    expect(chk.reason).toContain("à renseigner");
  });
  it("validation bloquée si le solde ne couvre pas les jours posés", () => {
    const d = fixture(); // 0 crédit, solde connu (map fixture)
    const chk = checkSpecialDebit(d, "e1", ["2027-06-01"]);
    expect(chk.ok).toBe(false);
    expect(chk.reason).toContain("ne couvre pas");
  });
  it("validation OK : 1 jour posé = 1 jour décompté", () => {
    const d = fixture({ "e1|2027-05-08": W() });
    expect(checkSpecialDebit(d, "e1", ["2027-06-01"])).toEqual({ ok: true, debitDays: 1 });
  });
});
