import {randomUUID} from 'node:crypto';
import {sickDays,sickHistory,activeSickLeaves} from '../src/domain/sickLeave.js';
import {requestDates} from '../src/domain/requests.js';
export function changeSickLeave(db,p){
 if(p?.admin!==true)throw Error('Cette action est réservée à la gérante.');
 const history=structuredClone(sickHistory(db)),previous=history.find(r=>r.id===p.id);
 if(p.id&&(!previous||p.originalRevision!==previous.revision))throw Error('Cet arrêt a changé. Rechargez la liste avant de continuer.');
 if(!['save','cancel','restore'].includes(p.action))throw Error('Action incorrecte.');
 if(p.action!=='save'&&!previous)throw Error('Arrêt introuvable.');
 let record;
 if(p.action==='cancel')record={...previous,status:'cancelled'};
 else {
  if(p.action==='save'&&previous?.status==='cancelled')throw Error('Rétablissez cet arrêt avant de le modifier.');
  record=p.action==='restore'?{...previous,status:'active'}:{id:previous?.id||'sick-'+randomUUID(),employeeId:p.employeeId,dateStart:p.dateStart,dateEnd:p.dateEnd,status:'active',createdAt:previous?.createdAt||new Date().toISOString()};
  const employee=db.employees.find(e=>e.id===record.employeeId);
  if(!employee||(employee.active===false&&!previous))throw Error('Sélectionnez un salarié actif.');
  const days=new Set(sickDays(record.dateStart,record.dateEnd));
  if(activeSickLeaves({sickLeaves:history}).some(r=>r.id!==record.id&&r.employeeId===record.employeeId&&r.dateStart<=record.dateEnd&&r.dateEnd>=record.dateStart))throw Error('Un arrêt est déjà enregistré pour ce salarié sur ces dates. Modifiez la période existante.');
  if(db.requests.some(r=>r.employeeId===record.employeeId&&r.status==='approved'&&requestDates(r).some(d=>days.has(d))))throw Error('Un congé ou une récupération est déjà validé pour ce salarié sur ces dates. Corrigez cette absence avant d’enregistrer l’arrêt.');
 }
 record.revision=randomUUID();record.updatedAt=new Date().toISOString();
 if(previous)history[history.findIndex(r=>r.id===previous.id)]=record;else history.push(record);
 db.settings??={};db.settings.sickLeaves=JSON.stringify(history);
 return {record};
}
