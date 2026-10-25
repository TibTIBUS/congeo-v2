// Store "live" : même forme de données que la démo, mais servies par l'API.
// Identité DÉCLARÉE (modèle V1, pas de connexion) : ?employee=<id> pour un
// salarié, ?as=admin depuis l'adresse admin séparée. Chaque action relance
// un bootstrap après écriture.
import { useSyncExternalStore } from "react";
import { api } from "./api.js";

let state = null;
let identity = null; // { admin: true } ou { employeeId }
let listeners = [];
const emit = () => listeners.forEach((l) => l());

export function setIdentity(id) {
  // Changement d'identité (salarié -> admin ou inverse) : NE JAMAIS réutiliser
  // le bootstrap de l'autre portée — l'admin doit voir les 10 salariés, le
  // salarié seulement les siennes. On repart de « Chargement… ».
  const changed = JSON.stringify(id) !== JSON.stringify(identity);
  identity = id;
  if (changed) { state = null; emit(); }
}
export async function refreshLive() {
  if (!identity) return;
  state = await api(identity.admin ? "/api/bootstrap?as=admin" : `/api/bootstrap?employee=${encodeURIComponent(identity.employeeId)}`);
  emit();
}
export function useLive() {
  return useSyncExternalStore(
    (l) => { listeners.push(l); return () => { listeners = listeners.filter((x) => x !== l); }; },
    () => state,
    () => state
  );
}
export const liveActions = {
  async saveTemplate(empId, tpl) { await api(`/api/templates/${empId}`, { method: "PUT", body: tpl }); await refreshLive(); },
  async saveOverride(empId, iso, day) { await api(`/api/overrides/${empId}/${iso}`, { method: "PUT", body: day }); await refreshLive(); },
  async resetOverride(empId, iso) { await api(`/api/overrides/${empId}/${iso}`, { method: "DELETE" }); await refreshLive(); },
  async addRecovery(empId, hours, reason) { await api("/api/recovery", { method: "POST", body: { employeeId: empId, deltaMin: Math.round(hours * 60), reason } }); await refreshLive(); },
  async submitRequest(req) { await api("/api/requests", { method: "POST", body: req }); await refreshLive(); },
  async validateRequest(r) { await api(`/api/requests/${r.id}/validate`, { method: "POST" }); await refreshLive(); },
  async refuseRequest(r) { await api(`/api/requests/${r.id}/reject`, { method: "POST" }); await refreshLive(); },
};
