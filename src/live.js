// Store "live" : même forme de données que la démo, mais servies par l'API
// authentifiée. Le serveur filtre selon le rôle (un salarié ne reçoit que ses
// données) ; chaque action relance un bootstrap après écriture.
import { useSyncExternalStore } from "react";
import { api } from "./api.js";

let state = null;
let listeners = [];
const emit = () => listeners.forEach((l) => l());

export async function refreshLive() {
  state = await api("/api/bootstrap");
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
