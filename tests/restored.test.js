import {describe,it,expect} from 'vitest';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDb} from '../server/db.js';
import {changePlanning,planningData} from '../server/restored.js';
import {effectiveWeekPlan,weekCoverage} from '../src/domain/planning.js';
const off=()=>({worked:false});const day=()=>({worked:true,start:'09:30',end:'19:00',pauseStart:'12:30',pauseEnd:'14:00',open:true,close:true});
function fixture(){const employees=['a','b','c'].map(id=>({id,name:id,active:true}));const templates=Object.fromEntries(employees.map(e=>[e.id,{paire:Array.from({length:7},(_,i)=>i<6?day():off()),impaire:Array.from({length:7},(_,i)=>i<6?day():off())}]));return {employees,templates,overrides:{},requests:[],recoveryLedger:[],blocks:[],settings:{firstWeek:'true',blocksConfigured:'true'}};}
const request=(employee,start='2027-02-15',type='leave')=>({action:'request',employee,start,end:start,leaveType:type});
describe('restored V1 leave workflows',()=>{
 it('capacity, max-two override, employee duplication, stale deletion and release',()=>{
  const d=fixture();changePlanning(d,request('a'));changePlanning(d,request('b'));changePlanning(d,request('c'));
  const [a,b,c]=d.requests;changePlanning(d,{action:'approve',admin:true,id:a.id});
  expect(()=>changePlanning(d,{action:'approve',admin:true,id:b.id})).toThrow('dérogation');
  changePlanning(d,{action:'approve',admin:true,id:b.id,override:true});
  expect(()=>changePlanning(d,{action:'approve',admin:true,id:c.id,override:true})).toThrow('Deux personnes');
  expect(()=>changePlanning(d,{action:'deleteRequest',employee:'a',id:a.id})).toThrow('gérante');
  expect(()=>changePlanning(d,{action:'deleteRequest',admin:true,id:a.id,originalStatus:'pending'})).toThrow('changé');
  changePlanning(d,{action:'deleteRequest',admin:true,id:a.id});changePlanning(d,{action:'deleteRequest',admin:true,id:b.id});changePlanning(d,{action:'approve',admin:true,id:c.id});
  expect(d.requests).toHaveLength(1);
 });
 it('recovery deductions and refund when deleting a validated absence',()=>{
  const d=fixture();d.recoveryLedger.push({id:'initial',employeeId:'a',deltaMin:600});changePlanning(d,request('a','2027-02-15','recovery'));const r=d.requests[0];changePlanning(d,{action:'approve',admin:true,id:r.id});
  expect(r.deductedMin).toBe(480);changePlanning(d,{action:'approve',admin:true,id:r.id});expect(d.recoveryLedger).toHaveLength(2);
  changePlanning(d,{action:'deleteRequest',admin:true,id:r.id});expect(d.recoveryLedger.reduce((s,l)=>s+l.deltaMin,0)).toBe(600);
 });
 it('proposals accepted by the employee, cancellation and admin corrections',()=>{
  const d=fixture();changePlanning(d,request('a'));const r=d.requests[0];changePlanning(d,{action:'propose',admin:true,id:r.id,start:'2027-02-16',end:'2027-02-16'});expect(r.status).toBe('proposed');
  changePlanning(d,{action:'acceptProposal',employee:'a',id:r.id});expect(r.status).toBe('approved');
  changePlanning(d,{action:'editApproved',admin:true,id:r.id,start:'2027-02-17',end:'2027-02-17',leaveType:'leave'});expect(r.dateStart).toBe('2027-02-17');
  changePlanning(d,{action:'cancel',employee:'a',id:r.id});changePlanning(d,{action:'confirmCancel',admin:true,id:r.id});expect(r.status).toBe('cancelled');
 });
 it('a rejected edit is rolled back without losing the original recovery balance',async()=>{
  const f=join(mkdtempSync(join(tmpdir(),'congeo-restored-')),'db.json'),d=fixture();d.recoveryLedger.push({id:'initial',employeeId:'a',deltaMin:600});changePlanning(d,request('a','2027-02-15','recovery'));changePlanning(d,{action:'approve',admin:true,id:d.requests[0].id});writeFileSync(f,JSON.stringify({...d,seedVersion:3}));const store=openDb(f);const before=await store.getDoc();
  await expect(store.transact(s=>changePlanning(s,{action:'editApproved',admin:true,id:s.requests[0].id,start:'2027-02-15',end:'2027-02-20',leaveType:'recovery'}))).rejects.toThrow('solde');
  expect(await store.getDoc()).toEqual(before);
 });
 it('coverage excludes approved leaves and recoveries',()=>{
  const d=fixture();changePlanning(d,request('a'));changePlanning(d,{action:'approve',admin:true,id:d.requests[0].id});const plans={a:effectiveWeekPlan(d,'a',2027,7),b:effectiveWeekPlan(d,'b',2027,7)};
  expect(plans.a[0].worked).toBe(false);expect(weekCoverage(plans).warnings.some(w=>w.dayIdx===0&&w.count===1)).toBe(true);
 });
 it('overtime edits cannot consume hours already recovered',()=>{
  const d=fixture();changePlanning(d,{action:'hoursAdd',admin:true,target:'a',minutes:600});const l=d.recoveryLedger[0];changePlanning(d,request('a','2027-02-15','recovery'));changePlanning(d,{action:'approve',admin:true,id:d.requests[0].id});
  expect(()=>changePlanning(d,{action:'hoursDelete',admin:true,target:'a',id:l.id,originalMinutes:600})).toThrow('déjà été utilisées');
 });
 it('team, blocks, email preferences and shared statuses are restored',()=>{
  const d=fixture();changePlanning(d,{action:'employee',admin:true,name:'Nouveau salarié'});expect(d.employees).toHaveLength(4);
  changePlanning(d,{action:'settings',admin:true,firstWeek:true,blocks:[{label:'Noël',start:'2027-12-18',end:'2028-01-02'}]});expect(()=>changePlanning(d,request('a','2027-12-20'))).toThrow('Noël');
  changePlanning(d,{action:'profile',employee:'a',email:'a@example.test',notify:true});changePlanning(d,request('a'));changePlanning(d,{action:'approve',admin:true,id:d.requests[0].id});expect(d.outbox).toHaveLength(1);expect(planningData(d,false,'b').outbox).toHaveLength(0);
 });
});
