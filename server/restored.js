// V1 leave workflows on the V2 data model. All mutations run under the store lock.
import { randomUUID } from 'node:crypto';
import {workdays,blockedReason,today,validDate,defaultBlocks} from '../src/domain/calendarRules.js';
import {recoveryPlannedMinutes} from '../src/domain/requests.js';
import {defaultWorkTemplates,STAFF_COLORS} from '../src/domain/defaults.js';
import {getOpenSundays} from '../src/domain/sundays.js';
import {sickCalendarRows,hasSickConflict} from '../src/domain/sickLeave.js';
export const id=()=>randomUUID();
const details=r=>r.details||{};
export const dates=(r,openSundays=[])=>r.type==='recovery'?[...new Set(r.dates||[])]:r.dateStart===r.dateEnd&&validDate(r.dateStart)&&new Date(r.dateStart+'T12:00:00Z').getUTCDay()===0&&!openSundays.includes(r.dateStart)?[]:workdays(r.dateStart,r.dateEnd,openSundays);
const balance=(db,emp)=>db.recoveryLedger.filter(l=>l.employeeId===emp).reduce((s,l)=>s+Number(l.deltaMin),0);
export function toV1(r,openSundays=[]){const ds=dates(r,openSundays);return {id:r.id,employee_id:r.employeeId,leave_type:r.type,start:r.dateStart||ds[0],end:r.dateEnd||ds.at(-1),days:JSON.stringify(ds),status:r.status==='rejected'?'refused':r.status,created:r.createdAt,...details(r)};}
export function planningData(db,admin,actor){return {openSundays:getOpenSundays(db),employees:db.employees.map(e=>({id:e.id,name:e.name,role:e.role,color:e.color,active:e.active===false?0:1})),requests:[...db.requests.map(r=>{const x=toV1(r,getOpenSundays(db));if(!admin&&actor!==r.employeeId){delete x.note;delete x.answer;}return x;}),...sickCalendarRows(db)],blocks:(db.settings?.blocksConfigured==='true'||db.blocks?.length)?db.blocks:defaultBlocks,firstWeek:db.settings?.firstWeek!=='false',profile:db.employees.find(e=>e.id===actor)||null,outbox:admin?(db.outbox||[]):[],mailReady:!!process.env.RESEND_API_KEY&&!!process.env.EMAIL_FROM};}
function queued(db,r,body){const e=db.employees.find(e=>e.id===r.employeeId);if(e?.notify&&e.email){db.outbox??=[];db.outbox.push({id:id(),employee_id:e.id,subject:'Votre demande d’absence',body,status:'queued',created:new Date().toISOString()});}}
function checkDates(db,start,end,allowPast=false){const days=workdays(start,end,getOpenSundays(db));if(!allowPast&&start<today())throw Error('Choisissez une date à partir d’aujourd’hui.');const blocks=(db.settings?.blocksConfigured==='true'||db.blocks?.length)?db.blocks:defaultBlocks;const bad=days.find(d=>blockedReason(d,blocks,db.settings?.firstWeek!=='false',getOpenSundays(db)));if(bad)throw Error(`${bad} : ${blockedReason(bad,blocks,db.settings?.firstWeek!=='false',getOpenSundays(db))}. Choisissez une autre période.`);return days;}
function checkCapacity(db,r){const ds=dates(r,getOpenSundays(db));if(hasSickConflict(db,r.employeeId,ds))throw Error('Un arrêt de travail est enregistré pour ce salarié sur ces dates.');for(const day of ds){const others=db.requests.filter(q=>q.id!==r.id&&q.status==='approved'&&dates(q,getOpenSundays(db)).includes(day));if(others.some(q=>q.employeeId===r.employeeId))throw Error('Ce salarié a déjà une absence validée sur cette période.');if(others.length>=(details(r).override?2:1))throw Error(details(r).override?'Deux personnes sont déjà absentes sur cette période.':'Une personne est déjà absente sur cette période. Une dérogation est nécessaire.');}}
function deduct(db,r){if(r.type!=='recovery')return;const need=recoveryPlannedMinutes(r,db.templates,db.overrides);if(need<=0)throw Error('Aucune heure n’est prévue pour cette récupération. Renseignez d’abord le planning.');if(need>balance(db,r.employeeId))throw Error('Le solde de récupération ne couvre pas les heures prévues.');r.deductedMin=need;db.recoveryLedger.push({id:id(),employeeId:r.employeeId,deltaMin:-need,reason:'Récupération validée',requestId:r.id,at:new Date().toISOString()});}
function refund(db,r){if(r.status==='approved'&&r.type==='recovery'&&r.deductedMin>0){db.recoveryLedger.push({id:id(),employeeId:r.employeeId,deltaMin:r.deductedMin,reason:'Récupération recréditée après correction ou suppression',requestId:r.id,at:new Date().toISOString()});r.deductedMin=0;}}
function absence(r,start,end,type,openSundays=[]){r.type=type||r.type;if(!['leave','recovery'].includes(r.type))throw Error('Type d’absence invalide.');if(r.type==='recovery'){r.dates=workdays(start,end,openSundays);delete r.dateStart;delete r.dateEnd;}else{r.dateStart=start;r.dateEnd=end;delete r.dates;}}
function stale(r,p){const x=toV1(r);if((p.originalStart!==undefined&&p.originalStart!==x.start)||(p.originalEnd!==undefined&&p.originalEnd!==x.end)||(p.originalStatus!==undefined&&p.originalStatus!==x.status))throw Error('Cette demande a changé. Actualisez le planning avant de continuer.');}
export function changePlanning(db,p){
 db.settings??={};db.blocks??=[];db.outbox??=[];
 const admin=p.admin===true,actor=String(p.employee||''),a=p.action;
 const requireAdmin=()=>{if(!admin)throw Error('Cette action est réservée à la gérante.');};
 if(!admin&&!db.employees.some(e=>e.id===actor&&e.active!==false))throw Error('Sélectionnez un salarié actif.');
 if(a==='employee'){requireAdmin();const name=String(p.name||'').trim();if(!name||name.length>80)throw Error('Indiquez un nom de 1 à 80 caractères.');const color=STAFF_COLORS.find(color=>!db.employees.some(e=>e.color===color))||STAFF_COLORS[db.employees.length%STAFF_COLORS.length];const employee={id:id(),name,color,role:'',active:true,email:'',notify:false};db.employees.push(employee);db.templates[employee.id]=defaultWorkTemplates();return;}
 if(a==='archive'){requireAdmin();const e=db.employees.find(e=>e.id===p.id);if(!e)throw Error('Salarié introuvable.');e.active=!!p.active;return;}
 if(a==='profile'){const e=db.employees.find(e=>e.id===actor);const email=String(p.email||'').trim();if((email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||(p.notify&&!email))throw Error('Vérifiez votre adresse e-mail.');e.email=email;e.notify=!!p.notify;return;}
 if(a==='settings'){requireAdmin();if(!Array.isArray(p.blocks)||p.blocks.length>50)throw Error('Périodes incorrectes.');db.blocks=p.blocks.map(b=>{if(!validDate(b.start)||!validDate(b.end)||b.end<b.start||!String(b.label||'').trim())throw Error('Vérifiez les dates et le nom de chaque période.');return {...b,id:id(),label:String(b.label).slice(0,120)};});db.settings.firstWeek=p.firstWeek?'true':'false';db.settings.blocksConfigured='true';return;}
 if(a==='request'){const emp=admin?String(p.target):actor;if(!db.employees.some(e=>e.id===emp&&e.active!==false))throw Error('Sélectionnez un salarié actif.');checkDates(db,p.start,p.end);const r={id:id(),employeeId:emp,type:p.leaveType||'leave',status:'pending',createdAt:new Date().toISOString(),details:{note:String(p.note||'').slice(0,1500),override:admin&&p.override===true?1:0}};absence(r,p.start,p.end,r.type,getOpenSundays(db));checkCapacity(db,r);db.requests.push(r);return;}
 if(a==='sendMail'){requireAdmin();return;}
 if(a==='hoursSetBalance'){
  requireAdmin();const employee=String(p.target||'');if(!db.employees.some(e=>e.id===employee))throw Error('Salarié introuvable.');
  const current=balance(db,employee),minutes=Number(p.minutes);
  if(!Number.isInteger(minutes)||minutes<0||minutes>60000)throw Error('Indiquez un solde positif ou nul, en heures et minutes.');
  if(p.originalBalance!==current)throw Error('Le solde a changé depuis son affichage. Rechargez cette ligne avant de l’enregistrer.');
  const delta=minutes-current;if(delta)db.recoveryLedger.push({id:id(),employeeId:employee,deltaMin:delta,reason:'Correction du solde de récupération',at:new Date().toISOString()});return;
 }
 if(['hoursAdd','hoursEdit','hoursDelete'].includes(a)){
  requireAdmin();const employee=String(p.target||'');if(!db.employees.some(e=>e.id===employee))throw Error('Salarié introuvable.');
  const l=db.recoveryLedger.find(l=>String(l.id)===String(p.id));
  if(a!=='hoursAdd'&&(!l||l.employeeId!==employee||l.requestId||l.deltaMin<=0||/recréditée|Correction du solde/.test(l.reason)))throw Error('Seules les heures supplémentaires saisies manuellement peuvent être corrigées.');
  if(l&&p.originalMinutes!==l.deltaMin)throw Error('Cette saisie a changé. Actualisez la page.');
  const value=a==='hoursDelete'?0:Math.round(Number(p.minutes));if(a!=='hoursDelete'&&(!Number.isFinite(value)||value<=0||value>60000))throw Error('Indiquez une durée positive, en heures et minutes.');
  if(balance(db,employee)-(l?.deltaMin||0)+value<0)throw Error('Ces heures ont déjà été utilisées. La correction rendrait le solde négatif.');
  if(a==='hoursDelete')db.recoveryLedger=db.recoveryLedger.filter(x=>x!==l);
  else if(l){l.deltaMin=value;l.reason=String(p.reason||'Heures supplémentaires').slice(0,500);}
  else db.recoveryLedger.push({id:id(),employeeId:employee,deltaMin:value,reason:String(p.reason||'Heures supplémentaires').slice(0,500),at:new Date().toISOString()});return;
 }
 const r=db.requests.find(r=>String(r.id)===String(p.id));if(!r)throw Error('Demande introuvable ou déjà supprimée.');r.details??={};
 if(!admin&&r.employeeId!==actor)throw Error('Cette demande appartient à un autre salarié.');
 if(['deleteRequest','deleteApproved','editApproved'].includes(a)){requireAdmin();stale(r,p);if(a==='editApproved'&&r.status!=='approved')throw Error('Ce congé n’est plus validé.');if(a==='editApproved'){checkDates(db,p.start,p.end,true);refund(db,r);absence(r,p.start,p.end,p.leaveType,getOpenSundays(db));r.details={...r.details,override:p.override?1:0,answer:String(p.answer||'').slice(0,1500),cancel_requested:0};checkCapacity(db,r);deduct(db,r);}else{refund(db,r);db.requests=db.requests.filter(q=>q.id!==r.id);}queued(db,r,a==='editApproved'?'Aline a modifié votre absence validée. Consultez Congéo pour voir les nouvelles dates.':'Aline a supprimé votre demande d’absence. Les récupérations déjà décomptées sont recréditées.');return;}
 if(a==='approve'){requireAdmin();if(r.status==='approved')return;if(r.status!=='pending')throw Error('Cette demande a déjà été traitée.');const x=toV1(r,getOpenSundays(db));checkDates(db,x.start,x.end);r.details.override=p.override?1:0;checkCapacity(db,r);deduct(db,r);r.status='approved';r.details.answer=String(p.answer||'').slice(0,1500);}
 else if(a==='refuse'){requireAdmin();if(!['pending','proposed'].includes(r.status))throw Error('Cette demande a déjà été traitée.');r.status='rejected';r.details.answer=String(p.answer||'').slice(0,1500);}
 else if(a==='propose'){requireAdmin();if(!['pending','proposed'].includes(r.status))throw Error('Cette demande a déjà été traitée.');checkDates(db,p.start,p.end);const q=structuredClone(r);absence(q,p.start,p.end,undefined,getOpenSundays(db));q.details.override=0;checkCapacity(db,q);r.status='proposed';r.details.proposed_start=p.start;r.details.proposed_end=p.end;r.details.answer=String(p.answer||'').slice(0,1500);}
 else if(a==='acceptProposal'){if(admin||r.status!=='proposed')throw Error('Le salarié doit accepter une proposition en cours.');checkDates(db,r.details.proposed_start,r.details.proposed_end);absence(r,r.details.proposed_start,r.details.proposed_end,undefined,getOpenSundays(db));r.details.override=0;checkCapacity(db,r);deduct(db,r);r.status='approved';r.details.proposed_start=null;r.details.proposed_end=null;}
 else if(a==='declineProposal'){if(r.status!=='proposed')throw Error('Cette proposition n’est plus disponible.');r.status='pending';r.details.proposed_start=null;r.details.proposed_end=null;}
 else if(a==='cancel'){if(r.status==='approved')r.details.cancel_requested=1;else if(['pending','proposed'].includes(r.status))r.status='cancelled';else throw Error('Cette demande ne peut plus être annulée.');}
 else if(a==='confirmCancel'){requireAdmin();if(!r.details.cancel_requested)throw Error('Aucune annulation demandée.');refund(db,r);r.status='cancelled';r.details.cancel_requested=0;}
 else throw Error('Action inconnue.');
 queued(db,r,`Aline a mis à jour votre demande d’absence. Consultez Congéo pour voir la décision ou les nouvelles dates.`);
}
export async function restoredApi(store,method,url,body){
 let legacy=null;
 if(url.pathname==='/api/requests'&&method==='POST'){
  const ds=body.type==='recovery'?[...new Set(body.dates||[])].sort():null;
  legacy={action:'request',employee:body.employeeId,leaveType:body.type,start:body.dateStart||ds?.[0],end:body.dateEnd||ds?.at(-1)};
 }
 const route=url.pathname.match(/^\/api\/requests\/([\w-]+)\/(validate|reject)$/);
 if(route&&method==='POST')legacy={admin:true,action:route[2]==='validate'?'approve':'refuse',id:route[1],override:body.override===true};
 if(url.pathname!=='/api/planning'&&!legacy)return null;
 try{
  if(legacy){let result;let idempotent=false;await store.transact(db=>{idempotent=legacy.action==='approve'&&db.requests.some(r=>String(r.id)===String(legacy.id)&&r.status==='approved');changePlanning(db,legacy);result=db.requests.find(r=>String(r.id)===String(legacy.id))||db.requests.at(-1);});return {code:legacy.action==='request'?201:200,obj:{request:result,idempotent}};}
  if(method==='GET'){const db=await store.getDoc();return {code:200,obj:planningData(db,url.searchParams.get('admin')==='1',url.searchParams.get('employee')||'')};}
  if(method==='POST'){
   if(body.action==='sendMail'&&(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM))throw Error('L’envoi des e-mails n’est pas encore configuré.');
   await store.transact(db=>changePlanning(db,body));
   let sent=0;
   if(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM){
    const db=await store.getDoc();
    for(const o of (db.outbox||[]).filter(o=>o.status==='queued').slice(0,20)){
     const e=db.employees.find(e=>e.id===o.employee_id);if(!e?.notify||!e.email)continue;
     let claimed=false;await store.transact(s=>{const row=s.outbox.find(x=>x.id===o.id);if(row?.status==='queued'){row.status='sending';claimed=true;}});if(!claimed)continue;
     try{const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':o.id},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[e.email],subject:o.subject,text:o.body})});if(!res.ok)throw Error('mail');await store.transact(s=>{s.outbox.find(x=>x.id===o.id).status='sent';});sent++;}
     catch{await store.transact(s=>{s.outbox.find(x=>x.id===o.id).status='queued';});}
    }
   }
   return {code:200,obj:{ok:true,sent}};
  }
  return {code:405,obj:{error:'Méthode non autorisée.'}};
 }catch(e){return {code:legacy&&legacy.action!=='request'?409:400,obj:{error:e.message||'Impossible d’enregistrer.'}};}
}
