// Demandes : conges (plage de dates) et recuperation (jours ponctuels).
// Pas de decompte de jours de conges (retire le 25 oct 2026). Recuperation :
// les heures prevues au planning des jours poses sont decomptees du solde a la
// validation admin ; validation bloquee si le solde ne couvre pas (regle prudente).
import { parseISO, addDays, toISODate } from "./dates.js";
import { plannedMinutes, getDayPlan } from "./planning.js";

export function leaveDates(req) {
  // plage inclusive dateStart..dateEnd
  const out = [];
  let d = parseISO(req.dateStart);
  const end = parseISO(req.dateEnd);
  while (d <= end) { out.push(toISODate(d)); d = addDays(d, 1); }
  return out;
}
export function requestDates(req) {
  return req.type === "leave" ? leaveDates(req) : [...new Set(req.dates || [])];
}
// Heures planifiees sur les jours d'une demande de recuperation.
export function recoveryPlannedMinutes(req, templates, overrides) {
  let total = 0;
  for (const iso of requestDates(req)) {
    const d = parseISO(iso);
    total += plannedMinutes(getDayPlan(templates, overrides, req.employeeId, d));
  }
  return total;
}
// Validation : retourne {ok, deductMinutes, reason?}
export function checkRecoveryValidation(req, templates, overrides, balanceMin) {
  const need = recoveryPlannedMinutes(req, templates, overrides);
  if (need > balanceMin) {
    return { ok: false, deductMinutes: 0, reason: "Solde insuffisant : la validation est bloquee tant que le solde ne couvre pas les heures prevues, pour ne perdre aucune heure." };
  }
  return { ok: true, deductMinutes: need };
}
