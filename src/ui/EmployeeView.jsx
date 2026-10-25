import React, { useState } from "react";
import { isoWeek, weekDates, parityOf, dayLabel, fmtRange, toISODate, addDays, mondayOfISOWeek, parseISO, fmtDate } from "../domain/dates.js";
import { getWeekPlan, plannedMinutes } from "../domain/planning.js";
import { recoveryBalance } from "../store.js";
import { requestDates } from "../domain/requests.js";
import { Badges, Status, PariteBadge, WeekNav, Hm, fmtRanges } from "./bits.jsx";

export default function EmployeeView({ data, employee, actions }) {
  const today = new Date();
  const [wk, setWk] = useState(() => isoWeek(today));
  const [type, setType] = useState("leave");
  const [d1, setD1] = useState(""); const [d2, setD2] = useState("");
  const plans = getWeekPlan(data.templates, data.overrides, employee.id, wk.year, wk.week);

  const bal = recoveryBalance(data, employee.id);
  const myLeaves = new Set();
  data.requests.filter((r) => r.employeeId === employee.id && r.type === "leave" && r.status === "approved")
    .forEach((r) => requestDates(r).forEach((x) => myLeaves.add(x)));
  const myRecoveryDays = new Set();
  data.requests.filter((r) => r.employeeId === employee.id && r.type === "recovery" && r.status === "approved")
    .forEach((r) => r.dates.forEach((x) => myRecoveryDays.add(x)));
  const myReqs = data.requests.filter((r) => r.employeeId === employee.id).slice().reverse();
  const move = (n) => { const m = addDays(mondayOfISOWeek(wk.year, wk.week), n * 7); setWk(isoWeek(m)); };
  const submit = async () => {
    if (!d1 || (type === "leave" && !d2)) return;
    const req = type === "leave"
      ? { employeeId: employee.id, type, dateStart: d1, dateEnd: d2 }
      : { employeeId: employee.id, type, dates: [d1] };
    await actions.submitRequest(req); // en mode live, l'employeeId est imposé par le serveur
    setD1(""); setD2("");
  };
  return <div style={{ maxWidth: 520, margin: "0 auto" }}>
    <WeekNav onPrev={() => move(-1)} onNext={() => move(1)}>
      <div style={{ fontWeight: 800, fontSize: 17 }}>{fmtRange(weekDates(wk.year, wk.week)[0])}</div>
      <PariteBadge parite={parityOf(wk)} week={wk.week} />
    </WeekNav>
    {plans.map((p, i) => {
      const iso = toISODate(p.date);
      const onLeave = myLeaves.has(iso), onRec = myRecoveryDays.has(iso);
      return <div key={i} className={`card daycard ${onLeave || onRec ? "conge" : ""}`}>
        <div>
          <div className="mut" style={{ fontSize: 11 }}>{dayLabel(p.date)} {p.date.toLocaleDateString("fr-FR", { month: "short" })}</div>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>
            {onLeave ? "Congé" : onRec ? "Récupération" : p.worked ? fmtRanges(p) : "Repos"}
          </div>
        </div>
        {!onLeave && !onRec && <Badges d={p} />}
      </div>;
    })}
    <div className="card" style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--soft)", display: "grid", placeItems: "center", fontSize: 17 }}>⏱</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mut)" }}>HEURES À RÉCUPÉRER</div>
        <Hm min={bal} strong />
      </div>
      <div className="mut" style={{ fontSize: 10.5, textAlign: "right", lineHeight: 1.4 }}>Décomptées à chaque<br />récupération validée</div>
    </div>

    <h2>Poser une demande</h2>
    <div className="card" style={{ padding: 14, display: "grid", gap: 9 }}>
      <div className="formrow">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="leave">Congés</option>
          <option value="recovery">Journée de récupération</option>
        </select>
        <input type="date" value={d1} onChange={(e) => setD1(e.target.value)} />
        {type === "leave" && <input type="date" value={d2} onChange={(e) => setD2(e.target.value)} />}
      </div>
      <div className="mut" style={{ fontSize: 11.5 }}>
        {type === "recovery"
          ? "Les heures prévues ce jour-là à ton planning seront décomptées de ton solde quand l'admin valide."
          : "Ta demande part à l'admin pour validation."}
      </div>
      <div><button className="btn" onClick={submit} disabled={!d1 || (type === "leave" && !d2)}>Envoyer la demande</button></div>
    </div>

    <h2>Mes demandes</h2>
    {myReqs.length === 0 && <div className="mut" style={{ fontSize: 13 }}>Aucune demande pour l'instant.</div>}
    {myReqs.map((r) => <div key={r.id} className="card" style={{ padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontSize: 13 }}>
        <b>{r.type === "leave" ? "Congés" : "Récupération"}</b>{" · "}
        {r.type === "leave" ? `du ${fmtDate(parseISO(r.dateStart))} au ${fmtDate(parseISO(r.dateEnd))}` : r.dates.map((x) => fmtDate(parseISO(x))).join(", ")}
        {r.type === "recovery" && r.status === "approved" && r.deductedMin ? <span className="mut"> ({fmtMinutes(r.deductedMin)} décomptées)</span> : null}
      </div>
      <Status s={r.status} />
    </div>)}
  </div>;
}
function fmtMinutes(min) { const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`; }
