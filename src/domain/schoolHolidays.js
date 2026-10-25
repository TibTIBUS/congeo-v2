// Vacances scolaires zone B (academie de Normandie - Caen), jours de vacances
// (le jour de reprise est exclu). Sources : education.gouv.fr, Légifrance
// JORFTEXT000052416058, service-public F31952 (verifie 25 oct 2026).
export const SCHOOL_HOLIDAYS = [
  // Annee scolaire 2025-2026
  { name: "Toussaint", start: "2025-10-18", end: "2025-11-02" },
  { name: "Noël", start: "2025-12-20", end: "2026-01-04" },
  { name: "Hiver", start: "2026-02-14", end: "2026-03-01" },
  { name: "Printemps", start: "2026-04-11", end: "2026-04-26" },
  { name: "Été", start: "2026-07-04", end: "2026-08-31" },
  // Annee scolaire 2026-2027
  { name: "Toussaint", start: "2026-10-17", end: "2026-11-01" },
  { name: "Noël", start: "2026-12-19", end: "2027-01-03" },
  { name: "Hiver", start: "2027-02-20", end: "2027-03-07" },
  { name: "Printemps", start: "2027-04-17", end: "2027-05-02" },
  { name: "Été", start: "2027-07-03", end: "2027-09-01" },
  // Annee scolaire 2027-2028
  { name: "Toussaint", start: "2027-10-23", end: "2027-11-07" },
  { name: "Noël", start: "2027-12-18", end: "2028-01-02" },
  { name: "Hiver", start: "2028-02-05", end: "2028-02-20" },
  { name: "Printemps", start: "2028-04-08", end: "2028-04-23" },
  { name: "Été", start: "2028-07-04", end: "2028-08-31" },
];
import { weekDates } from "./dates.js";

// Pour chaque semaine ISO de l'annee, le nom des vacances si au moins un jour
// de la semaine est un jour de vacances (null sinon).
export function holidayByWeek(year, weeksInYear) {
  const out = {};
  for (let w = 1; w <= weeksInYear; w++) {
    const days = weekDates(year, w);
    for (const p of SCHOOL_HOLIDAYS) {
      const hit = days.some((d) => {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return iso >= p.start && iso <= p.end;
      });
      if (hit) { out[w] = p.name; break; }
    }
  }
  return out;
}

import { isoWeek, isoWeeksInYear, fmtShortRange } from "./dates.js";
// Segments de vacances pour l'affichage annuel : semaines contigües de meme
// nom + plage de dates ("20 fév - 7 mars"). Repères visuels de l'export.
export function holidaySegments(year) {
  const n = isoWeeksInYear(year);
  const byWeek = holidayByWeek(year, n);
  const segs = [];
  for (let w = 1; w <= n; w++) {
    const label = byWeek[w];
    if (!label) continue;
    const last = segs[segs.length - 1];
    if (last && last.label === label && last.toWeek === w - 1) last.toWeek = w;
    else segs.push({ label, fromWeek: w, toWeek: w });
  }
  for (const s of segs) {
    const periods = SCHOOL_HOLIDAYS.filter((p) => p.name === s.label).filter((p) => {
      const a = isoWeek(new Date(p.start + "T12:00")), b = isoWeek(new Date(p.end + "T12:00"));
      const weeks = new Set();
      // semaines ISO de la periode appartenant a l'annee demandee
      let d = new Date(p.start + "T12:00");
      const end = new Date(p.end + "T12:00");
      while (d <= end) { const i = isoWeek(d); if (i.year === year) weeks.add(i.week); d = new Date(d.getTime() + 86400000); }
      return weeks.has(s.fromWeek) || weeks.has(s.toWeek) || a.year === year || b.year === year;
    });
    if (periods.length) {
      const start = periods.reduce((m, p) => (p.start < m ? p.start : m), periods[0].start);
      const end = periods.reduce((m, p) => (p.end > m ? p.end : m), periods[0].end);
      s.dates = fmtShortRange(start, end);
    } else s.dates = "";
  }
  return segs;
}
