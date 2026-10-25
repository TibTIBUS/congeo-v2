import React,{useState} from 'react';
import {Check,Coffee,RefreshCw} from 'lucide-react';
import {DAY_NAMES_LONG,addDays,fmtRange,isoWeek,parityOf,weekDates} from '../domain/dates';
import {MIN_COVERAGE} from '../domain/planning';
import {dutyState,sameDutyState} from '../domain/duties';

function Coverage({label,count}){
 return <span className={'duty-coverage '+(count<MIN_COVERAGE?'duty-short':'duty-covered')}><span>{count<MIN_COVERAGE?'⚠':'✓'} {label}</span><strong>{count}/{MIN_COVERAGE}</strong></span>;
}

export default function DutyAssignments({data,write,onReload}){
 const [parity,setParity]=useState(()=>parityOf(isoWeek(new Date()))),[edits,setEdits]=useState({paire:{},impaire:{}});
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const employees=data.employees.filter(e=>e.active!==false),selected=edits[parity],changes=Object.values(selected);
 const current=(employeeId,weekday)=>dutyState(data.templates[employeeId]?.[parity]?.[weekday]);
 const stale=changes.some(change=>!employees.some(e=>e.id===change.employeeId)||!sameDutyState(current(change.employeeId,change.weekday),change.original));
 const visible=(employeeId,weekday)=>({...current(employeeId,weekday),...selected[employeeId+'|'+weekday]});
 const counts=Array.from({length:6},(_,i)=>employees.reduce((out,e)=>{const d=visible(e.id,i);if(d.worked){out.open+=d.open?1:0;out.close+=d.close?1:0;}return out;},{open:0,close:0}));
 const missingOpen=counts.filter(c=>c.open<MIN_COVERAGE).length,missingClose=counts.filter(c=>c.close<MIN_COVERAGE).length;
 const wk=isoWeek(new Date());let example=weekDates(wk.year,wk.week)[0];while(parityOf(isoWeek(example))!==parity)example=addDays(example,7);
 function toggle(employeeId,weekday,role,checked){
  const key=employeeId+'|'+weekday;
  setEdits(previous=>{
   const changed={...previous[parity]},originalEntry=changed[key]||{employeeId,weekday,original:current(employeeId,weekday),open:current(employeeId,weekday).open,close:current(employeeId,weekday).close};
   const entry={...originalEntry,[role]:checked};
   if(entry.open===entry.original.open&&entry.close===entry.original.close)delete changed[key];else changed[key]=entry;
   return {...previous,[parity]:changed};
  });setError('');setMessage('');
 }
 async function save(event){
  event.preventDefault();if(stale||!changes.length||saving)return;setSaving(true);setError('');setMessage('');
  try{await write('/api/duties','PUT',{admin:true,parity,changes});setEdits(previous=>({...previous,[parity]:{}}));setMessage(`La répartition des semaines ${parity==='paire'?'paires':'impaires'} est enregistrée.`);}
  catch(e){setError(e.message||'Impossible d’enregistrer. Vos choix sont conservés.');}
  finally{setSaving(false);}
 }
 async function reload(){
  setSaving(true);
  try{if(await onReload()===false)return;setEdits(previous=>({...previous,[parity]:{}}));setError('');setMessage('Les affectations enregistrées ont été rechargées.');}finally{setSaving(false);}
 }
 return <form className="duty-assignment-page" onSubmit={save}>
  <p className="duty-repeat-note">Cette répartition se répète automatiquement chaque semaine {parity}. Les congés et les ajustements ponctuels du planning restent prioritaires.</p>
  <fieldset disabled={saving}>
   <div className="duty-toolbar"><div className="template-parities" role="group" aria-label="Semaine des ouvertures et fermetures">{['paire','impaire'].map(par=><button type="button" key={par} aria-pressed={parity===par} onClick={()=>{setParity(par);setError('');setMessage('');}}>Semaine {par}{Object.keys(edits[par]).length>0&&<span className="duty-dirty-dot" aria-label="Modifications à enregistrer"> •</span>}</button>)}</div><span>{employees.length} salariés</span></div>
   <p className="duty-week-example">Exemple : {fmtRange(example)}.</p>
   <div className={'duty-summary '+(!missingOpen&&!missingClose?'duty-summary-complete':'')} role="status">{missingOpen||missingClose?<><strong>⚠ Répartition à compléter</strong><span>{missingOpen} ouverture{missingOpen>1?'s':''} et {missingClose} fermeture{missingClose>1?'s':''} sous le minimum de {MIN_COVERAGE} personnes.</span></>:<strong>✓ Toutes les ouvertures et fermetures habituelles sont couvertes.</strong>}</div>
   <div className="duty-matrix-legend"><span><b>O</b> Ouverture</span><span><b>F</b> Fermeture</span><span>Cochez les rôles de chaque salarié.</span></div>
   <div className="duty-matrix-wrap"><table className="duty-matrix"><colgroup><col className="duty-person-column"/>{Array.from({length:6},(_,i)=><col key={i}/>)}</colgroup>
    <thead><tr><th scope="col">Salarié</th>{counts.map((count,i)=><th scope="col" key={i}><span className="duty-day-heading">{DAY_NAMES_LONG[i]}</span><Coverage label="Ouverture" count={count.open}/><Coverage label="Fermeture" count={count.close}/></th>)}</tr></thead>
    <tbody>{employees.map(e=><tr key={e.id}><th scope="row"><span className="duty-person-name"><i style={{background:e.color||'#286b5b'}} aria-hidden="true"/>{e.name}</span></th>{counts.map((_,i)=>{const d=visible(e.id,i);return <td key={i} className={d.worked?'':'duty-rest-cell'}>{d.worked?<div className="duty-checkbox-pair">{['open','close'].map((role,index)=><label className="duty-checkbox" key={role}><span aria-hidden="true">{index?'F':'O'}</span><input type="checkbox" checked={!!d[role]} aria-label={`${e.name} · ${DAY_NAMES_LONG[i]} · ${index?'Fermeture':'Ouverture'} · semaine ${parity}`} onChange={event=>toggle(e.id,i,role,event.target.checked)}/></label>)}</div>:<span className="duty-rest-text">Repos</span>}</td>;})}</tr>)}</tbody>
   </table></div>
   <p className="duty-sunday-note"><Coffee size={16} aria-hidden="true"/>Dimanche fermé · Les jours de repos se modifient dans Semaines types.</p>
   <div className="duty-save-row"><span>{changes.length?`${changes.length} journée${changes.length>1?'s':''} modifiée${changes.length>1?'s':''} · à enregistrer`:'Aucune modification en cours'}</span><button className="btn" type="submit" disabled={!changes.length||stale}><Check size={18} aria-hidden="true"/>{saving?'Enregistrement…':`Enregistrer la semaine ${parity}`}</button></div>
  </fieldset>
  {(stale||error)&&<div className="duty-conflict" role="alert"><p>{error||'Les horaires ou les affectations ont changé depuis votre saisie. Rechargez les affectations avant d’enregistrer.'}</p><button type="button" className="textbtn" disabled={saving} onClick={reload}><RefreshCw size={16} aria-hidden="true"/>Recharger les affectations enregistrées</button></div>}
  {message&&<p className="duty-message" role="status">{message}</p>}
 </form>;
}
