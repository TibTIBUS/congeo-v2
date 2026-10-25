import React,{useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight,Download,Save} from 'lucide-react';
import {apiFetch} from '../lib/api';
import {formatOvertime,monthLabel,overtimeDraft,overtimeEntry,overtimeChanges} from '../domain/monthlyOvertime';

async function request(month,body){
 const response=await apiFetch('/api/monthly-overtime?admin=1&month='+month,body?{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({admin:true,month,...body})}:{});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Le tableau est indisponible.');return result;
}
const currentMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit'}).format(new Date());
export default function MonthlyOvertime(){
 const [month,setMonth]=useState(currentMonth),[data,setData]=useState(null),[drafts,setDrafts]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const accept=result=>{setData(result);setDrafts(Object.fromEntries(result.rows.map(r=>[r.employeeId,overtimeDraft(r.entry)])));};
 useEffect(()=>{let cancelled=false;setData(null);setError('');setMessage('');request(month).then(result=>{if(!cancelled)accept(result);}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};},[month]);
 let changes=[],invalid='';try{changes=overtimeChanges(data?.rows||[],drafts);}catch(e){invalid=e.message;}
 const dirty=!!invalid||changes.length>0;
 useEffect(()=>{if(!dirty)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const update=(id,key,value)=>{setDrafts(d=>({...d,[id]:{...d[id],[key]:value}}));setMessage('');};
 const reload=async()=>{setBusy(true);setError('');setMessage('');try{accept(await request(month));}catch(e){setError(e.message);}finally{setBusy(false);}};
 const save=async e=>{e.preventDefault();setBusy(true);setError('');setMessage('');try{accept(await request(month,{changes}));setMessage('Le tableau de '+monthLabel(month)+' est enregistré.');}catch(e){setError(e.message);}finally{setBusy(false);}};
 const download=async()=>{setBusy(true);setError('');try{
  const saved=await request(month);accept(saved);
  const {createMonthlyOvertimePdf}=await import('../lib/monthlyOvertimePdf');
  createMonthlyOvertimePdf(saved).save('congeo-heures-supplementaires-'+month+'.pdf');
  setMessage('PDF du mois préparé pour le comptable.');
 }catch(e){setError(e.message||'Impossible de préparer le PDF.');}finally{setBusy(false);}};
 const move=offset=>{const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+offset);setMonth(d.toISOString().slice(0,7));};
 const entered=data?.rows.filter(r=>r.entry!==null).length||0;
 return <section className="panel monthly-overtime"><div className="monthly-toolbar"><div className="monthly-period"><button type="button" className="btn secondary" disabled={dirty||busy||month==='2000-01'} onClick={()=>move(-1)} aria-label="Mois précédent"><ChevronLeft size={22}/></button><label>Mois du relevé<input type="month" min="2000-01" max="2099-12" value={month} disabled={dirty||busy} onChange={e=>{if(/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value))setMonth(e.target.value);}}/></label><button type="button" className="btn secondary" disabled={dirty||busy||month==='2099-12'} onClick={()=>move(1)} aria-label="Mois suivant"><ChevronRight size={22}/></button></div><button type="button" className="btn secondary" disabled={!data||dirty||busy} onClick={download}><Download size={18}/>Exporter en PDF</button></div>
 <h2 className="monthly-title">{monthLabel(month)}</h2><p className="muted monthly-help">Saisissez le total mensuel de chaque salarié. Indiquez 0 lorsqu’il n’y a aucune heure supplémentaire. Une case vide reste « Non renseigné ».</p><p className="monthly-separation">Ce relevé est destiné au comptable. Il ne modifie pas les soldes de récupération.</p>
 {error&&<p className="notice" role="alert">{error}</p>}{!data&&!error&&<p role="status">Chargement du mois…</p>}
 {data&&<form onSubmit={save}><div className="monthly-table-wrap"><table className="monthly-table"><thead><tr><th scope="col">Salarié</th><th scope="col">Heures</th><th scope="col">Minutes</th><th scope="col">Total du mois</th><th scope="col">Observation <small>(facultatif)</small></th></tr></thead><tbody>{data.rows.map(row=>{
  const d=drafts[row.employeeId]||overtimeDraft(row.entry);let entry=null;try{entry=overtimeEntry(d);}catch{}
  return <tr key={row.employeeId}><th scope="row">{row.name}{!row.active&&<small>Archivé · historique conservé</small>}</th><td data-label="Heures"><input type="number" inputMode="numeric" min="0" max="1000" step="1" placeholder="—" value={d.hours} disabled={busy} aria-label={'Heures supplémentaires de '+row.name} onChange={e=>update(row.employeeId,'hours',e.target.value)}/></td><td data-label="Minutes"><input type="number" inputMode="numeric" min="0" max="59" step="1" placeholder="—" value={d.minutes} disabled={busy} aria-label={'Minutes supplémentaires de '+row.name} onChange={e=>update(row.employeeId,'minutes',e.target.value)}/></td><td data-label="Total du mois"><strong>{entry?formatOvertime(entry.minutes):'Non renseigné'}</strong></td><td data-label="Observation"><textarea rows="2" maxLength={500} placeholder="Ex. inventaire…" value={d.note} disabled={busy} aria-label={'Observation pour '+row.name} onChange={e=>update(row.employeeId,'note',e.target.value)}/></td></tr>;
 })}</tbody></table></div>{!data.rows.length&&<p className="muted">Ajoutez les salariés dans la rubrique Équipe.</p>}
 <div className="monthly-save"><span>{dirty?'Modifications à enregistrer':`${entered} salarié(s) renseigné(s) sur ${data.rows.length}`}</span><div><button type="button" className="textbtn" disabled={busy} onClick={reload}>{dirty?'Annuler et recharger':'Actualiser le mois'}</button><button className="btn" disabled={busy||!dirty||!!invalid}><Save size={18}/>{busy?'Veuillez patienter…':'Enregistrer le mois'}</button></div></div>
 {invalid&&<p className="row-error" role="alert">{invalid}</p>}{dirty&&<p className="monthly-help muted">Enregistrez ou annulez vos modifications avant de changer de mois ou d’exporter le PDF.</p>}</form>}
 {!data&&error&&<button className="btn secondary" disabled={busy} onClick={reload}>Réessayer</button>}{message&&<p className="saved-status" role="status">{message}</p>}
 </section>;
}
