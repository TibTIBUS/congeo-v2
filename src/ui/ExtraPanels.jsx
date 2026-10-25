import React,{useCallback,useEffect,useState} from 'react';
import OvertimeOverview from './OvertimeOverview';
import {apiFetch} from '../lib/api';
import {Planning,Gabarits,Export} from './AdminView';
import {getWeekPlan} from '../domain/planning';
import {isoWeek,addDays,mondayOfISOWeek,weekDates,fmtRange,toISODate} from '../domain/dates';
import {fmtRanges,Badges} from './bits';
const format=m=>`${Math.floor(m/60)} h${m%60?' '+String(m%60).padStart(2,'0'):''}`;
async function api(path,options){const r=await apiFetch(path,options);const d=await r.json();if(!r.ok)throw Error(d.error||'Impossible d’enregistrer.');return d;}
export default function ExtraPanels({tab,admin,actor,onChanged}){
 const [data,setData]=useState(null),[err,setErr]=useState('');
 const refresh=useCallback(async()=>{try{setData(await api('/api/bootstrap?'+(admin?'as=admin':'employee='+encodeURIComponent(actor))));setErr('');}catch(e){setErr(e.message);}},[admin,actor]);
 useEffect(()=>{if(admin||actor)void refresh();const focus=()=>void refresh();addEventListener('focus',focus);const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},60000);return()=>{removeEventListener('focus',focus);clearInterval(timer);};},[refresh,admin,actor]);
 const write=async(path,method,body)=>{try{await api(path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});await refresh();onChanged?.();}catch(e){setErr(e.message);throw e;}};
 const actions={saveTemplate:(emp,tpl)=>write('/api/templates/'+emp,'PUT',tpl),saveOverride:(emp,iso,day)=>write(`/api/overrides/${emp}/${iso}`,'PUT',day),resetOverride:(emp,iso)=>write(`/api/overrides/${emp}/${iso}`,'DELETE')};
 if(!admin&&!actor)return <div className="notice">Sélectionnez votre nom en haut de l’écran pour voir vos horaires.</div>;
 if(err&&!data)return <div role="alert" className="notice">{err}<button className="textbtn" onClick={refresh}>Réessayer</button></div>;
 if(!data)return <div className="panel">Chargement…</div>;
 const active={...data,employees:data.employees.filter(e=>e.active!==false)};
 if(!active.employees.length)return <div className="panel">Ajoutez d’abord les salariés dans l’onglet Équipe.</div>;
 return <>{err&&<div role="alert" className="notice">{err}</div>}<div className="schedule-view">{tab==='schedule'?(admin?<Planning data={active} actions={actions}/>:<MySchedule data={active} actor={actor}/>):tab==='templates'?<Gabarits data={active} actions={actions}/>:tab==='hours'?<Hours data={data} write={write}/>:<Export data={data}/>}</div></>;
}
function MySchedule({data,actor}){
 const [wk,setWk]=useState(()=>isoWeek(new Date()));const emp=data.employees.find(e=>e.id===actor);if(!emp)return <div className="notice">Ce salarié n’est plus actif.</div>;
 const plan=getWeekPlan(data.templates,data.overrides,actor,wk.year,wk.week);
 const move=n=>setWk(isoWeek(addDays(mondayOfISOWeek(wk.year,wk.week),7*n)));
 const absence=day=>data.requests.find(r=>r.employeeId===actor&&r.status==='approved'&&(r.type==='recovery'?(r.dates||[]).includes(day):r.dateStart<=day&&r.dateEnd>=day));
 const bal=data.recoveryLedger.filter(l=>l.employeeId===actor).reduce((s,l)=>s+l.deltaMin,0);
 return <><div className="calendar-toolbar"><button className="iconbtn" aria-label="Semaine précédente" onClick={()=>move(-1)}>‹</button><h2>{fmtRange(weekDates(wk.year,wk.week)[0])}</h2><button className="iconbtn" aria-label="Semaine suivante" onClick={()=>move(1)}>›</button><button className="textbtn" onClick={()=>setWk(isoWeek(new Date()))}>Aujourd’hui</button></div>{plan.map((p,i)=>{const a=absence(toISODate(p.date));return <div key={i} className={'card daycard '+(i===6?'sunday':'')}><div><strong>{p.date.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'short'})}</strong><p>{a?(a.type==='recovery'?'Récupération':'Congé'):p.worked?fmtRanges(p):'Repos'}</p></div>{!a&&<Badges d={p}/>}</div>;})}<div className="panel"><h2>Solde de récupération</h2><p>{format(bal)} disponibles</p></div></>;
}
function Hours({data,write}){
 const [selected,setSelected]=useState(null);
 return <><OvertimeOverview data={data} write={write} onDetails={setSelected}/>{selected&&<HoursDetails key={selected} data={data} write={write} initialEmployee={selected} onClose={()=>setSelected(null)}/>}</>;
}
function HoursDetails({data,write,initialEmployee,onClose}){
 const [emp,setEmp]=useState(initialEmployee),[h,setH]=useState(''),[m,setM]=useState('0'),[reason,setReason]=useState(''),[edit,setEdit]=useState(null),[remove,setRemove]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[ok,setOk]=useState('');
 const ledger=data.recoveryLedger.filter(l=>l.employeeId===emp).slice().sort((a,b)=>new Date(b.at)-new Date(a.at)),bal=ledger.reduce((s,l)=>s+l.deltaMin,0);
 const reset=()=>{setEdit(null);setH('');setM('0');setReason('');};
 const save=async e=>{e.preventDefault();setBusy(true);setErr('');try{await write('/api/planning','POST',{admin:true,action:edit?'hoursEdit':'hoursAdd',target:emp,id:edit?.id,originalMinutes:edit?.deltaMin,minutes:Number(h)*60+Number(m),reason});reset();setOk('Heures supplémentaires enregistrées.');}catch(e){setErr(e.message);}finally{setBusy(false);}};
 const del=async()=>{setBusy(true);setErr('');try{await write('/api/planning','POST',{admin:true,action:'hoursDelete',target:emp,id:remove.id,originalMinutes:remove.deltaMin});setRemove(null);setOk('Saisie supprimée.');}catch(e){setErr(e.message);}finally{setBusy(false);}};
 return <><div className="panel"><div className="section-heading"><h2>{data.employees.find(e=>e.id===emp)?.name} · Historique et ajouts</h2><button className="textbtn" onClick={onClose}>Fermer le détail</button></div><p className="balance">Solde de récupération : <strong>{format(bal)}</strong></p></div><form className="panel hours-form" onSubmit={save}><h2>{edit?'Modifier la saisie':'Ajouter des heures supplémentaires'}</h2><div className="date-fields"><label>Heures<input type="number" min="0" max="1000" step="1" required value={h} onChange={e=>setH(e.target.value)}/></label><label>Minutes<input type="number" min="0" max="59" step="1" required value={m} onChange={e=>setM(e.target.value)}/></label></div><label>Motif<textarea placeholder="Ex. inventaire, remplacement…" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>{err&&<p role="alert" className="notice">{err}</p>}{ok&&<p role="status">{ok}</p>}<div className="form-footer">{edit&&<button type="button" className="btn secondary" onClick={reset}>Annuler</button>}<button className="btn" disabled={busy||Number(h)*60+Number(m)<=0}>Enregistrer</button></div></form><section className="panel"><h2>Historique des heures</h2>{ledger.length?ledger.map(l=><div className="hour-entry" key={l.id}><div><strong>{l.deltaMin>0?'+':'−'}{format(Math.abs(l.deltaMin))}</strong><p>{l.reason}</p><small>{new Date(l.at).toLocaleDateString('fr-FR')}</small></div>{l.deltaMin>0&&!l.requestId&&!/recréditée|Correction du solde/.test(l.reason)&&<div className="card-actions"><button className="textbtn" onClick={()=>{setEdit(l);setH(String(Math.floor(l.deltaMin/60)));setM(String(l.deltaMin%60));setReason(l.reason);setOk('');}}>Modifier</button><button className="textbtn" onClick={()=>setRemove(l)}>Supprimer</button></div>}</div>):<p>Aucune heure enregistrée.</p>}</section>{remove&&<div className="hours-confirm panel" role="alertdialog" aria-label="Supprimer cette saisie d’heures"><h2>Supprimer cette saisie ?</h2><p>{format(remove.deltaMin)} · {remove.reason}</p><p>La suppression sera refusée si ces heures ont déjà été utilisées.</p>{err&&<p role="alert">{err}</p>}<div className="form-footer"><button className="btn secondary" disabled={busy} onClick={()=>setRemove(null)}>Conserver</button><button className="btn" disabled={busy} onClick={del}>Confirmer la suppression</button></div></div>}</>;
}
