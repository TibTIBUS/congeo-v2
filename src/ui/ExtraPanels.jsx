import {approvedAbsences} from '../domain/sickLeave';
import React,{useCallback,useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight,Coffee,Timer,Utensils,CalendarOff} from 'lucide-react';
import OvertimeOverview from './OvertimeOverview';
import MonthlyOvertime from './MonthlyOvertime';
import SickLeavePage from './SickLeavePage';
import DutyAssignments from './DutyAssignments';
import SundayOpenings from './SundayOpenings';
import {getOpenSundays} from '../domain/sundays';
import {apiFetch} from '../lib/api';
import {Planning,Gabarits,Export} from './AdminView';
import {getWeekPlan} from '../domain/planning';
import {isoWeek,addDays,mondayOfISOWeek,weekDates,fmtRange,toISODate,parityOf} from '../domain/dates';
import {fmtRanges} from './bits';
import {requestDates} from '../domain/requests';
const format=m=>`${Math.floor(m/60)} h${m%60?' '+String(m%60).padStart(2,'0'):''}`;
async function api(path,options){const r=await apiFetch(path,options);const d=await r.json();if(!r.ok)throw Error(d.error||'Impossible d’enregistrer.');return d;}
export default function ExtraPanels({tab,admin,actor,onChanged}){
 const [data,setData]=useState(null),[err,setErr]=useState('');
 const refresh=useCallback(async()=>{try{setData(await api('/api/bootstrap?'+(admin?'as=admin':'employee='+encodeURIComponent(actor))));setErr('');return true;}catch(e){setErr(e.message);return false;}},[admin,actor]);
 useEffect(()=>{if(admin||actor)void refresh();const focus=()=>void refresh();addEventListener('focus',focus);const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},60000);return()=>{removeEventListener('focus',focus);clearInterval(timer);};},[refresh,admin,actor]);
 const write=async(path,method,body)=>{try{await api(path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});await refresh();onChanged?.();}catch(e){setErr(e.message);throw e;}};
 const actions={saveTemplate:(emp,tpl,original)=>write('/api/templates/'+emp,'PUT',{...tpl,...(original?{original}:{})}),saveOverride:(emp,iso,day)=>write(`/api/overrides/${emp}/${iso}`,'PUT',day),resetOverride:(emp,iso)=>write(`/api/overrides/${emp}/${iso}`,'DELETE')};
 if(tab==='sick')return admin?<SickLeavePage onChanged={onChanged}/>:<div className="notice">Cette page est réservée à la gérante.</div>;
 if(tab==='overtime')return admin?<MonthlyOvertime/>:<div className="notice">Cette page est réservée à la gérante.</div>;
 if(!admin&&!actor)return <div className="notice">Sélectionnez votre nom en haut de l’écran pour voir vos horaires.</div>;
 if(err&&!data)return <div role="alert" className="notice">{err}<button className="textbtn" onClick={refresh}>Réessayer</button></div>;
 if(!data)return <div className="panel">Chargement…</div>;
 const active={...data,employees:data.employees.filter(e=>e.active!==false)};
 if(!active.employees.length)return <div className="panel">Ajoutez d’abord les salariés dans l’onglet Équipe.</div>;
 return <>{err&&<div role="alert" className="notice">{err}</div>}<div className="schedule-view">{tab==='schedule'?(admin?<Planning data={active} actions={actions}/>:<MySchedule data={active} actor={actor}/>):tab==='templates'?<Gabarits data={active} actions={actions} onReload={refresh}/>:tab==='sundays'&&admin?<SundayOpenings data={active} write={write} onReload={refresh}/>:tab==='duties'&&admin?<DutyAssignments data={active} write={write} onReload={refresh}/>:tab==='hours'?<Hours data={data} write={write}/>:<Export data={data}/>}</div></>;
}
function MySchedule({data,actor}){
 const [wk,setWk]=useState(()=>isoWeek(new Date()));const emp=data.employees.find(e=>e.id===actor);if(!emp)return <div className="notice">Ce salarié n’est plus actif.</div>;
 const plan=getWeekPlan(data.templates,data.overrides,actor,wk.year,wk.week);
 const move=n=>setWk(isoWeek(addDays(mondayOfISOWeek(wk.year,wk.week),7*n)));
 const absence=day=>approvedAbsences(data).find(r=>r.employeeId===actor&&r.status==='approved'&&requestDates(r).includes(day));
 const bal=data.recoveryLedger.filter(l=>l.employeeId===actor).reduce((s,l)=>s+l.deltaMin,0),today=toISODate(new Date());
 return <div className="personal-week-view"><div className="my-schedule-navigation"><div className="personal-week-heading"><h2 aria-live="polite">{fmtRange(weekDates(wk.year,wk.week)[0])}</h2><p>Semaine {wk.week} · {parityOf(wk)}</p></div><div className="my-schedule-week-buttons"><button className="btn secondary schedule-week-button" onClick={()=>move(-1)}><ChevronLeft size={26} aria-hidden="true"/><span>Semaine précédente</span></button><button className="btn schedule-week-button" onClick={()=>move(1)}><span>Semaine suivante</span><ChevronRight size={26} aria-hidden="true"/></button></div><button className="textbtn" onClick={()=>setWk(isoWeek(new Date()))}>Cette semaine</button></div>
 <ol className="schedule-timeline">{plan.map((p,i)=>{
  const day=toISODate(p.date),a=absence(day),working=(i!==6||getOpenSundays(data).includes(day))&&!a&&p.worked,ranges=working?fmtRanges(p).split(' / '):[];
  return <li key={day} className={'schedule-timeline-row '+(!working?'is-off ':'')+(a?'is-absence ':'')+(day===today?'is-today':'')} aria-current={day===today?'date':undefined}>
   <time className={'schedule-timeline-date '+(i===6?'is-sunday':'')} dateTime={day}><span>{p.date.toLocaleDateString('fr-FR',{weekday:'long'})}</span><strong>{p.date.getDate()}</strong><small>{p.date.toLocaleDateString('fr-FR',{month:'short'})}</small></time><span className="schedule-timeline-node" aria-hidden="true"/>
   <div className="schedule-timeline-entry">{working?<><div className="schedule-timeline-ranges">{ranges.map((range,index)=><React.Fragment key={range}>{index>0&&<span className="schedule-pause"><Utensils size={14} aria-hidden="true"/>Pause</span>}<span>{range}</span></React.Fragment>)}</div>{(p.open||p.close)&&<div className="schedule-duties">{p.open&&<span>Ouverture</span>}{p.close&&<span>Fermeture</span>}</div>}</>:<span className={'schedule-day-status'+(a?.type==='sick'?' sick-absence':'')}>{a?.type==='sick'?<CalendarOff size={18} aria-hidden="true"/>:<Coffee size={18} aria-hidden="true"/>}{a?(a.type==='sick'?'Arrêt de travail':a.type==='recovery'?'Récupération':'Congé'):'Repos'}</span>}</div>
  </li>;
 })}</ol>
 <div className="schedule-recovery-summary"><Timer size={21} aria-hidden="true"/><h2>Solde de récupération</h2><strong>{format(bal)}</strong><span>disponibles</span></div></div>;
}

function Hours({data,write}){
 const [selected,setSelected]=useState(null);
 return <><OvertimeOverview data={data} write={write} onDetails={setSelected}/>{selected&&<HoursDetails key={selected} data={data} write={write} initialEmployee={selected} onClose={()=>setSelected(null)}/>}</>;
}
function HoursDetails({data,write,initialEmployee,onClose}){
 const [emp,setEmp]=useState(initialEmployee),[h,setH]=useState(''),[m,setM]=useState('0'),[reason,setReason]=useState(''),[edit,setEdit]=useState(null),[remove,setRemove]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[ok,setOk]=useState('');
 const ledger=data.recoveryLedger.filter(l=>l.employeeId===emp).slice().sort((a,b)=>new Date(b.at)-new Date(a.at)),bal=ledger.reduce((s,l)=>s+l.deltaMin,0);
 const reset=()=>{setEdit(null);setH('');setM('0');setReason('');};
 const save=async e=>{e.preventDefault();setBusy(true);setErr('');try{await write('/api/planning','POST',{admin:true,action:edit?'hoursEdit':'hoursAdd',target:emp,id:edit?.id,originalMinutes:edit?.deltaMin,minutes:Number(h)*60+Number(m),reason});reset();setOk('Heures de récupération enregistrées.');}catch(e){setErr(e.message);}finally{setBusy(false);}};
 const del=async()=>{setBusy(true);setErr('');try{await write('/api/planning','POST',{admin:true,action:'hoursDelete',target:emp,id:remove.id,originalMinutes:remove.deltaMin});setRemove(null);setOk('Saisie supprimée.');}catch(e){setErr(e.message);}finally{setBusy(false);}};
 return <><div className="panel"><div className="section-heading"><h2>{data.employees.find(e=>e.id===emp)?.name} · Historique et ajouts</h2><button className="textbtn" onClick={onClose}>Fermer le détail</button></div><p className="balance">Solde de récupération : <strong>{format(bal)}</strong></p></div><form className="panel hours-form" onSubmit={save}><h2>{edit?'Modifier la saisie':'Ajouter des heures à récupérer'}</h2><div className="date-fields"><label>Heures<input type="number" min="0" max="1000" step="1" required value={h} onChange={e=>setH(e.target.value)}/></label><label>Minutes<input type="number" min="0" max="59" step="1" required value={m} onChange={e=>setM(e.target.value)}/></label></div><label>Motif<textarea placeholder="Ex. inventaire, remplacement…" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>{err&&<p role="alert" className="notice">{err}</p>}{ok&&<p role="status">{ok}</p>}<div className="form-footer">{edit&&<button type="button" className="btn secondary" onClick={reset}>Annuler</button>}<button className="btn" disabled={busy||Number(h)*60+Number(m)<=0}>Enregistrer</button></div></form><section className="panel"><h2>Historique des heures</h2>{ledger.length?ledger.map(l=><div className="hour-entry" key={l.id}><div><strong>{l.deltaMin>0?'+':'−'}{format(Math.abs(l.deltaMin))}</strong><p>{l.reason}</p><small>{new Date(l.at).toLocaleDateString('fr-FR')}</small></div>{l.deltaMin>0&&!l.requestId&&!/recréditée|Correction du solde/.test(l.reason)&&<div className="card-actions"><button className="textbtn" onClick={()=>{setEdit(l);setH(String(Math.floor(l.deltaMin/60)));setM(String(l.deltaMin%60));setReason(l.reason);setOk('');}}>Modifier</button><button className="textbtn" onClick={()=>setRemove(l)}>Supprimer</button></div>}</div>):<p>Aucune heure enregistrée.</p>}</section>{remove&&<div className="hours-confirm panel" role="alertdialog" aria-label="Supprimer cette saisie d’heures"><h2>Supprimer cette saisie ?</h2><p>{format(remove.deltaMin)} · {remove.reason}</p><p>La suppression sera refusée si ces heures ont déjà été utilisées.</p>{err&&<p role="alert">{err}</p>}<div className="form-footer"><button className="btn secondary" disabled={busy} onClick={()=>setRemove(null)}>Conserver</button><button className="btn" disabled={busy} onClick={del}>Confirmer la suppression</button></div></div>}</>;
}
