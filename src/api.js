// Client de l'API authentifiée (mode "live" : app servie par le serveur local).
const TOKEN_KEY = "congeo-v2-token";
let token = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch { token = null; }

export function getToken() { return token; }

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
}

// Sonde : l'API existe-t-elle (app servie par le serveur) ou non (démo vite) ?
export async function probe() {
  try {
    const res = await fetch("/api/me", { headers: token ? { authorization: "Bearer " + token } : {} });
    if (res.status === 401) return "login";
    if (res.ok && (res.headers.get("content-type") || "").includes("application/json")) return "live";
    return "demo";
  } catch { return "demo"; }
}

export async function login(email, password) {
  const r = await api("/api/login", { method: "POST", body: { email, password } });
  token = r.token;
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  return r.user;
}
export async function logout() {
  try { await api("/api/logout", { method: "POST" }); } catch {}
  token = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}
