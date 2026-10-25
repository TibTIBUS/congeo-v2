// Monthly declarations for payroll, independent from the recovery ledger.
export function validMonth(month) { return typeof month==='string' && /^(20\d{2})-(0[1-9]|1[0-2])$/.test(month); }
const key=month=>'monthlyOvertime:'+month;
function records(db,month){
 if(!validMonth(month))throw Error('Choisissez un mois valide.');
 return JSON.parse(db.settings?.[key(month)]||'{}');
}
export function monthlyOvertime(db,month){
 const saved=records(db,month);
 const rows=db.employees.filter(e=>e.active!==false||Object.hasOwn(saved,e.id)).map(e=>({employeeId:e.id,name:saved[e.id]?.name||e.name,active:e.active!==false,entry:saved[e.id]||null}));
 rows.sort((a,b)=>a.name.localeCompare(b.name,'fr'));
 return {month,rows};
}
export function saveMonthlyOvertime(db,payload){
 if(payload?.admin!==true)throw Error('Cette page est réservée à la gérante.');
 const saved=records(db,payload.month),changes=payload.changes;
 if(!Array.isArray(changes)||changes.length>db.employees.length)throw Error('Tableau mensuel invalide.');
 const seen=new Set();
 // Validate the entire batch before writing, including concurrent changes.
 const updates=changes.map(c=>{
  const employee=db.employees.find(e=>e.id===c.employeeId);
  if(!employee||(employee.active===false&&!saved[c.employeeId])||seen.has(c.employeeId))throw Error('Salarié invalide ou présent plusieurs fois.');
  seen.add(c.employeeId);
  if(JSON.stringify(c.original)!==JSON.stringify(saved[c.employeeId]||null))throw Error('Les heures de '+employee.name+' ont changé. Rechargez le mois avant d’enregistrer.');
  if(c.entry===null)return {employeeId:c.employeeId,entry:null};
  const {minutes,note}=c.entry||{};
  if(!Number.isInteger(minutes)||minutes<0||minutes>60000||typeof note!=='string'||note.length>500)throw Error('Indiquez une durée positive ou nulle et une observation de 500 caractères maximum.');
  return {employeeId:c.employeeId,entry:{minutes,note:note.trim(),name:saved[c.employeeId]?.name||employee.name}};
 });
 for(const c of updates){if(c.entry===null)delete saved[c.employeeId];else saved[c.employeeId]=c.entry;}
 db.settings??={};db.settings[key(payload.month)]=JSON.stringify(saved);
 return monthlyOvertime(db,payload.month);
}
