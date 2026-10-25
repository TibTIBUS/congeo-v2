import React, { useState } from "react";
import Gabarits from "./TemplateEditor";
export {Gabarits};
import { isoWeek, weekDates, parityOf, fmtRange, toISODate, addDays, mondayOfISOWeek, DAY_NAMES, isoWeeksInYear, parseISO, fmtDate } from "../domain/dates.js";

const fmtDateFr = (iso) => fmtDate(parseISO(iso));
import { STORE_HOURS_LABEL, effectiveWeekPlan, getWeekPlan, plannedMinutes, dayCoverage, MIN_COVERAGE, weekCoverage, fmtHours, SHOP_DAYS } from "../domain/planning.js";
import { recoveryBalance } from "../store.js";
import { checkRecoveryValidation, requestDates, recoveryPlannedMinutes } from "../domain/requests.js";
import { buildMatrix, buildXlsx } from "../domain/exportXlsx.js";
import { holidaySegments } from "../domain/schoolHolidays.js";
import { Badges, Status, PariteBadge, WeekNav, fmtRanges } from "./bits.jsx";

const OFF = { worked: false, start: null, end: null, pauseStart: null, pauseEnd: null, open: false, close: false };

export default function AdminView({ data, actions, fictif = false }) {
  const [tab, setTab] = useState(() => {
    const h = location.hash.replace(/^#\/?/, "");
    return h.startsWith("admin/") && ["planning", "gabarits", "demandes", "export"].includes(h.slice(6)) ? h.slice(6) : "planning";
  });
  return <div>
    <div className="tabs">
      {[["planning", "Planning"], ["gabarits", "Semaines paire/impaire"], ["demandes", "Demandes"], ["export", "Export annuel"]].map(([k, l]) =>
        <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}
    </div>
    {tab === "planning" && <Planning data={data} actions={actions} fictif={fictif} />}
    {tab === "gabarits" && <Gabarits data={data} actions={actions} />}
    {tab === "demandes" && <Demandes data={data} actions={actions} />}
    {tab === "export" && <Export data={data} />}
  </div>;
}

export function Planning({data,actions}){
 const [wk,setWk]=useState(()=>isoWeek(new Date())),[edit,setEdit]=useState(null);
 const dates=weekDates(wk.year,wk.week),plansBy={},scheduledBy={};
 for(const e of data.employees){plansBy[e.id]=effectiveWeekPlan(data,e.id,wk.year,wk.week);scheduledBy[e.id]=getWeekPlan(data.templates,data.overrides,e.id,wk.year,wk.week);}
 const cov=weekCoverage(plansBy),warningDays=new Set(cov.warnings.map(w=>w.dayIdx));
 const move=n=>setWk(isoWeek(addDays(mondayOfISOWeek(wk.year,wk.week),n*7)));
 const absence=(emp,day)=>data.requests.find(r=>r.employeeId===emp&&r.status==='approved'&&requestDates(r).includes(day));
 return <div className="team-planning"><div className="team-week-heading"><div><h2>{fmtRange(dates[0])}</h2><p className="muted">Semaine {wk.week} · {parityOf(wk)}</p></div><WeekNav onPrev={()=>move(-1)} onNext={()=>move(1)}><button className="textbtn" onClick={()=>setWk(isoWeek(new Date()))}>Cette semaine</button></WeekNav></div>
 <div className="coverage-summary"><span>{data.employees.length} salariés</span><span>Ouvertures couvertes : <strong>{cov.openingsCovered}/{cov.days}</strong></span><span>Fermetures couvertes : <strong>{cov.closingsCovered}/{cov.days}</strong></span></div>
 {warningDays.size>0?<div className="coverage-notice" role="status"><strong>⚠ {warningDays.size} journée{warningDays.size>1?'s':''} à compléter</strong><span>Les alertes figurent sous chaque jour. Prévoyez au moins {MIN_COVERAGE} personnes à l’ouverture et {MIN_COVERAGE} à la fermeture.</span></div>:<div className="coverage-notice complete" role="status">Toutes les ouvertures et fermetures sont couvertes cette semaine.</div>}
 <div className="team-grid-wrap"><table className="team-grid"><colgroup><col className="employee-col"/>{SHOP_DAYS.map(i=><col key={i}/>)}</colgroup><thead><tr><th scope="col" className="team-employee-head">Salarié</th>{SHOP_DAYS.map(i=>{const c=dayCoverage(plansBy,i);return <th scope="col" key={i} className={warningDays.has(i)?'day-needs-coverage':''}><span className="team-day-heading">{dates[i].toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'short'})}</span><CoverageStatus label="Ouverture" count={c.openings}/><CoverageStatus label="Fermeture" count={c.closings}/></th>;})}</tr></thead>
 <tbody>{data.employees.map(e=><tr key={e.id} style={{'--employee-color':e.color}}><th scope="row" className="team-person"><span className="employee-color-dot" style={{background:e.color}}/><span>{e.name}{e.role&&<small>{e.role}</small>}</span></th>{SHOP_DAYS.map(i=>{const day=toISODate(dates[i]),p=plansBy[e.id][i],a=absence(e.id,day);return <td key={day} className={a?'conge':''}><button type="button" className="team-shift" aria-label={e.name+' · '+dates[i].toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})+' · '+(a?(a.type==='recovery'?'Récupération':'Congé'):p.worked?fmtRanges(p):'Repos')+' · Modifier la journée'} onClick={()=>setEdit({empId:e.id,iso:day,day:{...scheduledBy[e.id][i]}})}>{a?<span className="absence-label">{a.type==='recovery'?'Récupération':'Congé'}</span>:p.worked?<><span className="team-shift-times">{fmtRanges(p).split(' / ').map(t=><span key={t}>{t}</span>)}</span><Badges d={p}/></>:<span className="muted">Repos</span>}</button></td>;})}</tr>)}</tbody></table></div>
 <p className="team-planning-help">Cliquez sur une journée pour modifier ses horaires et désigner les personnes d’ouverture ou de fermeture. Les salariés en congé ou en récupération ne sont pas comptés dans la couverture. Dimanche fermé.</p>
 {edit&&<DayEditor key={edit.empId+edit.iso} data={data} actions={actions} edit={edit} onClose={()=>setEdit(null)}/>}
 </div>;
}
function CoverageStatus({label,count}){
 const missing=Math.max(0,MIN_COVERAGE-count);
 return <span className={'coverage-status '+(missing?(count?'short':'unassigned'):'covered')}><span>{missing?'⚠':'✓'} {label} : <b>{count} / {MIN_COVERAGE}</b></span>{missing>0&&<small>{missing} personne{missing>1?'s':''} à désigner</small>}</span>;
}

function DayEditor({ data, actions, edit, onClose }) {
  const [d, setD] = useState(edit.day);
  const [err, setErr] = useState("");
  const emp = data.employees.find((e) => e.id === edit.empId);
  const set = (k, v) => setD({ ...d, [k]: v });
  const save = async () => {
    // Ne jamais prétendre une sauvegarde réussie : validation claire AVANT
    // l'appel (la V1 refuse un jour travaillé sans horaires), affichage de
    // l'erreur serveur sinon, saisie conservée dans les deux cas.
    if (d.worked && (!d.start || !d.end)) { setErr("Indique une heure de début et une heure de fin (ou décoche « Travaillé »)."); return; }
    try { await actions.saveOverride(edit.empId, edit.iso, d); onClose(); }
    catch (e) { setErr(e.message || "Enregistrement impossible, réessaie."); }
  };
  const reset = async () => { await actions.resetOverride(edit.empId, edit.iso); onClose(); };
  return <div className="card" style={{ padding: 14, marginTop: 12, borderColor: "var(--pri)" }}>
    <b>{emp.name} · {edit.iso}</b>
    <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 9, flexWrap: "wrap" }}>
      <label><input type="checkbox" checked={d.worked} onChange={(e) => set("worked", e.target.checked)} /> Travaillé</label>
      <input type="time" value={d.start || ""} onChange={(e) => set("start", e.target.value)} disabled={!d.worked} />
      <input type="time" value={d.end || ""} onChange={(e) => set("end", e.target.value)} disabled={!d.worked} />
      <label className="mut" style={{ fontSize: 12, display: "flex", gap: 5, alignItems: "center" }}>Pause <input type="time" value={d.pauseStart || ""} onChange={(e) => set("pauseStart", e.target.value || null)} disabled={!d.worked} /> → <input type="time" value={d.pauseEnd || ""} onChange={(e) => set("pauseEnd", e.target.value || null)} disabled={!d.worked} /></label>
      <label><input type="checkbox" checked={d.open} onChange={(e) => set("open", e.target.checked)} disabled={!d.worked} /> Ouverture</label>
      <label><input type="checkbox" checked={d.close} onChange={(e) => set("close", e.target.checked)} disabled={!d.worked} /> Fermeture</label>
      <button className="btn" onClick={save}>Enregistrer</button>
      <button className="btn ghost" onClick={reset}>Revenir au gabarit</button>
      <button className="btn ghost" onClick={onClose}>Annuler</button>
    </div>
    {err && <div role="alert" style={{ color: "var(--no)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
  </div>;
}

function Demandes({ data, actions }) {
  const pending = data.requests.filter((r) => r.status === "pending");
  const done = data.requests.filter((r) => r.status !== "pending").slice().reverse();
  const name = (id) => data.employees.find((e) => e.id === id)?.name || id;
  const [err, setErr] = useState("");
  const validate = async (r) => {
    if (r.type === "recovery") {
      const bal = recoveryBalance(data, r.employeeId);
      const chk = checkRecoveryValidation(r, data.templates, data.overrides, bal);
      if (!chk.ok) return; // bloque, bouton desactive de toute facon
      try { await actions.validateRequest(r, chk.deductMinutes); } catch (e) { setErr(e.message); }
    } else {
      try { await actions.validateRequest(r, 0); } catch (e) { setErr(e.message); }
    }
  };
  const refuse = async (r) => { try { await actions.refuseRequest(r); } catch (e) { setErr(e.message); } };
  const Row = ({ r }) => {
    const bal = recoveryBalance(data, r.employeeId);
    const chk = r.type === "recovery" ? checkRecoveryValidation(r, data.templates, data.overrides, bal) : null;
    return <div className="card" style={{ padding: "11px 14px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13.5 }}>
          <b>{name(r.employeeId)}</b> · {r.type === "leave" ? "Congés" : "Récupération"} ·{" "}
          {r.type === "leave" ? `du ${fmtDateFr(r.dateStart)} au ${fmtDateFr(r.dateEnd)}` : r.dates.map(fmtDateFr).join(", ")}
          {r.type === "recovery" && r.status === "pending" && <span className="mut"> — {fmtHours(chk.deductMinutes)} prévues au planning seront décomptées (solde : {fmtHours(bal)})</span>}
          {r.type === "recovery" && r.status === "approved" && r.deductedMin > 0 && <span className="mut"> — {fmtHours(r.deductedMin)} décomptées</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {r.status === "pending" ? <>
            <button className="btn" disabled={chk && !chk.ok} onClick={() => validate(r)}>Valider</button>
            <button className="btn danger" onClick={() => refuse(r)}>Refuser</button>
          </> : <Status s={r.status} />}
        </div>
      </div>
      {r.status === "pending" && chk && !chk.ok && <div style={{ color: "var(--no)", fontSize: 12, marginTop: 7 }}>{chk.reason}</div>}
    </div>;
  };
  return <div>
    <h1>Demandes en attente ({pending.length})</h1>
    {err && <div style={{ color: "var(--no)", fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
    {pending.length === 0 && <div className="mut" style={{ fontSize: 13 }}>Rien en attente.</div>}
    {pending.map((r) => <Row key={r.id} r={r} />)}
    <h2>Historique</h2>
    {done.map((r) => <Row key={r.id} r={r} />)}
  </div>;
}

function segmentCells(year, weeks) {
  const segs = holidaySegments(year);
  const byStart = {};
  segs.forEach((s) => { byStart[s.fromWeek] = s; });
  const covered = new Set();
  segs.forEach((s) => { for (let w = s.fromWeek + 1; w <= s.toWeek; w++) covered.add(w); });
  const out = [];
  for (let w = 1; w <= weeks; w++) {
    if (covered.has(w)) continue;
    const s = byStart[w];
    if (s) out.push(<th key={w} colSpan={s.toWeek - s.fromWeek + 1} style={{ background: "#f3eae1", color: "#7a5c3a", fontSize: 9, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 40 * (s.toWeek - s.fromWeek + 1) }}>{s.label}{s.dates ? ` · ${s.dates}` : ""}</th>);
    else out.push(<th key={w} style={{ background: "transparent", border: "none" }} />);
  }
  return out;
}

export function Export({ data }) {
  const [year, setYear] = useState(2027);
  const [busy, setBusy] = useState(false);
  const leavesByEmployee = {};
  data.employees.forEach((e) => { leavesByEmployee[e.id] = new Set(); });
  data.requests.filter((r) => r.type === "leave" && r.status === "approved").forEach((r) => {
    requestDates(r).forEach((iso) => { const w = isoWeek(new Date(iso + "T12:00")); if (w.year === year) leavesByEmployee[r.employeeId]?.add(w.week); });
  });
  const m = buildMatrix({ employees: data.employees, leavesByEmployee, year });
  const dl = async () => {
    setBusy(true);
    const blob = await buildXlsx({ employees: data.employees, leavesByEmployee, year });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `congeo-conges-${year}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
    setBusy(false);
  };
  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div className="mut" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>VUE ANNUELLE</div>
        <h1>Congés {year} · semaines 1 à {m.weeks}</h1>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>{[2026, 2027, 2028].map((y) => <option key={y} value={y}>{y}</option>)}</select>
        <button className="btn" onClick={dl} disabled={busy}>⤓ Exporter en Excel (.xlsx)</button>
      </div>
    </div>
    <div className="mut" style={{ fontSize: 12.5, margin: "8px 0 12px" }}>Colonnes teintées : vacances scolaires zone B — académie de Caen (calendriers officiels 2025-2026 à 2027-2028, Ministère de l'Éducation nationale). Cases colorées : congés validés.</div>
    <div className="card" style={{ padding: 12, overflow: "auto" }}>
      <table className="xprev">
        <thead>
          <tr><th></th>{segmentCells(year, m.weeks)}</tr>
          <tr><th></th>{Array.from({ length: m.weeks }, (_, i) => <th key={i} title={m.hol[i + 1] || ""} style={m.hol[i + 1] ? { background: "#e8d9cf", color: "#7a5c3a" } : {}}>{i + 1}</th>)}</tr>
        </thead>
        <tbody>
          {m.rows.map(({ employee, leaves }) => <tr key={employee.id}>
            <td className="nm"><span className="dot" style={{ background: employee.color }} /> {employee.name}</td>
            {Array.from({ length: m.weeks }, (_, i) => {
              const w = i + 1;
              const isLeave = leaves.has(w), isHol = !!m.hol[w];
              return <td key={w} title={isLeave ? `Congé${isHol ? " · " + m.hol[w] : ""}` : m.hol[w] || ""} style={isLeave ? { background: employee.color } : isHol ? { background: "#f3eae1" } : {}} />;
            })}
          </tr>)}
        </tbody>
      </table>
    </div>
    <div className="mut" style={{ fontSize: 12, marginTop: 8 }}>L'export reprend exactement ce tableau, prêt à imprimer. Seules les semaines contenant au moins un jour de vacances sont teintées.</div>
  </div>;
}
