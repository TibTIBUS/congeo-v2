export type LeaveType='leave'|'recovery';
export function leaveTypeLabel(value:unknown){return value==='sick'?'Arrêt de travail':value==='recovery'?'Récupération':'Congés';}
export function parseLeaveType(value:unknown,fallback:LeaveType='leave'):LeaveType{
 if(value===undefined)return fallback;
 if(value!=='leave'&&value!=='recovery')throw Error('Choisissez Congés ou Récupération.');
 return value;
}
