// Client de l'API (mode "live" : app servie par le serveur).
// ACCÈS COMME LA V1 : pas de connexion ni jeton. L'identité est DÉCLARÉE :
// le salarié choisit son nom (mémorisé dans son navigateur), l'admin utilise
// une adresse séparée (#/admin). Voir App.jsx et server/index.js.
// Base de l'API : window.CONGEO_API_URL (public/config.js, ex. Neon Function en
// production sur GitHub Pages) ; vide = même origine (serveur local npm start).
const BASE = (typeof window !== "undefined" && window.CONGEO_API_URL) || "";

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
}

// Sonde : l'API existe-t-elle (app servie par le serveur) ou non (démo vite) ?
export async function probe() {
  try {
    const res = await fetch(BASE + "/api/employees");
    if (res.ok && (res.headers.get("content-type") || "").includes("application/json")) return "live";
    return "demo";
  } catch { return "demo"; }
}

export async function fetchEmployees() {
  return (await api("/api/employees")).employees;
}
