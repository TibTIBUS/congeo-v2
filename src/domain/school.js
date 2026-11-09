import {validDate} from './calendarRules.js';
export function schoolPeriods(data){
 if(Array.isArray(data.schoolPeriods))return data.schoolPeriods;
 try{return JSON.parse(data.settings?.schoolPeriods||'[]');}catch{return [];}
}
export const schoolOn=(data,employeeId,day)=>new Date(day+'T12:00:00Z').getUTCDay()!==0&&schoolPeriods(data).some(p=>p.employeeId===employeeId&&p.start<=day&&day<=p.end);
export function saveSchoolPeriod(db,payload){
 if(payload.admin!==true)throw Error('Cette action est réservée à la gérante.');
 const periods=schoolPeriods(db);
 if(payload.version!==JSON.stringify(periods))throw Error('Les périodes ont changé. Rechargez la page.');
 let next;
 if(payload.remove){if(!periods.some(p=>p.id===payload.remove))throw Error('Période introuvable.');next=periods.filter(p=>p.id!==payload.remove);}
 else{
  const {employeeId,start,end}=payload;
  if(!db.employees.some(e=>e.id===employeeId&&e.active!==false))throw Error('Choisissez un salarié actif.');
  if(!validDate(start)||!validDate(end)||end<start||(new Date(end)-new Date(start))/86400000>90)throw Error('Choisissez une période valide de 91 jours maximum.');
  if(periods.some(p=>p.employeeId===employeeId&&p.start<=end&&start<=p.end))throw Error('Une période École existe déjà sur ces dates.');
  if(db.requests.some(r=>r.employeeId===employeeId&&r.status==='approved'&&r.type!=='recovery'&&r.dateStart<=end&&start<=r.dateEnd))throw Error('Un congé validé croise cette période. Vérifiez les dates.');
  next=[...periods,{id:employeeId+'|'+start+'|'+end,employeeId,start,end}];
 }
 db.settings??={};db.settings.schoolPeriods=JSON.stringify(next);return next;
}

export function employmentStarts(data){try{return data.employmentStarts||JSON.parse(data.settings?.employmentStarts||'{}');}catch{return {};}}
export const beforeEmployment=(data,id,day)=>!!employmentStarts(data)[id]&&day<employmentStarts(data)[id];
