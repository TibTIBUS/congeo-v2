// Périodes où les congés sont interdits — règles reprises de la V1 :
// semaine n° 1 ISO bloquée chaque année (réglage firstWeek) + périodes
// nommées (table blocks). Le dimanche est un jour de fermeture : il n'est
// jamais demandé (la V1 le retire de la période, on fait pareil).
import { parseISO, isoWeek } from "./dates.js";

export function leaveBlockedReason(dayISO, blocks = [], firstWeek = true) {
  const d = parseISO(dayISO);
  if (d.getDay() === 0) return null; // dimanche : fermeture, pas contrôlé
  if (firstWeek && isoWeek(d).week === 1) return "Semaine n° 1 bloquée";
  const b = (blocks || []).find((x) => x.start <= dayISO && x.end >= dayISO);
  return b ? b.label : null;
}
