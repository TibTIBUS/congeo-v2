import {isClosedHoliday} from './publicHolidays.js';
import {getDayPlan} from './planning.js';
import {parseISO,toISODate,isoWeek,parityOf} from './dates.js';
import {approvedAbsences} from './sickLeave.js';
export function dutyBackups(data){try{return JSON.parse(data.settings?.dutyBackups||'{}');}catch{return {};}}
export const absenceOn=(r,day)=>r.type==='recovery'?(r.dates||[]).includes(day):r.dateStart<=day&&r.dateEnd>=day;
export const requestDayList=r=>r.type==='recovery'?[...new Set(r.dates||[])].sort():Array.from({length:Math.max(0,Math.min(370,Math.round((parseISO(r.dateEnd)-parseISO(r.dateStart))/86400000)+1))},(_,i)=>{const d=parseISO(r.dateStart);d.setDate(d.getDate()+i);return toISODate(d);});
export {storedDutyAssignments,effectiveDutyAssignments} from './dutyReplacementState.js';
import {effectiveDutyAssignments} from './dutyReplacementState.js';
export function replacementProposal(data,request){
 const backups=dutyBackups(data),absences=approvedAbsences(data),rows=[];
 for(const day of requestDayList(request)){
  if(isClosedHoliday(data,day))continue;
  const date=parseISO(day),wd=(date.getDay()+6)%7;
  const plan=getDayPlan(data.templates,data.overrides,request.employeeId,date);
  if(!plan.worked)continue;
  const parity=parityOf(isoWeek(date));
  for(const role of ['open','close'])if(plan[role]||effectiveDutyAssignments(data,request.employeeId,day).some(x=>x.role===role)){
   const candidates=(data.employees||[]).filter(e=>e.id!==request.employeeId&&backups[e.id]?.[parity]?.[wd]?.[role]).map(e=>{
    const p=getDayPlan(data.templates,data.overrides,e.id,date),assigned=effectiveDutyAssignments(data,e.id,day).some(x=>x.role===role);
    const reason=e.active===false?'Salarié inactif':absences.some(r=>r.employeeId===e.id&&absenceOn(r,day))?'Absent ce jour':!p.worked?'Repos ce jour':p[role]||assigned?'Déjà affecté à ce rôle':'';
    return {employeeId:e.id,name:e.name,available:!reason,reason};
   });rows.push({day,role,candidates});
  }
 }
 return {requestId:String(request.id),rows,version:JSON.stringify({employeeId:request.employeeId,dates:requestDayList(request),rows})};
}
export function validateReplacementChoices(data,request,review){
 const proposal=replacementProposal(data,request);
 if(!proposal.rows.length||(!review&&data.settings?.dutyBackups===undefined))return [];
 if(!review||review.version!==proposal.version||!Array.isArray(review.choices))throw Error('Vérifiez les remplaçants et actualisez les disponibilités avant de valider.');
 const seen=new Set(),counts=new Map();
 return review.choices.map(x=>{
  const row=proposal.rows.find(r=>r.day===x.day&&r.role===x.role),candidate=row?.candidates.find(c=>c.employeeId===x.employeeId&&c.available),key=x.day+'|'+x.role+'|'+x.employeeId,k=x.day+'|'+x.role;
  if(!candidate||seen.has(key)||(counts.get(k)||0)>=2)throw Error('Choix de remplaçants invalide ou disponibilité modifiée.');seen.add(key);counts.set(k,(counts.get(k)||0)+1);return {day:x.day,role:x.role,employeeId:x.employeeId};
 });
}
