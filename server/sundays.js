import {getOpenSundays,isSunday,sundaySnapshot} from '../src/domain/sundays.js';
import {today} from '../src/domain/calendarRules.js';
import {requestDates} from '../src/domain/requests.js';

export function applySundayOpening(db,payload,cleanDay){
 if(payload.admin!==true)throw Error('Cette action est réservée à la gérante.');
 const {date,open}=payload;
 if(!isSunday(date)||typeof open!=='boolean')throw Error('Choisissez la date d’un dimanche.');
 const snapshot=sundaySnapshot(db,date);
 if(JSON.stringify(payload.original)!==JSON.stringify(snapshot))throw Error('Ce dimanche a changé. Rechargez les horaires enregistrés avant de continuer.');
 if(!snapshot.open&&open&&date<today())throw Error('Choisissez un dimanche à partir d’aujourd’hui.');
 const recoveries=db.requests.filter(r=>r.status==='approved'&&r.type==='recovery'&&requestDates(r).includes(date));
 if(!open){
  if(recoveries.length)throw Error('Une récupération est validée ce dimanche. Corrigez ou annulez cette récupération avant de fermer la journée.');
  for(const key of Object.keys(db.overrides))if(key.endsWith('|'+date))delete db.overrides[key];
  db.settings.sundayOpenings=JSON.stringify(getOpenSundays(db).filter(day=>day!==date));return;
 }
 if(!Array.isArray(payload.rows)||payload.rows.length!==snapshot.employees.length)throw Error('Vérifiez la liste des salariés de ce dimanche.');
 const rows=[],seen=new Set();
 for(const row of payload.rows){
  if(!snapshot.employees.includes(row.employeeId)||seen.has(row.employeeId))throw Error('Vérifiez la liste des salariés de ce dimanche.');
  seen.add(row.employeeId);const day=cleanDay(row.day);
  if(!day)throw Error('Vérifiez les horaires du matin et de l’après-midi.');
  if(recoveries.some(r=>r.employeeId===row.employeeId)){
   const previous=db.overrides[row.employeeId+'|'+date];
   if(['worked','start','end','pauseStart','pauseEnd'].some(key=>(previous?.[key]??null)!==(day[key]??null)))throw Error('Une récupération est validée pour ce salarié. Corrigez-la avant de modifier ses horaires.');
  }
  rows.push({employeeId:row.employeeId,day});
 }
 for(const row of rows)db.overrides[row.employeeId+'|'+date]=row.day;
 db.settings.sundayOpenings=JSON.stringify([...new Set([...getOpenSundays(db),date])].sort());
}
