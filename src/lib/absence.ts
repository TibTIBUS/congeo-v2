export type LeaveType='leave'|'recovery'|'recovery_other';
export function leaveTypeLabel(value:unknown){return value==='sick'?'Arrêt de travail':value==='recovery'?'Récupération':value==='recovery_other'?'Autre récupération · férié/dimanche':'Congés';}
export function parseLeaveType(value:unknown,fallback:LeaveType='leave'):LeaveType{
 if(value===undefined)return fallback;
 if(value!=='leave'&&value!=='recovery'&&value!=='recovery_other')throw Error('Choisissez Congés, Récupération ou Autre récupération · férié/dimanche.');
 return value;
}
