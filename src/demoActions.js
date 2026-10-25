// Actions de la DÉMO navigateur (localStorage) — même interface que liveActions.
import { update } from "./store.js";
import { checkRecoveryValidation } from "./domain/requests.js";

export const demoActions = {
  async saveTemplate(empId, tpl) { update((s) => { s.templates = { ...s.templates, [empId]: tpl }; }); },
  async saveOverride(empId, iso, day) { update((s) => { s.overrides = { ...s.overrides, [`${empId}|${iso}`]: day }; }); },
  async resetOverride(empId, iso) { update((s) => { const o = { ...s.overrides }; delete o[`${empId}|${iso}`]; s.overrides = o; }); },
  async addRecovery(empId, hours, reason) { update((s) => { s.recoveryLedger = [...s.recoveryLedger, { id: "l" + Date.now(), employeeId: empId, deltaMin: Math.round(hours * 60), reason: reason || "Heures supplémentaires", at: new Date().toISOString() }]; }); },
  async submitRequest(req) { update((s) => { s.requests = [...s.requests, { ...req, id: "r" + Date.now(), status: "pending", createdAt: new Date().toISOString() }]; }); },
  async validateRequest(r, deductMinutes) {
    update((s) => {
      const cur = s.requests.find((x) => x.id === r.id);
      if (!cur || cur.status !== "pending") return; // idempotent, comme le serveur
      cur.status = "approved";
      if (r.type === "recovery") {
        cur.deductedMin = deductMinutes || 0;
        if (cur.deductedMin > 0) s.recoveryLedger = [...s.recoveryLedger, { id: "l" + Date.now(), employeeId: r.employeeId, deltaMin: -cur.deductedMin, reason: "Récupération validée", at: new Date().toISOString() }];
      }
    });
  },
  async refuseRequest(r) { update((s) => { s.requests = s.requests.map((x) => (x.id === r.id ? { ...x, status: "rejected" } : x)); }); },
};
export { checkRecoveryValidation };
