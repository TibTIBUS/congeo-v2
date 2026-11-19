function absenceCaption(request){
 if(request.leave_type==='sick')return 'En arrêt de travail';
 if(request.leave_type==='recovery_other')return request.status==='approved'?'En autre récupération':request.status==='pending'?'Autre récupération demandée':request.status==='refused'?'Autre récupération refusée':'Autre récupération';
 const recovery=request.leave_type==='recovery';
 if(request.status==='approved')return recovery?'En récupération':'En congé';
 if(request.status==='pending')return recovery?'Récupération demandée':'Congé demandé';
 if(request.status==='refused')return recovery?'Récupération refusée':'Congé refusé';
 return recovery?'Récupération':'Congé';
}

export default function CalendarDayContent({personal,events,actor,employeeName,schoolPeople=[]}){
 // An approved personal absence already appears in the personal section.
 const teamEvents=events.filter(request=>!(personal&&['leave','recovery','recovery_other','sick'].includes(personal.kind)&&request.employee_id===actor&&request.status==='approved'));
 return <>
  {personal?.replacementOpen&&<span className="replacement-label">Remplacement ouverture</span>}{personal?.replacementClose&&<span className="replacement-label">Remplacement fermeture</span>}{personal&&<span className={'calendar-personal calendar-personal-'+personal.kind}>
   {personal.kind==='work'?<span className="calendar-shift-ranges">{personal.ranges.map(range=><span key={range}>{range}</span>)}</span>:<span className="calendar-personal-status">{personal.kind==='school'?'École':personal.kind==='holiday'?'Férié · fermé':personal.kind==='sick'?'Mon arrêt de travail':personal.kind==='rest'?'Repos':personal.kind==='recovery'?'Ma récupération':personal.kind==='recovery_other'?'Mon autre récupération':'Mon congé'}</span>}
  </span>}
  {schoolPeople.filter(e=>e.id!==actor||personal?.kind!=='school').map(e=><span key={'school-'+e.id} className="school-chip calendar-school">École : {e.name}</span>)}
  {teamEvents.length>0&&<span className="calendar-team-absences">
   {teamEvents.slice(0,2).map(request=><span className={'event calendar-absence '+request.status+(request.leave_type==='sick'?' sick-absence':'')} key={request.id}>
    <span className="calendar-absence-caption">{absenceCaption(request)} :</span>
    <strong>{employeeName(request.employee_id)}</strong>
   </span>)}
   {teamEvents.length>2&&<span className="more">+{teamEvents.length-2} autre{teamEvents.length>3?'s':''} · voir le détail</span>}
  </span>}
 </>;
}
