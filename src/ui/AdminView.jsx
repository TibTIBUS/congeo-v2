import React, { useState } from "react";
import { isoWeek, weekDates, parityOf, fmtRange, toISODate, addDays, mondayOfISOWeek, DAY_NAMES, isoWeeksInYear, parseISO, fmtDate } from "../domain/dates.js";

const fmtDateFr = (iso) => fmtDate(parseISO(iso));
import { STORE_HOURS_LABEL, getWeekPlan, plannedMinutes, weekCoverage, fmtHours, SHOP_DAYS } from "../domain/planning.js";
import { recoveryBalance } from "../store.js";
import { checkRecoveryValidation, requestDates, recoveryPlannedMinutes } from "../domain/requests.js";
import { buildMatrix, buildXlsx } from "../domain/exportXlsx.js";
import { holidaySegments } from "../domain/schoolHolidays.js";
import { Badges, Status, PariteBadge, WeekNav, fmtRanges } from "./bits.jsx";

const OFF = { worked: false, start: null, end: null, pauseStart: null, pauseEnd: null, open: false, close: false };

export default function AdminView({ data, actions }) {
  const [tab, setTab] = useState(() => {
    const h = location.hash.replace(/^#\/?/, "");
    return h.startsWith("admin/") && ["planning", "gabarits", "demandes", "export"].includes(h.slice(6)) ? h.slice(6) : "planning";
  });
  return <div>
    <div className="tabs">
      {[["planning", "Planning"], ["gabarits", "Semaines paire/impaire"], ["demandes", "Demandes"], ["export", "Export annuel"]].map(([k, l]) =>
        <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}
    </div>
    {tab === "planning" && <Planning data={data} actions={actions} />}
    {tab === "gabarits" && <Gabarits data={data} actions={actions} />}
    {tab === "demandes" && <Demandes data={data} actions={actions} />}
    {tab === "export" && <Export data={data} />}
  </div>;
}

function Planning({ data, actions }) {
  const [wk, setWk] = useState(() => isoWeek(new Date()));
  const [edit, setEdit] = useState(null); // {empId, iso, day}
  const [recForm, setRecForm] = useState(false);
  const [recEmp, setRecEmp] = useState(data.employees[0].id);
  const [recH, setRecH] = useState(""); const [recWhy, setRecWhy] = useState("");
  const dates = weekDates(wk.year, wk.week);
  const plansBy = {};
  data.employees.forEach((e) => { plansBy[e.id] = getWeekPlan(data.templates, data.overrides, e.id, wk.year, wk.week); });
  const cov = weekCoverage(plansBy);
  const leaveSet = {}; data.employees.forEach((e) => { leaveSet[e.id] = new Set(); });
  data.requests.filter((r) => r.type === "leave" && r.status === "approved")
    .forEach((r) => requestDates(r).forEach((x) => leaveSet[r.employeeId]?.add(x)));
  const recDays = {}; data.employees.forEach((e) => { recDays[e.id] = new Set(); });
  data.requests.filter((r) => r.type === "recovery" && r.status === "approved")
    .forEach((r) => r.dates.forEach((x) => recDays[r.employeeId]?.add(x)));
  const move = (n) => setWk(isoWeek(addDays(mondayOfISOWeek(wk.year, wk.week), n * 7)));
  const saveRec = async () => {
    const h = parseFloat(recH.replace(",", "."));
    if (!h || h <= 0) return;
    await actions.addRecovery(recEmp, h, recWhy);
    setRecForm(false); setRecH(""); setRecWhy("");
  };
  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
      <div>
        <div className="mut" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>PLANNING · L'ÉCHOPPE DU MARCHÉ (FICTIF)</div>
        <h1>Semaine {parityOf(wk)} · {fmtRange(dates[0])}</h1>
      </div>
      <WeekNav onPrev={() => move(-1)} onNext={() => move(1)}><PariteBadge parite={parityOf(wk)} week={wk.week} /></WeekNav>
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
      <span className="chip">{data.employees.length} <span className="mut">salariés</span></span>
      <span className="chip"><span className="badgeO">O</span> {cov.openingsCovered}/{cov.days} <span className="mut">ouvertures couvertes</span></span>
      <span className="chip"><span className="badgeF">F</span> {cov.closingsCovered}/{cov.days} <span className="mut">fermetures couvertes</span></span>
      {cov.warnings.map((w, i) => <span key={i} className="chip warn">⚠ {DAY_NAMES[w.dayIdx]} : {w.count === 0 ? "aucune" : "1 seule"} {w.kind === "O" ? "ouverture" : "fermeture"}</span>)}
    </div>
    <div className="card" style={{ overflow: "auto" }}>
      <table className="grid">
        <thead><tr><th>SALARIÉ</th>{SHOP_DAYS.map((i) => <th key={i}>{DAY_NAMES[i]} {dates[i].getDate()}</th>)}</tr></thead>
        <tbody>
          {data.employees.map((e) => <tr key={e.id}>
            <td><span className="dot" style={{ background: e.color }} /> <b>{e.name}</b><div className="mut" style={{ fontSize: 11 }}>{e.role}</div></td>
            {SHOP_DAYS.map((i) => {
              const p = plansBy[e.id][i], iso = toISODate(dates[i]);
              const onLeave = leaveSet[e.id].has(iso), onRec = recDays[e.id].has(iso);
              return <td key={i} className={`cellwork ${onLeave || onRec ? "conge" : ""}`} onClick={() => setEdit({ empId: e.id, iso, day: { ...p } })}>
                {onLeave ? "Congé" : onRec ? "Récupération" : p.worked ? <>{fmtRanges(p)}<Badges d={p} /></> : <span className="mut">Repos</span>}
              </td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </div>
    <div className="mut" style={{ fontSize: 12, marginTop: 8 }}>
      Magasin : {STORE_HOURS_LABEL} · <span className="badgeO">O</span> ouvre le magasin · <span className="badgeF">F</span> ferme le magasin (coches indicatives, sans contrôle à la minute) · Couverture : au moins 2 salariés à l'ouverture et 2 à la fermeture, alerte sans blocage · Dimanche : magasin fermé · Clique une case pour ajuster la journée.
    </div>

    <h2>Heures à récupérer</h2>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {data.employees.map((e) => <span key={e.id} className="chip"><span className="dot" style={{ background: e.color }} /><b>{e.name}</b> <span style={{ fontWeight: 800, color: "var(--pri)" }}>{fmtHours(recoveryBalance(data, e.id))}</span></span>)}
      <button className="btn ghost" onClick={() => setRecForm(!recForm)}>+ Saisir des heures à récupérer</button>
    </div>
    {recForm && <div className="card" style={{ padding: 14, marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <select value={recEmp} onChange={(e) => setRecEmp(e.target.value)}>{data.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
      <input style={{ width: 90 }} placeholder="Heures" value={recH} onChange={(e) => setRecH(e.target.value)} />
      <input style={{ width: 240 }} placeholder="Motif (ex. heures supplémentaires de mars)" value={recWhy} onChange={(e) => setRecWhy(e.target.value)} />
      <button className="btn" onClick={saveRec}>Enregistrer</button>
      <span className="mut" style={{ fontSize: 11.5 }}>Heures supplémentaires déjà effectuées par le salarié.</span>
    </div>}

    {edit && <DayEditor data={data} actions={actions} edit={edit} onClose={() => setEdit(null)} />}
  </div>;
}

function DayEditor({ data, actions, edit, onClose }) {
  const [d, setD] = useState(edit.day);
  const emp = data.employees.find((e) => e.id === edit.empId);
  const set = (k, v) => setD({ ...d, [k]: v });
  const save = async () => { await actions.saveOverride(edit.empId, edit.iso, d); onClose(); };
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
  </div>;
}

function Gabarits({ data, actions }) {
  const [empId, setEmpId] = useState(data.employees[0].id);
  const [tpl, setTpl] = useState(() => JSON.parse(JSON.stringify(data.templates[empId])));
  const [saved, setSaved] = useState(false);
  const pick = (id) => { setEmpId(id); setTpl(JSON.parse(JSON.stringify(data.templates[id]))); setSaved(false); };
  const setDay = (par, i, k, v) => { const t = { ...tpl }; t[par] = t[par].slice(); t[par][i] = { ...t[par][i], [k]: v }; setTpl(t); setSaved(false); };
  const save = async () => { await actions.saveTemplate(empId, tpl); setSaved(true); };
  const emp = data.employees.find((e) => e.id === empId);
  const Panel = ({ par, badge }) => <div className="card" style={{ flex: 1, overflow: "hidden" }}>
    <div style={{ padding: "12px 16px", background: "var(--soft)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <b>Semaine {par}</b><span className="parite">{badge}</span>
    </div>
    {DAY_NAMES.map((dn, i) => {
      const d = tpl[par][i];
      return <div key={i} className={`tplrow ${d.worked ? "" : "off"}`}>
        <input type="checkbox" checked={d.worked} onChange={(e) => setDay(par, i, "worked", e.target.checked)} />
        <span style={{ fontWeight: 600 }}>{dn}</span>
        {d.worked ? <span style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
          <input type="time" value={d.start || ""} onChange={(e) => setDay(par, i, "start", e.target.value)} />
          <input type="time" value={d.end || ""} onChange={(e) => setDay(par, i, "end", e.target.value)} />
          <label className="mut" style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center" }}>pause <input type="time" value={d.pauseStart || ""} onChange={(e) => setDay(par, i, "pauseStart", e.target.value || null)} /> → <input type="time" value={d.pauseEnd || ""} onChange={(e) => setDay(par, i, "pauseEnd", e.target.value || null)} /></label>
        </span> : <span className="mut">Repos</span>}
        <label style={{ fontSize: 11.5 }}><input type="checkbox" checked={d.open} disabled={!d.worked} onChange={(e) => setDay(par, i, "open", e.target.checked)} /> Ouverture</label>
        <label style={{ fontSize: 11.5 }}><input type="checkbox" checked={d.close} disabled={!d.worked} onChange={(e) => setDay(par, i, "close", e.target.checked)} /> Fermeture</label>
      </div>;
    })}
  </div>;
  return <div>
    <div className="mut" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>HORAIRES HABITUELS</div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", margin: "6px 0 12px" }}>
      <h1>Semaines paire et impaire — {emp.name}</h1>
      <select value={empId} onChange={(e) => pick(e.target.value)}>{data.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
    </div>
    <div className="mut" style={{ fontSize: 12.5, marginBottom: 12 }}>Le gabarit appliqué suit la parité du numéro de semaine ISO, même au changement d'année. Le planning de chaque semaine est pré-rempli à partir de ces gabarits ; l'admin peut ensuite ajuster jour par jour.</div>
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}><Panel par="paire" badge="P" /><Panel par="impaire" badge="I" /></div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14, alignItems: "center" }}>
      {saved && <span style={{ color: "var(--ok)", fontWeight: 700, fontSize: 13 }}>Gabarits enregistrés ✓</span>}
      <button className="btn" onClick={save}>Enregistrer les gabarits</button>
    </div>
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

function Export({ data }) {
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
    <div className="mut" style={{ fontSize: 12.5, margin: "8px 0 12px" }}>Colonnes teintées : vacances scolaires zone B — académie de Caen (calendriers officiels 2025-2026 à 2027-2028, Ministère de l'Éducation nationale). Cases colorées : congés validés. Données fictives.</div>
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
