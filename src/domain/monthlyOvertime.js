export const formatOvertime=minutes=>`${Math.floor(minutes/60)} h ${String(minutes%60).padStart(2,'0')}`;
export const monthLabel=month=>new Date(month+'-01T12:00:00Z').toLocaleDateString('fr-FR',{month:'long',year:'numeric',timeZone:'Europe/Paris'});
export function overtimeDraft(entry){return entry?{hours:String(Math.floor(entry.minutes/60)),minutes:String(entry.minutes%60),note:entry.note}:{hours:'',minutes:'',note:''};}
export function overtimeEntry(draft){
 if(draft.hours===''&&draft.minutes===''&&draft.note.trim()==='')return null;
 if((draft.hours!==''&&!/^\d+$/.test(draft.hours))||(draft.minutes!==''&&!/^\d+$/.test(draft.minutes))||Number(draft.minutes)>59)throw Error('Utilisez des heures entières et des minutes de 0 à 59.');
 if(draft.hours===''&&draft.minutes==='')throw Error('Renseignez la durée associée à l’observation.');
 const minutes=Number(draft.hours)*60+Number(draft.minutes);
 if(minutes>60000)throw Error('La durée dépasse 1 000 heures.');
 return {minutes,note:draft.note.trim()};
}
export function overtimeChanges(rows,drafts){
 return rows.flatMap(row=>{
  const entry=overtimeEntry(drafts[row.employeeId]||overtimeDraft(row.entry));
  const old=row.entry?{minutes:row.entry.minutes,note:row.entry.note}:null;
  return JSON.stringify(entry)===JSON.stringify(old)?[]:[{employeeId:row.employeeId,original:row.entry,entry}];
 });
}
