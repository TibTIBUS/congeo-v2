import {getDayPlan} from './planning.js';
import {parseISO} from './dates.js';
import {getOpenSundays} from './sundays.js';

export function requestCoversDay(request,day,openSundays=[]){
 if(parseISO(day).getDay()===0&&!openSundays.includes(day))return false;
 if(Array.isArray(request.days))return request.days.includes(day);
 if(typeof request.days==='string'){
  try{return JSON.parse(request.days).includes(day);}catch{/* Legacy rows fall back to their dates. */}
 }
 return request.start<=day&&request.end>=day;
}
const clock=value=>value.replace(/^0/,'').replace(':','h').replace(/h00$/,'h');
export function employeeCalendarDay(schedule,employeeId,day,requests=[]){
 // A pending response for another selected name must never supply its hours.
 if(!employeeId||!schedule||schedule.employeeId!==employeeId)return null;
 const absence=requests.find(r=>r.employee_id===employeeId&&r.status==='approved'&&requestCoversDay(r,day,getOpenSundays(schedule)));
 if(absence)return {kind:absence.leave_type==='recovery'?'recovery':'leave',label:absence.leave_type==='recovery'?'Récupération':'Congé validé'};
 const date=parseISO(day),plan=getDayPlan(schedule.templates||{},schedule.overrides||{},employeeId,date);
 if((date.getDay()===0&&!getOpenSundays(schedule).includes(day))||!plan.worked||!plan.start||!plan.end)return {kind:'rest',label:'Repos'};
 const slots=plan.pauseStart&&plan.pauseEnd?[[plan.start,plan.pauseStart],[plan.pauseEnd,plan.end]]:[[plan.start,plan.end]];
 return {kind:'work',start:clock(plan.start),end:clock(plan.end),ranges:slots.map(([a,b])=>`${clock(a)}–${clock(b)}`),label:'Mes horaires : '+slots.map(([a,b])=>`${clock(a)} à ${clock(b)}`).join(' et ')};
}
