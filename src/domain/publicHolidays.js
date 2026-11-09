import {getOpenSundays} from './sundays.js';
import {validDate,today} from './calendarRules.js';
const iso=d=>d.toISOString().slice(0,10);
export function frenchHolidays(year){
 if(!Number.isInteger(year)||year<2020||year>2100)throw Error('Année invalide.');
 const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
 const easter=new Date(Date.UTC(year,month-1,day,12));const move=n=>{const x=new Date(easter);x.setUTCDate(x.getUTCDate()+n);return iso(x);};
 return [[`${year}-01-01`,"Jour de l'An"],[move(1),'Lundi de Pâques'],[`${year}-05-01`,'Fête du Travail'],[`${year}-05-08`,'Victoire 1945'],[move(39),'Ascension'],[move(50),'Lundi de Pentecôte'],[`${year}-07-14`,'Fête nationale'],[`${year}-08-15`,'Assomption'],[`${year}-11-01`,'Toussaint'],[`${year}-11-11`,'Armistice 1918'],[`${year}-12-25`,'Noël']].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,name])=>({date,name}));
}
export function holidayCalendar(data){try{return JSON.parse(data.settings?.holidayCalendar||'{}');}catch{return {};}}
export function closedHolidayDates(data){if(Array.isArray(data.closedHolidays))return data.closedHolidays;return [...new Set(Object.values(holidayCalendar(data).years||{}).flatMap(y=>[...(y.historyClosed||[]),...(y.closed||[]).filter(day=>day>=y.effectiveFrom)]))].sort();}
export const isClosedHoliday=(data,day)=>closedHolidayDates(data).includes(day);
const signature=r=>JSON.stringify([r.type,r.dateStart,r.dateEnd,r.dates]);
export function holidayRequestDays(data,r,baseDays){const saved=holidayCalendar(data).protectedRequests?.[r.id];if(r.status==='approved'&&saved?.signature===signature(r))return saved.days;return baseDays.filter(day=>!isClosedHoliday(data,day));}
function rawDays(r){if(r.type==='recovery')return [...new Set(r.dates||[])];const out=[];if(!validDate(r.dateStart)||!validDate(r.dateEnd))return out;const d=new Date(r.dateStart+'T12:00:00Z');while(iso(d)<=r.dateEnd&&out.length<371){out.push(iso(d));d.setUTCDate(d.getUTCDate()+1);}return out;}
export function holidayPreview(db,payload){
 const year=Number(payload.year),holidays=frenchHolidays(year),dates=new Set(holidays.map(h=>h.date));
 if(!validDate(payload.effectiveFrom)||!payload.effectiveFrom.startsWith(String(year))||payload.effectiveFrom<today())throw Error('Choisissez une date d’effet dans l’année et à partir d’aujourd’hui.');
 if(!Array.isArray(payload.open)||new Set(payload.open).size!==payload.open.length||payload.open.some(day=>!dates.has(day)))throw Error('Jours fériés ouverts invalides.');
 if(payload.open.includes(`${year}-05-01`))throw Error('Le 1er mai reste fermé. Une exception légale doit être vérifiée séparément.');
 const previous=holidayCalendar(db),entry={historyClosed:closedHolidayDates(db).filter(day=>day.startsWith(String(year))&&day<payload.effectiveFrom),effectiveFrom:payload.effectiveFrom,closed:holidays.filter(h=>!payload.open.includes(h.date)).map(h=>h.date)},next={...previous,years:{...previous.years,[year]:entry}},proposed={...db,settings:{...db.settings,holidayCalendar:JSON.stringify(next)}};
 const closed=closedHolidayDates(proposed).filter(day=>day.startsWith(String(year))),current=closedHolidayDates(db),changed=[...new Set([...closed,...current.filter(day=>day.startsWith(String(year)))])].filter(day=>closed.includes(day)!==current.includes(day));
 const impacted=(db.requests||[]).filter(r=>['approved','pending','proposed'].includes(r.status)&&rawDays(r).some(day=>changed.includes(day))).map(r=>({id:r.id,employeeId:r.employeeId,status:r.status,type:r.type,days:rawDays(r).filter(day=>changed.includes(day))}));
 const overrides=Object.keys(db.overrides||{}).filter(key=>changed.some(day=>key.endsWith('|'+day)));
 const assignments=(db.requests||[]).flatMap(r=>(r.details?.dutyReplacements||[]).filter(x=>changed.includes(x.day)).map(x=>({...x,requestId:r.id})));
 const version=JSON.stringify({previous,year,entry,impacted,overrides:overrides.map(key=>[key,db.overrides[key]]),assignments});return {year,entry,changed,impacted,overrides,assignments,version};
}
export function saveHolidayCalendar(db,payload){if(payload.admin!==true)throw Error('Cette action est réservée à la gérante.');const preview=holidayPreview(db,payload);if(payload.version!==preview.version||payload.confirm!==true)throw Error('Vérifiez les incidences et confirmez avant d’appliquer.');const cfg=holidayCalendar(db),protectedRequests={...cfg.protectedRequests};
 for(const r of db.requests||[])if(r.status==='approved'){
  const base=rawDays(r).filter(day=>r.type==='recovery'||new Date(day+'T12:00:00Z').getUTCDay()!==0||getOpenSundays(db).includes(day));
  protectedRequests[r.id]={signature:signature(r),days:holidayRequestDays(db,r,base)};
 }
 db.settings??={};db.settings.holidayCalendar=JSON.stringify({...cfg,years:{...cfg.years,[preview.year]:{...preview.entry,confirmedAt:new Date().toISOString()}},protectedRequests});return preview;
}
export function forgetHolidayProtection(db,id){const cfg=holidayCalendar(db);if(cfg.protectedRequests?.[id]){delete cfg.protectedRequests[id];db.settings.holidayCalendar=JSON.stringify(cfg);}}
