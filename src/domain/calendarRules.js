const months = ["Janvier", "F\xE9vrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Ao\xFBt", "Septembre", "Octobre", "Novembre", "D\xE9cembre"];
const iso = (d) => d.toISOString().slice(0, 10);
const parse = (s) => /* @__PURE__ */ new Date(s + "T12:00:00Z");
function validDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parse(s).getTime()) && iso(parse(s)) === s;
}
function workdays(start, end) {
  if (!validDate(start) || !validDate(end) || end < start) throw new Error("Choisissez une p\xE9riode valide.");
  const days = [];
  const d = parse(start);
  for (let i = 0; iso(d) <= end; i++) {
    if (i >= 370) throw new Error("La p\xE9riode ne peut pas d\xE9passer un an.");
    if (d.getUTCDay() !== 0) days.push(iso(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  if (!days.length) throw new Error("Le dimanche est un jour de fermeture.");
  return days;
}
function weekNumber(s) {
  const d = parse(s);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
function weekPeriod(s) {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  const start = iso(d);
  d.setUTCDate(d.getUTCDate() + 5);
  return { start, end: iso(d) };
}
const defaultBlocks = [{ id: "noel-2026", label: "Vacances de No\xEBl \xB7 zone B", start: "2026-12-19", end: "2027-01-03" }];
function blockedReason(day, blocks, firstWeek) {
  if (parse(day).getUTCDay() === 0) return "Dimanche \xB7 magasin ferm\xE9";
  if (firstWeek && weekNumber(day) === 1) return "Semaine n\xB0 1";
  return blocks.find((b) => b.start <= day && b.end >= day)?.label || "";
}
function dateLabel(s) {
  return parse(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
}
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
export {
  blockedReason,
  dateLabel,
  defaultBlocks,
  iso,
  months,
  parse,
  today,
  validDate,
  weekNumber,
  weekPeriod,
  workdays
};
