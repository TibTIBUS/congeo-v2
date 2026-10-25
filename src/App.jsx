import React, { useEffect, useState } from "react";
import { useStore, resetAll } from "./store.js";
import { demoActions } from "./demoActions.js";
import { probe, login, logout } from "./api.js";
import { useLive, refreshLive, liveActions } from "./live.js";
import EmployeeView from "./ui/EmployeeView.jsx";
import AdminView from "./ui/AdminView.jsx";

function Topbar({ children, subtitle }) {
  return <div className="topbar">
    <div className="logo">C</div>
    <div style={{ flex: 1 }}>
      <div className="apptitle" style={{ fontWeight: 800, fontSize: 16 }}>Congéo <span style={{ fontSize: 11, opacity: .8 }}>V2 · prototype</span></div>
      <div className="subtitle" style={{ fontSize: 11, opacity: .75 }}>{subtitle}</div>
    </div>
    {children}
  </div>;
}

function Login({ onOk }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr("");
    try { await login(email.trim(), password); await refreshLive(); onOk(); }
    catch (e) { setErr(e.message || "Connexion impossible"); }
    finally { setBusy(false); }
  };
  return <div>
    <Topbar subtitle="L'Échoppe du Marché (données fictives)" />
    <div className="proto">Version de test locale authentifiée : les droits sont appliqués côté serveur. Données fictives, rien de déployé.</div>
    <div className="wrap" style={{ maxWidth: 420 }}>
      <h1>Connexion</h1>
      <div className="card" style={{ padding: 16, display: "grid", gap: 10, marginTop: 10 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12.5, fontWeight: 700 }}>Email
          <input type="email" value={email} autoComplete="username" onChange={(e) => setEmail(e.target.value)} placeholder="prenom@echoppe.test" />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12.5, fontWeight: 700 }}>Mot de passe
          <input type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        {err && <div style={{ color: "var(--no)", fontSize: 12.5 }}>{err}</div>}
        <div><button className="btn" onClick={submit} disabled={busy || !email || !password}>Se connecter</button></div>
        <div className="mut" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
          Comptes fictifs de test — admin : <code>admin@echoppe.test / demo-admin</code> · salarié : <code>hugo@echoppe.test / demo-hugo</code> (idem emma, lea, tom, ines).
        </div>
      </div>
    </div>
  </div>;
}

function LiveApp() {
  const data = useLive();
  const [, force] = useState(0);
  useEffect(() => { refreshLive().catch(() => force((x) => x + 1)); }, []);
  if (!data || !data.me) return <div className="wrap">Chargement…</div>;
  const me = data.me;
  const emp = me.employeeId ? data.employees.find((e) => e.id === me.employeeId) : null;
  return <div>
    <Topbar subtitle="L'Échoppe du Marché (données fictives)">
      <span className="chip" style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff" }}><b>{me.name}</b> · {me.role === "admin" ? "admin" : "salarié"}</span>
      <button className="btn ghost" style={{ fontSize: 12, padding: "6px 10px" }} onClick={async () => { await logout(); location.reload(); }}>Déconnexion</button>
    </Topbar>
    <div className="proto">Version de test locale authentifiée : droits appliqués côté serveur{me.role !== "admin" ? " — tu ne vois que ton planning" : ""}. Données fictives, rien de déployé.</div>
    <div className="wrap">
      {me.role === "admin" ? <AdminView data={data} actions={liveActions} /> : emp ? <EmployeeView data={data} employee={emp} actions={liveActions} /> : <div>Compte sans fiche salarié.</div>}
    </div>
  </div>;
}

function DemoApp() {
  const data = useStore();
  const [who, setWho] = useState(() => { // "admin" ou employeeId — selecteur de TEST
    const h = location.hash.replace(/^#\/?/, "");
    return h.startsWith("emp/") ? h.slice(4) : "admin";
  });
  const emp = data.employees.find((e) => e.id === who);
  return <div>
    <Topbar subtitle="L'Échoppe du Marché (données fictives)">
      <select value={who} onChange={(e) => setWho(e.target.value)}>
        <option value="admin">Vue admin</option>
        {data.employees.map((e) => <option key={e.id} value={e.id}>{e.name} (salarié)</option>)}
      </select>
      <button className="btn ghost" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => { if (confirm("Réinitialiser les données fictives ?")) resetAll(); }}>Réinitialiser</button>
    </Topbar>
    <div className="proto">
      Prototype de test local : les données restent dans ce navigateur et le sélecteur ci-dessus change de vue pour les tests — ce n'est pas une connexion.
      Dans la vraie V2, chaque salarié ne verra que son planning, appliqué côté serveur.
    </div>
    <div className="wrap">
      {who === "admin" ? <AdminView data={data} actions={demoActions} /> : <EmployeeView data={data} employee={emp} actions={demoActions} />}
    </div>
  </div>;
}

export default function App() {
  const [mode, setMode] = useState("loading");
  useEffect(() => { probe().then(setMode); }, []);
  if (mode === "loading") return null;
  if (mode === "login") return <Login onOk={() => setMode("live")} />;
  if (mode === "live") return <LiveApp />;
  return <DemoApp />;
}
