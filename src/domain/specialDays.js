// Compteur « autre récupération · férié / dimanche » : 1 jour crédité par jour
// férié OUVERT ou dimanche ouvert exceptionnellement travaillé, dès que la
// journée est au planning (règle validée par Thibaut, 19 nov 2026 21h58 ;
// Aline pourra ajuster). Compteur SÉPARÉ du compteur horaire de récupération,
// sans conversion. Solde de départ « à renseigner » par la gérante : jamais de
// 0 par défaut, et les validations sont suspendues tant qu'il n'est pas saisi.
//
// Les crédits sont CALCULÉS à la lecture depuis le planning (jamais stockés) :
// retirer la journée du planning retire le crédit, sans historique à rejouer.
// Seuls les mouvements sont stockés (specialDayLedger) : solde initial et
// corrections de la gérante, débits et recrédits liés aux demandes.
import {parseISO} from './dates.js';
import {frenchHolidays,holidayCalendar,closedHolidayDates} from './publicHolidays.js';
import {getOpenSundays} from './sundays.js';
import {getDayPlan,plannedMinutes} from './planning.js';
import {schoolOn,beforeEmployment} from './school.js';
import {activeSickLeaves,sickCovers} from './sickLeave.js';

export const SPECIAL_KNOWN_KEY='specialKnown';
export const specialKnownMap=db=>{try{return JSON.parse(db.settings?.[SPECIAL_KNOWN_KEY]||'{}');}catch{return{};}};
export const isSpecialKnown=(db,emp)=>specialKnownMap(db)[emp]===true;
export function markSpecialKnown(db,emp){db.settings??={};const map=specialKnownMap(db);if(map[emp])return;map[emp]=true;db.settings[SPECIAL_KNOWN_KEY]=JSON.stringify(map);}

// Jours ouvrant droit à un crédit : fériés OUVERTS des années configurées dans
// l'onglet « Jours fériés » (le 1er mai reste exclu, il est toujours fermé) +
// dimanches ouverts exceptionnellement.
export function creditableDays(db){
 const years=Object.keys(holidayCalendar(db).years||{}),closed=new Set(closedHolidayDates(db));
 const holidays=years.flatMap(y=>frenchHolidays(Number(y))).filter(h=>h.date.slice(5,10)!=='05-01'&&!closed.has(h.date)).map(h=>({day:h.date,reason:'Férié travaillé · '+h.name}));
 return [...holidays,...getOpenSundays(db).map(day=>({day,reason:'Dimanche travaillé'}))].sort((a,b)=>a.day.localeCompare(b.day));
}

// La journée compte comme travaillée si le salarié a des heures prévues ce
// jour-là et n'est ni absent (congé/récup validée), ni en arrêt, ni à l'école,
// ni avant sa date d'arrivée.
export function worksForCredit(db,emp,day){
 const e=(db.employees||[]).find(x=>x.id===emp);if(!e||e.active===false)return false;
 if(beforeEmployment(db,emp,day)||schoolOn(db,emp,day))return false;
 const plan=getDayPlan(db.templates||{},db.overrides||{},emp,parseISO(day));
 if(plannedMinutes(plan)<=0)return false;
 if(activeSickLeaves(db).some(r=>r.employeeId===emp&&sickCovers(r,day)))return false;
 return !(db.requests||[]).some(r=>r.employeeId===emp&&r.status==='approved'&&(r.dates?r.dates.includes(day):(r.dateStart<=day&&day<=r.dateEnd)));
}

// Crédits calculés : [{employeeId, day, reason, deltaDays:1}]
export function specialDayCredits(db){
 const out=[];
 for(const e of (db.employees||[]).filter(e=>e.active!==false))
  for(const {day,reason} of creditableDays(db))
   if(worksForCredit(db,e.id,day))out.push({employeeId:e.id,day,reason,deltaDays:1});
 return out;
}

export const specialMovements=(db,emp)=>(db.specialDayLedger||[]).filter(l=>l.employeeId===emp);
export const specialBalance=(db,emp)=>specialMovements(db,emp).reduce((s,l)=>s+Number(l.deltaDays),0)+specialDayCredits(db).filter(c=>c.employeeId===emp).length;

// Historique fusionné (crédits calculés + mouvements stockés), du plus récent
// au plus ancien : affichage salarié et gérante.
export function specialHistory(db,emp){
 const credits=specialDayCredits(db).filter(c=>c.employeeId===emp).map(c=>({id:'credit:'+emp+':'+c.day,day:c.day,reason:c.reason,deltaDays:1,at:null,kind:'credit'}));
 const moves=specialMovements(db,emp).map(l=>({id:l.id,day:l.day||null,reason:l.reason,deltaDays:Number(l.deltaDays),at:l.at||null,kind:'move'}));
 return [...credits,...moves].sort((a,b)=>(b.day||b.at||'').localeCompare(a.day||a.at||''));
}

// Validation d'une demande « autre récupération · férié/dimanche » : suspendue
// tant que le solde est « à renseigner », bloquée s'il ne couvre pas les jours.
export function checkSpecialDebit(db,emp,days){
 if(!isSpecialKnown(db,emp))return {ok:false,debitDays:0,reason:'Compteur férié/dimanche à renseigner : la validation est suspendue tant que la gérante n’a pas enregistré le solde de ce salarié (onglet « Récupération »).'};
 const need=(days||[]).length;
 if(need<=0)return {ok:false,debitDays:0,reason:'Aucun jour posé pour cette récupération.'};
 if(need>specialBalance(db,emp))return {ok:false,debitDays:0,reason:'Le compteur férié/dimanche de ce salarié ne couvre pas les jours posés.'};
 return {ok:true,debitDays:need};
}
