import React,{useState} from 'react';
import {monthlyDuties} from '../domain/monthlyDuties';
import {toISODate} from '../domain/dates';

export default function MonthlyDuties({data,admin=false,actor}){
 const [month,setMonth]=useState(()=>toISODate(new Date()).slice(0,7));
 const valid=/^(20\d{2})-(0[1-9]|1[0-2])$/.test(month);
 const rows=valid?monthlyDuties(data,month,admin?{}:{employeeId:actor||''}):[];
 const label=valid?new Date(month+'-01T12:00:00Z').toLocaleDateString('fr-FR',{month:'long',year:'numeric',timeZone:'Europe/Paris'}):'';
 return <section className="monthly-duties panel" aria-label={admin?'Décompte mensuel des ouvertures et fermetures':'Mon décompte mensuel des ouvertures et fermetures'}>
  <div className="monthly-duties-heading"><div><h2>{admin?'Décompte du mois':'Mon décompte du mois'}</h2><p>Ouvertures et fermetures prévues au planning enregistré.</p></div><label>Mois à afficher<input type="month" min="2000-01" max="2099-12" value={month} onChange={e=>setMonth(e.target.value)}/></label></div>
  {!valid?<p role="alert">Choisissez un mois valide entre 2000 et 2099.</p>:<><p className="monthly-duties-period" aria-live="polite">{label} · mois entier, jours à venir inclus</p><div className="monthly-duties-table-wrap"><table className="monthly-duties-table"><caption className="sr-only">{admin?'Équipe':'Mon total'} · {label}</caption><thead><tr><th scope="col">Salarié</th><th scope="col">Ouvertures</th><th scope="col">Fermetures</th></tr></thead><tbody>{rows.map(row=><tr key={row.employeeId}><th scope="row">{row.name}{!row.active&&<small>Ancien salarié</small>}</th><td>{row.openings}</td><td>{row.closings}</td></tr>)}</tbody></table></div>{!rows.length&&<p>Aucun salarié à afficher pour cette période.</p>}</>}
  <div className="monthly-duties-notes"><p>Les absences validées, l’école, les jours fériés fermés et les changements ponctuels sont pris en compte. Les dimanches exceptionnellement ouverts et les remplacements validés sont inclus. Un remplaçant de secours non affecté ne compte pas.</p><p>Une ouverture et une fermeture le même jour comptent une fois chacune. Ce tableau ne mesure pas la présence réelle et ne modifie aucun horaire, congé ou solde. Il est recalculé à partir du planning actuel : un ancien mois peut changer si les semaines types ou les affectations sont modifiées.</p></div>
 </section>;
}
