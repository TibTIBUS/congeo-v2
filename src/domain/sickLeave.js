import {validDate} from './calendarRules.js';
export function sickDays(start,end){
 if(!validDate(start)||!validDate(end)||end<start)throw Error('Vérifiez les dates de début et de fin de l’arrêt.');
 const count=Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000)+1;
 if(count>3660)throw Error('Un arrêt ne peut pas dépasser dix ans.');
 return Array.from({length:count},(_,i)=>new Date(Date.parse(start+'T12:00:00Z')+i*86400000).toISOString().slice(0,10));
}
export function sickHistory(data){
 if(Array.isArray(data.sickLeaves))return data.sickLeaves;
 return JSON.parse(data.settings?.sickLeaves||'[]');
}
export const activeSickLeaves=data=>sickHistory(data).filter(r=>r.status!=='cancelled');
export const sickCovers=(record,date)=>record.status!=='cancelled'&&record.dateStart<=date&&record.dateEnd>=date;
export const sickAsRequests=data=>activeSickLeaves(data).map(r=>({...r,type:'sick',status:'approved'}));
export const approvedAbsences=data=>[...sickAsRequests(data),...(data.requests||[]).filter(r=>r.status==='approved')];
export const hasSickConflict=(data,employeeId,days)=>activeSickLeaves(data).some(r=>r.employeeId===employeeId&&days.some(d=>sickCovers(r,d)));
export const sickCalendarRows=data=>activeSickLeaves(data).map(r=>({id:r.id,employee_id:r.employeeId,leave_type:'sick',start:r.dateStart,end:r.dateEnd,days:JSON.stringify(sickDays(r.dateStart,r.dateEnd)),status:'approved',created:r.createdAt,revision:r.revision}));
export function sickCounters(data,employeeId,year){
 const all=new Set(),annual=new Set();
 for(const r of activeSickLeaves(data).filter(r=>r.employeeId===employeeId))for(const day of sickDays(r.dateStart,r.dateEnd)){all.add(day);if(day.startsWith(String(year)+'-'))annual.add(day);}
 return {annual:annual.size,total:all.size};
}
