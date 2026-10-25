// Store de la DEMO navigateur : localStorage derriere une couche unique.
// Le SERVEUR local authentifie (server/) applique les memes regles avec controle
// des roles cote serveur ; la base Postgres dediee remplacera ces deux couches.
import { useSyncExternalStore } from "react";
import { seed } from "./domain/seedData.js";

const KEY = "congeo-v2-data-v3"; // v3 : badges O/F des gabarits fictifs alignes sur la regle 2 O / 2 F
let listeners = [];
let state = null;

function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? JSON.parse(raw) : seed();
  } catch { state = seed(); }
  return state;
}
function persist() { localStorage.setItem(KEY, JSON.stringify(state)); }
export function getState() { return load(); }
export function update(fn) {
  fn(state = { ...load() });
  persist();
  listeners.forEach((l) => l());
}
export function resetAll() { state = seed(); persist(); listeners.forEach((l) => l()); }
export function useStore() {
  return useSyncExternalStore(
    (l) => { listeners.push(l); return () => { listeners = listeners.filter((x) => x !== l); }; },
    () => { load(); return state; },
    () => { load(); return state; }
  );
}
export function recoveryBalance(data, employeeId) {
  return data.recoveryLedger.filter((l) => l.employeeId === employeeId).reduce((s, l) => s + l.deltaMin, 0);
}
