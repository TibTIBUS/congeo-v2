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
  return req.type === "leave" || req.type === 'sick' ? leaveDates(req) : [...new Set(req.dates || [])];
}
// Types d'absence poses par journees ponctuelles (dates[]) : recuperation
// horaire (decomptee du solde) et « autre recuperation / jour ferie »
// (jamais decomptee du compteur horaire).
export const RECOVERY_OTHER = 'recovery_other';
export const isDatedAbsence = (type) => type === 'recovery' || type === RECOVERY_OTHER;
// Solde de recuperation « a renseigner » : tant que la gerante n'a pas
// enregistre le solde d'un salarie (action hoursSetBalance), il est INCONNU —
// jamais affiche ni traite comme 0 h confirme — et les nouvelles validations
// de recuperation horaire sont suspendues (decision Aline, 19 nov 2026).
export const RECOVERY_KNOWN_KEY = 'recoveryKnown';
export function balanceKnownMap(db) {
  try { return JSON.parse(db.settings?.[RECOVERY_KNOWN_KEY] || '{}'); } catch { return {}; }
}
export const isBalanceKnown = (db, emp) => balanceKnownMap(db)[emp] === true;
export function markBalanceKnown(db, emp) {
  db.settings ??= {};
  const map = balanceKnownMap(db);
  if (map[emp] === true) return;
  map[emp] = true;
  db.settings[RECOVERY_KNOWN_KEY] = JSON.stringify(map);
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
// balanceKnown=false : solde « a renseigner » — la validation est suspendue
// (pas un 0 h confirme) tant que la gerante n'a pas enregistre le solde.
export function checkRecoveryValidation(req, templates, overrides, balanceMin, balanceKnown = true) {
  const need = recoveryPlannedMinutes(req, templates, overrides);
  if (!balanceKnown) {
    return { ok: false, deductMinutes: 0, reason: "Solde de recuperation a renseigner : la validation est suspendue tant que la gerante n'a pas enregistre le solde de ce salarie." };
  }
  if (need > balanceMin) {
    return { ok: false, deductMinutes: 0, reason: "Solde insuffisant : la validation est bloquee tant que le solde ne couvre pas les heures prevues, pour ne perdre aucune heure." };
  }
  return { ok: true, deductMinutes: need };
}
