import {dutyBackups} from './dutyReplacements.js';
export const dutyState=day=>({worked:!!day?.worked,open:!!day?.open,close:!!day?.close});
export const sameDutyState=(a,b)=>['worked','open','close'].every(key=>a?.[key]===b?.[key]);

// Validate the entire batch before changing any row. The caller holds the store transaction.
export function applyDutyAssignments(db,payload){
 if(payload.admin!==true)throw Error('Cette action est réservée à la gérante.');
 const {parity,changes}=payload;
 if(!['paire','impaire'].includes(parity)||!Array.isArray(changes)||changes.length>db.employees.length*6)throw Error('Répartition des ouvertures et fermetures invalide.');
 const seen=new Set(),updates=[],backups=dutyBackups(db);
 for(const change of changes){
  const employee=db.employees.find(e=>e.id===change?.employeeId&&e.active!==false),weekday=change?.weekday;
  if(!employee||!Number.isInteger(weekday)||weekday<0||weekday>5)throw Error('Choisissez un salarié actif et un jour du lundi au samedi.');
  const key=employee.id+'|'+weekday;if(seen.has(key))throw Error('Une journée ne peut apparaître qu’une fois.');seen.add(key);
  if(['open','close'].some(k=>typeof change[k]!=='boolean')||['worked','open','close'].some(k=>typeof change.original?.[k]!=='boolean'))throw Error('Cases Ouverture et Fermeture invalides.');
  const day=db.templates[employee.id]?.[parity]?.[weekday];
  if(!sameDutyState(dutyState(day),change.original))throw Error(`La journée de ${employee.name} a changé. Rechargez les affectations avant d’enregistrer.`);
  if(!day||(!day.worked&&(change.open||change.close)))throw Error(`${employee.name} est en repos sur cette journée. Modifiez d’abord ses horaires dans Semaines types.`);
  if(change.backups!==undefined){for(const role of ['open','close']){if(typeof change.backups[role]!=='boolean'||typeof change.originalBackups?.[role]!=='boolean')throw Error('Remplaçants invalides.');if(!!backups[employee.id]?.[parity]?.[weekday]?.[role]!==change.originalBackups[role])throw Error('Les remplaçants ont changé. Rechargez avant d’enregistrer.');}}
  updates.push({day,employeeId:employee.id,weekday,open:change.open,close:change.close,backups:change.backups});
 }
 for(const update of updates){update.day.open=update.open;update.day.close=update.close;if(update.backups){backups[update.employeeId]??={};backups[update.employeeId][parity]??={};backups[update.employeeId][parity][update.weekday]=update.backups;}}
 db.settings??={};if(updates.some(x=>x.backups))db.settings.dutyBackups=JSON.stringify(backups);
 return updates.length;
                                                                        }
