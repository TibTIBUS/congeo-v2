import {describe,it,expect} from 'vitest';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {applyDutyAssignments,dutyState} from '../src/domain/duties.js';
import {defaultWorkTemplates} from '../src/domain/defaults.js';
import {getDayPlan,effectiveWeekPlan} from '../src/domain/planning.js';
import {parseISO} from '../src/domain/dates.js';
import {openDb} from '../server/db.js';
import {handleApi} from '../server/index.js';
import {createPgMemStore} from '../server/db-pg.js';

function fixture(){return {seedVersion:3,employees:[{id:'a',name:'A',active:true},{id:'b',name:'B',active:true}],templates:{a:defaultWorkTemplates(),b:defaultWorkTemplates()},overrides:{},requests:[],recoveryLedger:[],blocks:[],settings:{}};}
const edit=(db,id='a',weekday=0,extra={})=>({employeeId:id,weekday,original:dutyState(db.templates[id].paire[weekday]),open:true,close:false,...extra});
const payload=changes=>({admin:true,parity:'paire',changes});
const route=(store,path,body)=>handleApi(store,'PUT',new URL(path,'http://test'),body);

describe('recurring opening and closing assignments',()=>{
 it('repeats only on the selected parity without changing hours, absences or daily exceptions',()=>{
  const db=fixture();db.overrides['a|2026-11-09']={...db.templates.a.paire[0],open:false,close:true};
  const before=structuredClone(db);applyDutyAssignments(db,payload([edit(db,'a',0,{close:true}),edit(db,'b',1)]));
  expect(getDayPlan(db.templates,db.overrides,'a',parseISO('2026-10-26'))).toMatchObject({open:true,close:true,start:'09:30',pauseStart:'12:00'});
  expect(getDayPlan(db.templates,db.overrides,'a',parseISO('2026-11-23')).open).toBe(true);
  expect(getDayPlan(db.templates,db.overrides,'a',parseISO('2026-11-02')).open).toBe(false);
  expect(getDayPlan(db.templates,db.overrides,'a',parseISO('2026-11-09'))).toEqual(before.overrides['a|2026-11-09']);
  expect(db.overrides).toEqual(before.overrides);expect(db.requests).toEqual(before.requests);expect(db.recoveryLedger).toEqual(before.recoveryLedger);
  expect(db.templates.a.impaire).toEqual(before.templates.a.impaire);
 });
 it('validates every row before applying a batch, including stale changes',()=>{
  const db=fixture(),first=edit(db,'a'),stale=edit(db,'b');db.templates.b.paire[0].close=true;
  expect(()=>applyDutyAssignments(db,payload([first,stale]))).toThrow('changé');expect(db.templates.a.paire[0].open).toBe(false);
  expect(()=>applyDutyAssignments(db,payload([first,first]))).toThrow('une fois');expect(db.templates.a.paire[0].open).toBe(false);
 });
 it('rejects non-admin, Sunday, rest days, archived staff and malformed values',()=>{
  const db=fixture(),change=edit(db);
  expect(()=>applyDutyAssignments(db,{...payload([change]),admin:false})).toThrow('gérante');
  for(const invalid of [{...change,weekday:6},{...change,weekday:-1},{...change,open:'true'},{...change,original:{}},{...change,employeeId:'missing'}])expect(()=>applyDutyAssignments(db,payload([invalid]))).toThrow();
  db.templates.a.paire[0].worked=false;expect(()=>applyDutyAssignments(db,payload([edit(db)]))).toThrow('repos');
  db.employees[1].active=false;expect(()=>applyDutyAssignments(db,payload([edit(db,'b')]))).toThrow('actif');
  expect(()=>applyDutyAssignments(db,{...payload([]),parity:'all'})).toThrow('invalide');
 });
 it('preserves the latest hours when only roles are edited and allows incomplete coverage',()=>{
  const db=fixture(),change=edit(db);db.templates.a.paire[0].end='18:00';applyDutyAssignments(db,payload([change]));
  expect(db.templates.a.paire[0].end).toBe('18:00');
  applyDutyAssignments(db,payload([edit(db,'a',0,{open:false})]));expect(db.templates.a.paire[0].open).toBe(false);
  db.templates.a.paire[0].open=true;db.requests.push({employeeId:'a',type:'leave',status:'approved',dateStart:'2026-10-26',dateEnd:'2026-10-26'});
  expect(effectiveWeekPlan(db,'a',2026,44)[0].open).toBe(false);expect(db.templates.a.paire[0].open).toBe(true);
 });
 it('saves the batch through the API and prevents an older template editor from overwriting it',async()=>{
  const db=fixture(),path=join(mkdtempSync(join(tmpdir(),'congeo-duties-')),'db.json');writeFileSync(path,JSON.stringify(db));const store=openDb(path),original=structuredClone(db.templates.a);
  const saved=await route(store,'/api/duties',payload([edit(db,'a',0,{close:true}),edit(db,'b',2)]));expect(saved).toMatchObject({code:200,obj:{updated:2}});
  const changed={...original,paire:original.paire.map((day,i)=>i===0?{...day,end:'18:00'}:day)};
  expect((await route(store,'/api/templates/a',{...changed,original})).code).toBe(409);
  const reloaded=await openDb(path).getDoc();expect(reloaded.templates.a.paire[0]).toMatchObject({open:true,close:true,end:'19:00'});expect(reloaded.templates.b.paire[2].open).toBe(true);
  expect((await route(store,'/api/duties',payload([edit(db)]))).code).toBe(400);
  const latest=structuredClone(reloaded.templates.a);const corrected={...latest,paire:latest.paire.map((d,i)=>i===0?{...d,end:'18:00'}:d)};
  expect((await route(store,'/api/templates/a',{...corrected,original:latest})).code).toBe(200);
  expect((await store.getDoc()).templates.a.paire[0]).toMatchObject({open:true,close:true,end:'18:00'});
 });
 it('persists opening and closing flags through the Postgres transaction store',async()=>{
  const store=await createPgMemStore(),db=await store.getDoc(),employee=db.employees.find(e=>e.id==='hugo');
  const change={employeeId:employee.id,weekday:0,original:dutyState(db.templates[employee.id].paire[0]),open:true,close:true};
  expect((await route(store,'/api/duties',payload([change]))).code).toBe(200);
  expect((await store.getDoc()).templates[employee.id].paire[0]).toMatchObject({open:true,close:true,start:db.templates[employee.id].paire[0].start});
 });
});
