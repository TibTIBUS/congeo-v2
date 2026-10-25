// Planning : gabarits semaines paire/impaire par salarie, plan hebdo genere
// selon la parite ISO, ajustable jour par jour (overrides).
// day = { worked, start:"HH:MM", end:"HH:MM", pauseStart:"HH:MM"|null, pauseEnd:"HH:MM"|null, open:bool, close:bool }
// La pause du midi est definie par ses horaires de debut et fin (demande de Thibaut, 25 oct) ;
// elle est visible au planning et deduite des heures travaillees et des recuperations.
import { toISODate, weekDates, parityOf, isoWeek } from "./dates.js";
import {approvedAbsences} from './sickLeave.js';

export const SHOP_DAYS = [0, 1, 2, 3, 4, 5]; // lundi-samedi ; dimanche ferme

export function getDayPlan(templates, overrides, employeeId, date) {
  const iso = toISODate(date);
  const wd = (date.getDay() + 6) % 7;
  const key = `${employeeId}|${iso}`;
  if (overrides[key]) return overrides[key];
  const p = parityOf(isoWeek(date));
  const t = templates[employeeId]?.[p]?.[wd];
  return t || { worked: false, start: null, end: null, pauseStart: null, pauseEnd: null, open: false, close: false };
}
export function getWeekPlan(templates, overrides, employeeId, year, week) {
  return weekDates(year, week).map((d) => ({ date: d, ...getDayPlan(templates, overrides, employeeId, d) }));
}
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
export function pauseMinutes(day) {
  if (!day.pauseStart || !day.pauseEnd) return 0;
  return Math.max(0, toMin(day.pauseEnd) - toMin(day.pauseStart));
}
export function plannedMinutes(day) {
  if (!day.worked || !day.start || !day.end) return 0;
  return Math.max(0, toMin(day.end) - toMin(day.start) - pauseMinutes(day));
}
export function fmtHours(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}
// Horaires du magasin (Thibaut, 25 oct 12h41) : memes horaires tous les jours.
// Les coches O/F sont une simple INDICATION : les salaries d'ouverture/fermeture
// sont legerement presents avant/apres, sans controle a la minute.
export const STORE_HOURS_LABEL = "9h00 – 12h30 / 14h00 – 19h00";
// Couverture d'un jour : au moins 2 salaries a l'ouverture ET 2 a la fermeture
// (regle de Thibaut, 25 oct 12h27). O et F sont cumulables le meme jour.
// Alerte visuelle seulement, jamais de blocage (annonce au user le 25 oct 12h36+).
export const MIN_COVERAGE = 2;
export function dayCoverage(plansByEmployee, dayIdx) {
  let o = 0, f = 0;
  for (const plans of Object.values(plansByEmployee)) {
    const d = plans[dayIdx];
    if (!d || !d.worked) continue;
    if (d.open) o++;
    if (d.close) f++;
  }
  return { openings: o, closings: f, coveredO: o >= MIN_COVERAGE, coveredF: f >= MIN_COVERAGE };
}
// Bandeau semaine : "x/6 ouvertures couvertes", alerte par jour sous le seuil.
export function weekCoverage(plansByEmployee,days=SHOP_DAYS) {
  let covO = 0, covF = 0;
  const warnings = [];
  for (const idx of days) {
    const c = dayCoverage(plansByEmployee, idx);
    if (c.coveredO) covO++;
    if (c.coveredF) covF++;
    if (c.openings < MIN_COVERAGE) warnings.push({ dayIdx: idx, kind: "O", count: c.openings });
    if (c.closings < MIN_COVERAGE) warnings.push({ dayIdx: idx, kind: "F", count: c.closings });
  }
  return { openingsCovered: covO, closingsCovered: covF, days: days.length, warnings };
}

// Presence reflects approved absences, while templates remain unchanged.
export function effectiveWeekPlan(data,employeeId,year,week){
 const absences=approvedAbsences(data).filter(r=>r.employeeId===employeeId);
 return getWeekPlan(data.templates,data.overrides,employeeId,year,week).map(d=>{
  const day=toISODate(d.date),absent=absences.some(r=>r.type==='recovery'?(r.dates||[]).includes(day):r.dateStart<=day&&r.dateEnd>=day);
  return absent?{...d,worked:false,open:false,close:false}:d;
 });
}
