import React,{useState} from 'react';
import {Check,Copy} from 'lucide-react';
import {DAY_NAMES_LONG,isoWeek,weekDates,fmtRange} from '../domain/dates';
import {defaultWorkTemplates} from '../domain/defaults';

const OFF={worked:false,start:null,end:null,pauseStart:null,pauseEnd:null,open:false,close:false};
const PARITIES=['paire','impaire'];
const clone=template=>Object.fromEntries(PARITIES.map(parity=>[parity,Array.from({length:7},(_,i)=>({...OFF,...template?.[parity]?.[i]}))]));
const validTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'');
function TimeField({day,index,field,label,parity,onChange}){
 return <label><span>{label}</span><input type="time" aria-label={`${DAY_NAMES_LONG[index]} · ${label} · semaine ${parity}`} value={day[field]||''} onChange={event=>onChange(index,{[field]:event.target.value||null})} required/></label>;
}

export default function TemplateEditor({data,actions}){
 const [empId,setEmpId]=useState(data.employees[0].id),[parity,setParity]=useState('paire');
 // Keep each employee's unfinished entries when the manager switches names or polling refreshes data.
 const [drafts,setDrafts]=useState({}),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const template=drafts[empId]||clone(data.templates[empId]),other=parity==='paire'?'impaire':'paire';
 const dirty=!!drafts[empId],employee=data.employees.find(e=>e.id===empId);
 const week=isoWeek(new Date()),exampleWeek=week.week%2===(parity==='paire'?0:1)?week.week:week.week+1;
 const update=change=>{setDrafts(previous=>({...previous,[empId]:change(clone(previous[empId]||data.templates[empId]))}));setError('');setMessage('');};
 const setDay=(index,change)=>update(t=>{t[parity][index]={...t[parity][index],...change};return t;});
 const setWorked=(index,worked)=>{
  const d=template[parity][index];
  setDay(index,worked?{...defaultWorkTemplates().paire[index],...Object.fromEntries(Object.entries(d).filter(([,value])=>value!==null)),worked:true}:{worked:false,open:false,close:false});
 };
 const copyWeek=()=>{update(t=>{t[other]=t[parity].map(d=>({...d}));return t;});setMessage(`Semaine ${parity} copiée vers la semaine ${other}. Enregistrez pour appliquer les changements.`);};
 async function save(event){
  event.preventDefault();setError('');setMessage('');
  for(const par of PARITIES)for(let i=0;i<7;i++){
   const d=template[par][i];if(!d.worked)continue;
   const prefix=`${DAY_NAMES_LONG[i]} · semaine ${par} : `;
   if(!validTime(d.start)||!validTime(d.end)||d.start>=d.end){setError(prefix+'renseignez une arrivée avant le départ.');return;}
   if((!!d.pauseStart)!=(!!d.pauseEnd)||(d.pauseStart&&(!validTime(d.pauseStart)||!validTime(d.pauseEnd)||d.pauseStart<d.start||d.pauseStart>=d.pauseEnd||d.pauseEnd>d.end))){setError(prefix+'vérifiez le départ du matin et le retour de l’après-midi.');return;}
  }
  setSaving(true);
  try{
   await actions.saveTemplate(empId,template);
   setDrafts(previous=>{const next={...previous};delete next[empId];return next;});
   setMessage(`Les horaires de ${employee.name} sont enregistrés.`);
  }catch(e){setError(e.message||'Impossible d’enregistrer. Vos saisies sont conservées.');}
  finally{setSaving(false);}
 }
 return <form className="template-editor" onSubmit={save} noValidate>
  <p className="template-intro">Renseignez le matin et l’après-midi. Ces horaires se répètent selon la semaine paire ou impaire.</p>
  <fieldset disabled={saving}>
   <div className="template-controls">
    <label className="template-employee">Salarié<select aria-label="Salarié des semaines types" value={empId} onChange={event=>{setEmpId(event.target.value);setError('');setMessage('');}}>{data.employees.map(e=><option key={e.id} value={e.id}>{e.name}{drafts[e.id]?' · à enregistrer':''}</option>)}</select></label>
    <div className="template-parities" role="group" aria-label="Semaine à modifier">{PARITIES.map(par=><button type="button" key={par} aria-pressed={parity===par} onClick={()=>setParity(par)}>Semaine {par}</button>)}</div>
   </div>
   <div className="template-week-context"><p>Exemple : {fmtRange(weekDates(week.year,exampleWeek)[0])}.</p>{dirty&&<span>Modifications à enregistrer</span>}</div>
   <div className="template-table-wrap"><table className="template-table">
    <colgroup><col className="template-col-day"/><col className="template-col-state"/><col/><col/><col className="template-col-duty"/><col className="template-col-duty"/></colgroup>
    <thead><tr><th scope="col">Jour</th><th scope="col">Journée</th><th scope="col">Matin</th><th scope="col">Après-midi</th><th scope="col">Ouverture</th><th scope="col">Fermeture</th></tr></thead>
    <tbody>{template[parity].map((day,i)=>{
     const split=!!(day.pauseStart||day.pauseEnd);
     return <tr key={i} className={day.worked?'':'template-rest-row'}>
      <th scope="row"><strong>{DAY_NAMES_LONG[i]}</strong>{i===6&&<small>Magasin fermé</small>}{day.worked&&<label className="template-continuous"><input type="checkbox" checked={!split} aria-label={`${DAY_NAMES_LONG[i]} · journée continue`} onChange={event=>setDay(i,event.target.checked?{pauseStart:null,pauseEnd:null}:{pauseStart:'12:00',pauseEnd:'14:00'})}/>Sans coupure</label>}</th>
      <td className="template-day-state"><select aria-label={`${DAY_NAMES_LONG[i]} · travaillé ou repos`} value={day.worked?'work':'rest'} disabled={i===6} onChange={event=>setWorked(i,event.target.value==='work')}><option value="work">Travaillé</option><option value="rest">Repos</option></select></td>
      {day.worked?<><td><div className="template-period"><span className="template-mobile-period">{split?'Matin':'Journée continue'}</span><div className="template-times"><TimeField day={day} index={i} parity={parity} onChange={setDay} field="start" label="Arrivée"/><TimeField day={day} index={i} parity={parity} onChange={setDay} field={split?'pauseStart':'end'} label={split?'Départ matin':'Départ'}/></div></div></td><td>{split?<div className="template-period"><span className="template-mobile-period">Après-midi</span><div className="template-times"><TimeField day={day} index={i} parity={parity} onChange={setDay} field="pauseEnd" label="Retour"/><TimeField day={day} index={i} parity={parity} onChange={setDay} field="end" label="Départ"/></div></div>:<span className="template-rest-caption">Sans coupure</span>}</td></>:<td colSpan={2} className="template-rest-caption">Repos · aucun horaire à renseigner</td>}
      {['open','close'].map((key,index)=><td key={key} className="template-duty-cell"><label className="template-duty"><input type="checkbox" aria-label={`${DAY_NAMES_LONG[i]} · ${index?'Fermeture':'Ouverture'} · semaine ${parity}`} checked={day.worked&&!!day[key]} disabled={!day.worked} onChange={event=>setDay(i,{[key]:event.target.checked})}/><span>{index?'Fermeture':'Ouverture'}</span></label></td>)}
     </tr>;
    })}</tbody>
   </table></div>
   <p className="template-role-hint">Cochez les personnes qui assurent l’ouverture ou la fermeture. Les jours de repos ne sont pas comptés.</p>
   <div className="template-actions"><button type="button" className="btn secondary" onClick={copyWeek}><Copy size={17} aria-hidden="true"/>Copier vers la semaine {other}</button><button type="submit" className="btn" disabled={!dirty}><Check size={18} aria-hidden="true"/>{saving?'Enregistrement…':'Enregistrer les horaires'}</button></div>
  </fieldset>
  {error&&<p className="template-error" role="alert">{error}</p>}{message&&<p className="template-message" role="status">{message}</p>}
 </form>;
}
