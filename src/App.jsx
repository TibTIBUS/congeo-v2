import React, { useEffect, useState } from "react";
import { useStore, resetAll } from "./store.js";
import { demoActions } from "./demoActions.js";
import { probe, fetchEmployees } from "./api.js";
import { useLive, refreshLive, liveActions, setIdentity } from "./live.js";
import EmployeeView from "./ui/EmployeeView.jsx";
import AdminView from "./ui/AdminView.jsx";

function Topbar({ children, subtitle }) {
  return <div className="topbar">
    <div className="logo">C</div>
    <div className="brand" style={{ flex: 1 }}>
      <div className="apptitle" style={{ fontWeight: 800, fontSize: 16 }}>Congéo <span style={{ fontSize: 11, opacity: .8 }}>V2 · prototype</span></div>
      <div className="subtitle" style={{ fontSize: 11, opacity: .75 }}>{subtitle}</div>
    </div>
    {children}
  </div>;
}

const NAME_KEY = "congeo-v2-qui"; // nom choisi, conservé dans CE navigateur (comme la V1)

function NamePicker({ onOk }) {
  const [employees, setEmployees] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { fetchEmployees().then(setEmployees).catch((e) => setErr(e.message)); }, []);
  return <div>
    <Topbar subtitle="L'Échoppe du Marché (données fictives)" />
    <div className="proto">Version de test : même fonctionnement que la V1 — tu choisis ton nom, il n'y a pas de connexion. Données fictives.</div>
    <div className="wrap" style={{ maxWidth: 420 }}>
      <h1>Qui es-tu ?</h1>
      <div className="card" style={{ padding: 16, display: "grid", gap: 8, marginTop: 10 }}>
        {err && <div style={{ color: "var(--no)", fontSize: 12.5 }}>{err}</div>}
        {!employees && !err && <div className="mut">Chargement…</div>}
        {employees && employees.map((e) => (
          <button key={e.id} className="btn ghost" style={{ textAlign: "left", padding: "10px 12px" }} onClick={() => { try { localStorage.setItem(NAME_KEY, e.id); } catch {} onOk(e.id); }}>
            {e.name}
          </button>
        ))}
      </div>
      <div className="mut" style={{ fontSize: 11.5, marginTop: 8 }}>Ton choix reste sur cet appareil. L'administration se trouve à une adresse séparée, comme en V1.</div>
    </div>
  </div>;
}

function LiveApp() {
  const data = useLive();
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => { const f = () => setHash(location.hash); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  const isAdmin = hash.replace(/^#\/?/, "").startsWith("admin");
  const [who, setWho] = useState(() => { try { return localStorage.getItem(NAME_KEY); } catch { return null; } });
  useEffect(() => {
    setIdentity(isAdmin ? { admin: true } : who ? { employeeId: who } : null);
    refreshLive().catch(() => {});
  }, [isAdmin, who]);
  if (!isAdmin && !who) return <NamePicker onOk={setWho} />;
  if (!data) return <div className="wrap">Chargement…</div>;
  if (isAdmin) {
    return <div>
      <Topbar subtitle="L'Échoppe du Marché (données fictives)">
        <span className="chip" style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff" }}><b>Administration</b></span>
      </Topbar>
      <div className="proto">Version de test : adresse d'administration séparée (comme la V1), sans connexion. Données fictives.</div>
      <div className="wrap"><AdminView data={data} actions={liveActions} /></div>
    </div>;
  }
  const emp = data.employees.find((e) => e.id === who);
  if (!emp) { try { localStorage.removeItem(NAME_KEY); } catch {} return <NamePicker onOk={setWho} />; }
  return <div>
    <Topbar subtitle="L'Échoppe du Marché (données fictives)">
      <span className="chip" style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff" }}><b>{emp.name}</b></span>
      <button className="btn ghost" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => { try { localStorage.removeItem(NAME_KEY); } catch {} setWho(null); }}>Changer de nom</button>
    </Topbar>
    <div className="proto">Version de test : comme la V1, tu vois ton planning après avoir choisi ton nom — ce n'est pas une connexion. Données fictives.</div>
    <div className="wrap"><EmployeeView data={data} employee={emp} actions={liveActions} /></div>
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
      Comme la V1, la version en ligne garde le choix du nom, sans connexion ; l'admin reste à une adresse séparée.
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
  if (mode === "live") return <LiveApp />;
  return <DemoApp />;
}
