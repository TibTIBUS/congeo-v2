import {validDate} from './calendarRules.js';
export const isSunday=date=>validDate(date)&&new Date(date+'T12:00:00Z').getUTCDay()===0;
export function getOpenSundays(data){
 let dates=data?.openSundays;
 if(!Array.isArray(dates))try{dates=JSON.parse(data?.settings?.sundayOpenings||'[]');}catch{dates=[];}
 return Array.isArray(dates)?[...new Set(dates.filter(isSunday))].sort():[];
}
export function sundaySnapshot(data,date){
 return {open:getOpenSundays(data).includes(date),employees:data.employees.filter(e=>e.active!==false).map(e=>e.id).sort(),plans:Object.fromEntries(Object.entries(data.overrides||{}).filter(([key])=>key.endsWith('|'+date)).sort(([a],[b])=>a.localeCompare(b)))};
}
