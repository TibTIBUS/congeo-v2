// Dates et semaines ISO-8601. La parite du numero de semaine ISO fait foi,
// y compris au changement d'annee (S53 et S1 peuvent etre toutes deux impaires).
export const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export const DAY_NAMES_LONG = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export function parseISO(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function toISODate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
// Semaine ISO : {year, week}. Jeudi de la semaine determine l'annee ISO.
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // jeudi
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const ftDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDayNum + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 86400000));
  return { year: d.getUTCFullYear(), week };
}
export function isoWeeksInYear(year) {
  // 53 si le 1er janvier est un jeudi, ou le 31 decembre un jeudi (annee bissextile)
  const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return jan1 === 4 || (leap && jan1 === 3) ? 53 : 52;
}
export function mondayOfISOWeek(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayNum = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayNum + (week - 1) * 7);
  return new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate());
}
export function weekDates(year, week) {
  const mon = mondayOfISOWeek(year, week);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}
export function parityOf(iso) { return iso.week % 2 === 0 ? "paire" : "impaire"; }
export function dayLabel(date) { return `${DAY_NAMES[(date.getDay() + 6) % 7]} ${date.getDate()}`; }
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export function fmtDate(date) { return `${date.getDate()} ${MOIS[date.getMonth()]}`; }
export function fmtShortRange(startISO, endISO) {
  const a = parseISO(startISO), b = parseISO(endISO);
  return `${a.getDate()} ${MOIS[a.getMonth()]} - ${b.getDate()} ${MOIS[b.getMonth()]}`;
}
export function fmtRange(monday) {
  const sunday = addDays(monday, 6);
  return `${monday.getDate()} ${MOIS[monday.getMonth()]} – ${sunday.getDate()} ${MOIS[sunday.getMonth()]} ${sunday.getFullYear()}`;
}
