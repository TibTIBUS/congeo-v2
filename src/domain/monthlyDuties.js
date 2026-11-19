import {effectiveWeekPlan} from './planning.js';
import {getOpenSundays} from './sundays.js';
import {isoWeek,toISODate} from './dates.js';

// Read-only projection of the saved planning. No stored counter or ledger change.
export function monthlyDuties(data,month,{employeeId}={}){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<2000||Number(month.slice(0,4))>2099)throw Error('Choisissez un mois valide entre 2000 et 2099.');
 const [year,m]=month.split('-').map(Number),days=new Date(year,m,0).getDate(),openSundays=new Set(getOpenSundays(data));
 // Scope before aggregation, including when fed an admin-shaped test fixture.
 const people=(data.employees||[]).filter(e=>employeeId===undefined||e.id===employeeId);
 return people.map(e=>{
  let openings=0,closings=0;const weeks=new Map();
  for(let day=1;day<=days;day++){
   const date=new Date(year,m-1,day),iso=toISODate(date);
   if(date.getDay()===0&&!openSundays.has(iso))continue;
   const w=isoWeek(date),key=w.year+'-'+w.week;
   if(!weeks.has(key))weeks.set(key,effectiveWeekPlan(data,e.id,w.year,w.week));
   const p=weeks.get(key)[(date.getDay()+6)%7];
   if(!p.worked)continue;
   // Booleans, not the number of sources assigning the same role.
   if(p.open)openings++;
   if(p.close)closings++;
  }
  return {employeeId:e.id,name:e.name,active:e.active!==false,openings,closings};
 }).filter(e=>e.active||e.openings||e.closings).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
}
