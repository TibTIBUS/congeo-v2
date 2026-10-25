import { describe, it, expect } from "vitest";
import { isoWeek, isoWeeksInYear, mondayOfISOWeek, weekDates, parityOf, toISODate, parseISO } from "../src/domain/dates.js";
import { holidayByWeek, SCHOOL_HOLIDAYS } from "../src/domain/schoolHolidays.js";
import { plannedMinutes, dayCoverage, weekCoverage, getDayPlan } from "../src/domain/planning.js";
import { checkRecoveryValidation, recoveryPlannedMinutes } from "../src/domain/requests.js";
import { seed } from "../src/domain/seedData.js";

describe("semaines ISO", () => {
  it("2026 a 53 semaines, 2027 et 2028 en ont 52", () => {
    expect(isoWeeksInYear(2026)).toBe(53);
    expect(isoWeeksInYear(2027)).toBe(52);
    expect(isoWeeksInYear(2028)).toBe(52);
  });
  it("le 8 mars 2027 est en semaine 10 (paire)", () => {
    const iso = isoWeek(parseISO("2027-03-08"));
    expect(iso).toEqual({ year: 2027, week: 10 });
    expect(parityOf(iso)).toBe("paire");
  });
  it("parite au changement d'annee : S53-2026 et S1-2027 sont impaires toutes deux", () => {
    expect(parityOf({ year: 2026, week: 53 })).toBe("impaire");
    expect(parityOf({ year: 2027, week: 1 })).toBe("impaire");
  });
  it("S53-2026 existe : 28 dec 2026 - 3 jan 2027", () => {
    expect(isoWeek(parseISO("2026-12-28"))).toEqual({ year: 2026, week: 53 });
    expect(isoWeek(parseISO("2027-01-01"))).toEqual({ year: 2026, week: 53 });
    expect(isoWeek(parseISO("2027-01-04"))).toEqual({ year: 2027, week: 1 });
  });
  it("mondayOfISOWeek tombe un lundi", () => {
    const m = mondayOfISOWeek(2027, 10);
    expect(m.getDay()).toBe(1);
    expect(toISODate(m)).toBe("2027-03-08");
  });
});

describe("vacances scolaires zone B", () => {
  it("hiver 2027 : semaines 7 a 9 teintees (20 fev - 7 mars)", () => {
    const h = holidayByWeek(2027, 52);
    expect(h[7]).toBe("Hiver");
    expect(h[8]).toBe("Hiver");
    expect(h[9]).toBe("Hiver");
    expect(h[6]).toBeUndefined();
    expect(h[10]).toBeUndefined();
  });
  it("ete 2027 : S26 a S35 (le sam. 3 juil est en S26), rentree le 2 sept", () => {
    const h = holidayByWeek(2027, 52);
    for (const w of [26, 27, 30, 35]) expect(h[w]).toBe("Été");
    expect(h[25]).toBeUndefined();
    expect(h[36]).toBeUndefined();
  });
  it("noel 2026 touche S51-53 de 2026 et S1 de 2027", () => {
    const h26 = holidayByWeek(2026, 53);
    expect(h26[51]).toBe("Noël");
    expect(h26[53]).toBe("Noël");
    const h27 = holidayByWeek(2027, 52);
    // les vacances finissent le dim. 3 jan 2027, en S53-2026 : pas de teinte en S1-2027
    expect(h27[1]).toBeUndefined();
    expect(h27[2]).toBeUndefined();
  });
  it("printemps 2027 : S15 a S17", () => {
    const h = holidayByWeek(2027, 52);
    expect(h[15]).toBe("Printemps");
    expect(h[17]).toBe("Printemps");
    expect(h[18]).toBeUndefined();
  });
  it("toussaint 2027 : S42 a S44 (23 oct - 7 nov)", () => {
    const h = holidayByWeek(2027, 52);
    expect(h[42]).toBe("Toussaint");
    expect(h[44]).toBe("Toussaint");
    expect(h[45]).toBeUndefined();
  });
});

const day = (o = {}) => ({ worked: true, start: "08:00", end: "17:00", pauseStart: "12:00", pauseEnd: "13:00", open: false, close: false, ...o });

describe("planning", () => {
  it("total : plages moins pauses", () => {
    expect(plannedMinutes(day())).toBe(8 * 60); // 8h-17h moins 1h de pause
    expect(plannedMinutes(day({ start: "10:00", end: "19:30" }))).toBe(8 * 60 + 30);
    expect(plannedMinutes({ worked: false })).toBe(0);
  });
  it("couverture : au moins 2 salaries a l'ouverture et 2 a la fermeture", () => {
    const plans = {
      a: [day({ open: true, close: true })],
      b: [day({ open: true, close: true })],
    };
    const c = dayCoverage(plans, 0);
    expect(c.coveredO).toBe(true);
    expect(c.coveredF).toBe(true);
    // un seul salarie, meme O+F le meme jour, ne suffit plus
    const c2 = dayCoverage({ a: [day({ open: true, close: true })] }, 0);
    expect(c2.coveredO).toBe(false);
    expect(c2.coveredF).toBe(false);
    expect(c2.openings).toBe(1);
    // 2 ouvreurs mais 1 seul ferme : fermeture non couverte
    const c3 = dayCoverage({ a: [day({ open: true })], b: [day({ open: true, close: true })] }, 0);
    expect(c3.coveredO).toBe(true);
    expect(c3.coveredF).toBe(false);
  });
  it("bandeau : alerte par jour sous le seuil de 2", () => {
    const one = () => day({ open: true, close: true });
    const plans = { a: Array.from({ length: 7 }, one) };
    expect(weekCoverage(plans)).toMatchObject({ openingsCovered: 0, closingsCovered: 0, days: 6 });
    expect(weekCoverage(plans).warnings).toHaveLength(12); // 6 jours x (O + F) a 1 seul salarie
    const two = { a: Array.from({ length: 7 }, one), b: Array.from({ length: 7 }, one) };
    expect(weekCoverage(two)).toMatchObject({ openingsCovered: 6, closingsCovered: 6 });
    expect(weekCoverage(two).warnings).toHaveLength(0);
  });
  it("donnees fictives : la regle 2 O / 2 F signale les jours insuffisants", () => {
    // Les badges fictifs n'ont pas ete retouches pour satisfaire la regle :
    // la demo montre precisement l'alerte sur les jours sous-effectif.
    const s = seed();
    const plans = (p) => Object.fromEntries(s.employees.map((e) => [e.id, s.templates[e.id][p]]));
    const cp = weekCoverage(plans("paire"));
    expect(cp).toMatchObject({ openingsCovered: 3, closingsCovered: 4, days: 6 });
    expect(cp.warnings.every((w) => w.count === 1)).toBe(true);
    const ci = weekCoverage(plans("impaire"));
    expect(ci).toMatchObject({ openingsCovered: 3, closingsCovered: 3, days: 6 });
    expect(ci.warnings).toHaveLength(6);
  });
});

describe("recuperation", () => {
  const templates = {
    e1: {
      paire: [day(), day(), day(), day(), day(), day(), { worked: false }],
      impaire: [day(), day(), day(), day(), day(), day(), { worked: false }],
    },
  };
  it("deduit les heures planifiees des jours poses", () => {
    const req = { type: "recovery", employeeId: "e1", dates: ["2027-03-08", "2027-03-09"] }; // sem. 10 paire
    expect(recoveryPlannedMinutes(req, templates, {})).toBe(16 * 60);
    const ok = checkRecoveryValidation(req, templates, {}, 20 * 60);
    expect(ok.ok).toBe(true);
    expect(ok.deductMinutes).toBe(16 * 60);
  });
  it("bloque la validation si le solde ne couvre pas, sans rien deduire", () => {
    const req = { type: "recovery", employeeId: "e1", dates: ["2027-03-08", "2027-03-09", "2027-03-10"] };
    const r = checkRecoveryValidation(req, templates, {}, 20 * 60); // 24 h prevues > 20 h
    expect(r.ok).toBe(false);
    expect(r.deductMinutes).toBe(0);
    expect(r.reason).toMatch(/bloquee/);
  });
  it("jour de repos pose en recuperation : 0 h a deduire", () => {
    const req = { type: "recovery", employeeId: "e1", dates: ["2027-03-14"] }; // dimanche
    expect(recoveryPlannedMinutes(req, templates, {})).toBe(0);
  });
});
