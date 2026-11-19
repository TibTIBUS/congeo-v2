import React,{useEffect,useState} from 'react';
// Compteur « autre récupération · férié/dimanche » côté gérante : soldes de
// l'équipe (crédits calculés du planning + mouvements), solde initial
// « à renseigner », historique fusionné par salarié.
const knownMap=settings=>{try{return JSON.parse(settings?.specialKnown||'{}');}catch{return{};}};
const creditsOf=(data,emp)=>(data.specialDayCredits||[]).filter(c=>c.employeeId===emp);
const movesOf=(data,emp)=>(data.specialDayLedger||[]).filter(l=>l.employeeId===emp);
export const specialBalanceOf=(data,emp)=>creditsOf(data,emp).length+movesOf(data,emp).reduce((s,l)=>s+Number(l.deltaDays),0);
const fmtDay=iso=>iso?new Date(iso+'T12:00:00Z').toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short',year:'numeric'}):'';
const fmtAt=at=>at?new Date(at).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}):'';
export function specialHistory(data,emp){
 const credits=creditsOf(data,emp).map(c=>({id:'credit:'+c.day,day:c.day,reason:c.reason,deltaDays:1,at:null}));
 const moves=movesOf(data,emp).map(l=>({id:l.id,day:l.day||null,reason:l.reason,deltaDays:Number(l.deltaDays),at:l.at||null}));
 return [...credits,...moves].sort((a,b)=>(b.day||b.at||'').localeCompare(a.day||a.at||''));
}
export default function SpecialOverview({data,write,onDetails}){
 const known=knownMap(data.settings);
 return <section className="panel overtime-overview special-overview"><div className="section-heading"><h2>Récupération férié / dimanche</h2><span>{data.employees.length} salariés</span></div><p className="muted">Un jour est crédité par férié ouvert ou dimanche ouvert travaillé, dès que la journée est au planning. Le salarié pose un jour entier, validé comme les autres demandes. Le solde saisi est le total, crédits du planning inclus. « À renseigner » : le compteur n’a jamais été enregistré — les validations de ce type sont suspendues pour ce salarié.</p><div className="overtime-table-wrap"><table className="overtime-table"><thead><tr><th>Salarié</th><th>Crédits planning</th><th>Solde enregistré</th><th>Jours</th><th>Actions</th></tr></thead><tbody>{data.employees.map(e=><SpecialRow key={e.id} employee={e} credits={creditsOf(data,e.id).length} balance={specialBalanceOf(data,e.id)} known={known[e.id]===true} write={write} onDetails={onDetails}/>)}</tbody></table></div></section>;
}
function SpecialRow({employee,credits,balance,known,write,onDetails}){
 const [base,setBase]=useState(known?balance:null),[days,setDays]=useState(known?String(balance):''),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[saved,setSaved]=useState(false);
 const total=Number(days),dirty=base===null?days!=='':total!==base,valid=/^\d+$/.test(days)&&total<=366,stale=known&&base!==balance;
 useEffect(()=>{if(!dirty){setBase(known?balance:null);setDays(known?String(balance):'');}},[balance,known,dirty]);
 const reset=()=>{setBase(known?balance:null);setDays(known?String(balance):'');setErr('');setSaved(false);};
 const save=async()=>{setBusy(true);setErr('');setSaved(false);try{await write('/api/planning','POST',{admin:true,action:'specialSetBalance',target:employee.id,days:total,originalBalance:base===null?null:base});setBase(total);setSaved(true);}catch(e){setErr(e.message);}finally{setBusy(false);}};
 return <tr className={dirty?'dirty':''}><th scope="row">{employee.name}{employee.active===false&&<small>Archivé</small>}</th><td>{credits} jour{credits>1?'s':''}</td><td>{base===null?<span className="balance-unknown">à renseigner</span>:<strong>{balance} jour{balance>1?'s':''}</strong>}</td><td><input type="number" min="0" max="366" step="1" value={days} placeholder={base===null?'—':undefined} disabled={busy} aria-label={'Jours férié/dimanche de '+employee.name} onChange={e=>{setDays(e.target.value);setSaved(false);}}/></td><td><div className="overtime-row-actions"><button className="btn small" disabled={busy||!dirty||!valid||stale} onClick={save} aria-label={'Enregistrer le compteur férié/dimanche de '+employee.name}>{busy?'Enregistrement…':'Enregistrer'}</button><button className="textbtn" onClick={()=>onDetails(employee.id)}>Détail</button>{(dirty||stale)&&<button className="textbtn" disabled={busy} onClick={reset}>{stale?'Recharger':'Annuler'}</button>}</div>{stale&&dirty&&<p role="alert" className="row-error">Le solde a changé. Rechargez cette ligne.</p>}{err&&<p role="alert" className="row-error">{err}</p>}{saved&&!dirty&&<small role="status" className="saved-status">Enregistré</small>}</td></tr>;
}
export function SpecialDetails({data,employeeId,onClose}){
 const history=specialHistory(data,employeeId),known=knownMap(data.settings)[employeeId]===true,balance=specialBalanceOf(data,employeeId);
 return <div className="panel"><div className="section-heading"><h2>{data.employees.find(e=>e.id===employeeId)?.name} · Férié / dimanche</h2><button className="textbtn" onClick={onClose}>Fermer le détail</button></div><p className="balance">Compteur férié/dimanche : {known?<strong>{balance} jour{balance>1?'s':''}</strong>:<strong>à renseigner</strong>}</p>{history.length?history.map(h=><div className="hour-entry" key={h.id}><div><strong>{h.deltaDays>0?'+':'−'}{Math.abs(h.deltaDays)} jour{Math.abs(h.deltaDays)>1?'s':''}</strong><p>{h.reason}</p><small>{h.day?fmtDay(h.day):fmtAt(h.at)}</small></div></div>):<p>Aucun jour enregistré.</p>}</div>;
}
