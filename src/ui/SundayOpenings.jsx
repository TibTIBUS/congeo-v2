import {approvedAbsences} from '../domain/sickLeave';
import React,{useState} from 'react';
import {CalendarDays,Check,RefreshCw} from 'lucide-react';
import {getOpenSundays,isSunday,sundaySnapshot} from '../domain/sundays';
import {defaultWorkTemplates} from '../domain/defaults';
import {requestDates} from '../domain/requests';
import {addDays,parseISO,toISODate} from '../domain/dates';
import {today} from '../domain/calendarRules';
import {MIN_COVERAGE} from '../domain/planning';
const OFF={worked:false,start:null,end:null,pauseStart:null,pauseEnd:null,open:false,close:false};
const label=date=>parseISO(date).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
function TimeField({employee,date,day,field,caption,onChange}){
 return <label><span>{caption}</span><input type="time" aria-label={`${employee.name} · ${caption} · ${date}`} value={day[field]||''} onChange={event=>onChange(employee.id,{[field]:event.target.value||null})}/></label>;
}
export default function SundayOpenings({data,write,onReload}){
 const opened=getOpenSundays(data),employees=data.employees.filter(e=>e.active!==false);
 const nextSunday=()=>{const d=parseISO(today());return toISODate(addDays(d,d.getDay()===0?7:7-d.getDay()));};
 const [date,setDate]=useState(()=>opened.find(day=>day>=today())||nextSunday()),[drafts,setDrafts]=useState({});
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[confirmClose,setConfirmClose]=useState(false);
 const valid=isSunday(date),recorded=opened.includes(date);
 const initial=()=>({original:sundaySnapshot(data,date),rows:employees.map(e=>({employeeId:e.id,day:{...OFF,...data.overrides[e.id+'|'+date]}}))});
 const draft=drafts[date]||initial(),dirty=!!drafts[date],stale=dirty&&JSON.stringify(draft.original)!==JSON.stringify(sundaySnapshot(data,date));
 const absence=id=>approvedAbsences(data).find(r=>r.employeeId===id&&r.status==='approved'&&requestDates(r).includes(date));
 const coverage=draft.rows.reduce((out,row)=>{if(row.day.worked&&!absence(row.employeeId)){out.open+=row.day.open?1:0;out.close+=row.day.close?1:0;}return out;},{open:0,close:0});
 const pick=value=>{setDate(value);setError('');setMessage('');setConfirmClose(false);};
 function update(id,change){setDrafts(previous=>{const entry=previous[date]||initial();return {...previous,[date]:{...entry,rows:entry.rows.map(row=>row.employeeId===id?{...row,day:{...row.day,...change}}:row)}};});setError('');setMessage('');}
 function worked(id,value){const d=draft.rows.find(row=>row.employeeId===id).day;update(id,value?{...defaultWorkTemplates().paire[0],...Object.fromEntries(Object.entries(d).filter(([,v])=>v!==null)),worked:true}:{worked:false,open:false,close:false});}
 async function save(open){
  if(!valid||stale||saving)return;setSaving(true);setError('');setMessage('');
  try{await write('/api/sundays','PUT',{admin:true,date,open,rows:draft.rows,original:draft.original});setDrafts(previous=>{const next={...previous};delete next[date];return next;});setConfirmClose(false);setMessage(open?'Ce dimanche est ouvert. Les horaires sont enregistrés dans le planning.':'Ce dimanche est à nouveau fermé.');}
  catch(e){setError(e.message||'Impossible d’enregistrer ce dimanche. Vos saisies sont conservées.');}
  finally{setSaving(false);}
 }
 async function reload(){setSaving(true);try{if(await onReload()===false)return;setDrafts(previous=>{const next={...previous};delete next[date];return next;});setError('');setConfirmClose(false);setMessage('Les horaires enregistrés ont été rechargés.');}finally{setSaving(false);}}
 return <form className="template-editor sunday-openings" onSubmit={event=>{event.preventDefault();void save(true);}} noValidate>
  <p className="template-intro">Ouvrez une date précise, puis choisissez les salariés présents et leurs horaires. Cette ouverture ne se répète pas dans les semaines types.</p>
  <fieldset disabled={saving}>
   <div className="sunday-date-controls"><label>Dimanche à organiser<input type="date" value={date} aria-label="Date du dimanche exceptionnel" onChange={event=>pick(event.target.value)}/></label>{opened.length>0&&<label>Dimanches déjà ouverts<select value={recorded?date:''} aria-label="Dimanches déjà ouverts" onChange={event=>pick(event.target.value)}><option value="" disabled>Choisir une date</option>{opened.map(day=><option key={day} value={day}>{label(day)}</option>)}</select></label>}</div>
   {!valid?<p className="template-error" role="alert">Choisissez la date d’un dimanche.</p>:<>
    <div className="sunday-opening-heading"><h2><CalendarDays size={22} aria-hidden="true"/>{label(date)}</h2><span className={'sunday-state '+(recorded?'sunday-is-open':'')}>{recorded?'Ouverture enregistrée':'Dimanche fermé · ouverture à enregistrer'}</span></div>
    <div className={'duty-summary '+(coverage.open>=MIN_COVERAGE&&coverage.close>=MIN_COVERAGE?'duty-summary-complete':'')}><strong>Ouverture : {coverage.open}/{MIN_COVERAGE} · Fermeture : {coverage.close}/{MIN_COVERAGE}</strong><span>Les salariés en congé, en récupération ou en arrêt de travail ne sont pas comptés dans la couverture.</span></div>
    <div className="template-table-wrap"><table className="template-table"><colgroup><col className="template-col-day"/><col className="template-col-state"/><col/><col/><col className="template-col-duty"/><col className="template-col-duty"/></colgroup><thead><tr><th scope="col">Salarié</th><th scope="col">Travaille</th><th scope="col">Matin</th><th scope="col">Après-midi</th><th scope="col">Ouverture</th><th scope="col">Fermeture</th></tr></thead><tbody>{employees.map(employee=>{
     const day=draft.rows.find(row=>row.employeeId===employee.id)?.day||OFF,split=!!(day.pauseStart||day.pauseEnd),a=absence(employee.id);
     return <tr key={employee.id} className={day.worked?'':'template-rest-row'}><th scope="row"><strong>{employee.name}</strong>{a&&<small>{a.type==='sick'?'Arrêt de travail':a.type==='recovery'?'Récupération validée':'Congé validé'}</small>}{day.worked&&<label className="template-continuous"><input type="checkbox" checked={!split} aria-label={`${employee.name} · journée continue`} onChange={event=>update(employee.id,event.target.checked?{pauseStart:null,pauseEnd:null}:{pauseStart:'12:00',pauseEnd:'14:00'})}/>Sans coupure</label>}</th>
     <td><label className="sunday-presence"><input type="checkbox" checked={day.worked} aria-label={`${employee.name} · travaille ce dimanche`} onChange={event=>worked(employee.id,event.target.checked)}/>{day.worked&&<span>Prévu</span>}</label></td>
     {day.worked?<><td className="template-period-cell"><span className="template-mobile-period">{split?'Matin':'Journée continue'}</span><div className="template-times"><TimeField employee={employee} date={date} day={day} field="start" caption="Arrivée" onChange={update}/><TimeField employee={employee} date={date} day={day} field={split?'pauseStart':'end'} caption={split?'Départ matin':'Départ'} onChange={update}/></div></td><td className="template-period-cell">{split?<><span className="template-mobile-period">Après-midi</span><div className="template-times"><TimeField employee={employee} date={date} day={day} field="pauseEnd" caption="Retour" onChange={update}/><TimeField employee={employee} date={date} day={day} field="end" caption="Départ" onChange={update}/></div></>:<span className="template-rest-caption">Sans coupure</span>}</td></>:<td colSpan={2} className="template-rest-caption template-period-cell">Repos · aucun horaire prévu</td>}
     {['open','close'].map((key,i)=><td className="template-duty-cell" key={key}><label className="template-duty"><input type="checkbox" checked={day.worked&&!!day[key]} disabled={!day.worked} aria-label={`${employee.name} · ${i?'Fermeture':'Ouverture'} · ${date}`} onChange={event=>update(employee.id,{[key]:event.target.checked})}/><span>{i?'Fermeture':'Ouverture'}</span></label></td>)}</tr>;
    })}</tbody></table></div>
    <div className="template-actions">{recorded?<button type="button" className="btn secondary" onClick={()=>setConfirmClose(true)}>Fermer ce dimanche</button>:<span className="muted">Seule la date choisie sera ouverte.</span>}<button className="btn" type="submit" disabled={stale||(!dirty&&recorded)}><Check size={18} aria-hidden="true"/>{saving?'Enregistrement…':recorded?'Enregistrer ce dimanche':'Ouvrir et enregistrer ce dimanche'}</button></div>
   </>}
  </fieldset>
  {confirmClose&&<div className="sunday-close-confirm" role="alertdialog" aria-label="Fermer ce dimanche"><h3>Fermer le {label(date)} ?</h3><p>Les horaires exceptionnels de cette date seront retirés. Les salariés repasseront en repos pour ce dimanche.</p><div className="form-footer"><button type="button" className="btn secondary" disabled={saving} onClick={()=>setConfirmClose(false)}>Garder l’ouverture</button><button type="button" className="btn" disabled={saving||stale} onClick={()=>save(false)}>Confirmer la fermeture</button></div></div>}
  {(stale||error)&&<div className="template-error" role="alert"><p>{error||'Ce dimanche a changé depuis votre saisie. Rechargez les horaires enregistrés.'}</p><button type="button" className="textbtn" disabled={saving} onClick={reload}><RefreshCw size={16} aria-hidden="true"/>Recharger ce dimanche</button></div>}
  {message&&<p className="template-message" role="status">{message}</p>}
 </form>;
}
