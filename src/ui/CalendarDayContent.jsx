function absenceCaption(request){
 const recovery=request.leave_type==='recovery';
 if(request.status==='approved')return recovery?'En récupération':'En congé';
 if(request.status==='pending')return recovery?'Récupération demandée':'Congé demandé';
 if(request.status==='refused')return recovery?'Récupération refusée':'Congé refusé';
 return recovery?'Récupération':'Congé';
}

export default function CalendarDayContent({personal,events,actor,employeeName}){
 // An approved personal absence already appears in the personal section.
 const teamEvents=events.filter(request=>!(personal&&['leave','recovery'].includes(personal.kind)&&request.employee_id===actor&&request.status==='approved'));
 return <>
  {personal&&<span className={'calendar-personal calendar-personal-'+personal.kind}>
   {personal.kind==='work'?<span className="calendar-shift-ranges">{personal.ranges.map(range=><span key={range}>{range}</span>)}</span>:<span className="calendar-personal-status">{personal.kind==='rest'?'Repos':personal.kind==='recovery'?'Ma récupération':'Mon congé'}</span>}
  </span>}
  {teamEvents.length>0&&<span className="calendar-team-absences">
   {teamEvents.slice(0,2).map(request=><span className={'event calendar-absence '+request.status} key={request.id}>
    <span className="calendar-absence-caption">{absenceCaption(request)} :</span>
    <strong>{employeeName(request.employee_id)}</strong>
   </span>)}
   {teamEvents.length>2&&<span className="more">+{teamEvents.length-2} autre{teamEvents.length>3?'s':''} · voir le détail</span>}
  </span>}
 </>;
}
