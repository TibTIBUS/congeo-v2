import {describe,it,expect} from 'vitest';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openDb} from '../server/db.js';
import {createPgMemStore} from '../server/db-pg.js';
import {handleApi} from '../server/index.js';
import {changePlanning,planningData} from '../server/restored.js';
import {defaultWorkTemplates} from '../src/domain/defaults.js';
import {getOpenSundays,sundaySnapshot} from '../src/domain/sundays.js';
import {getWeekPlan,effectiveWeekPlan,weekCoverage} from '../src/domain/planning.js';
import {employeeCalendarDay,requestCoversDay} from '../src/domain/employeeCalendar.js';
import {workdays,weekPeriod,blockedReason} from '../src/domain/calendarRules.js';

const DATE='2027-03-14';
const work=()=>({...defaultWorkTemplates().paire[0],open:true,close:true});
function fixture(){return {seedVersion:3,employees:[{id:'a',name:'A',active:true},{id:'b',name:'B',active:true}],templates:{a:defaultWorkTemplates(),b:defaultWorkTemplates()},overrides:{},requests:[],recoveryLedger:[],blocks:[],settings:{firstWeek:'false',blocksConfigured:'true'}};}
function storeFor(db){const path=join(mkdtempSync(join(tmpdir(),'congeo-sundays-')),'db.json');writeFileSync(path,JSON.stringify(db));return openDb(path);}
const call=(store,path,method='GET',body={})=>handleApi(store,method,new URL(path,'http://test'),body);
const payload=(db,date=DATE)=>({admin:true,date,open:true,original:sundaySnapshot(db,date),rows:db.employees.filter(e=>e.active!==false).map((e,i)=>({employeeId:e.id,day:i===0?work():{worked:false}}))});
const open=async store=>{const p=payload(await store.getDoc());expect((await call(store,'/api/sundays','PUT',p)).code).toBe(200);return store.getDoc();};

describe('exceptional Sunday opening dates',()=>{
 it('opens only the chosen date and shows employee hours and seven-day coverage',async()=>{
  const store=storeFor(fixture()),db=await open(store);
  expect(getOpenSundays(db)).toEqual([DATE]);expect(db.templates.a.paire[6].worked).toBe(false);expect(db.templates.a.impaire[6].worked).toBe(false);
  expect(getWeekPlan(db.templates,db.overrides,'a',2027,10)[6]).toMatchObject({worked:true,open:true,close:true});
  expect(getWeekPlan(db.templates,db.overrides,'a',2027,11)[6].worked).toBe(false);
  const coverage=weekCoverage({a:effectiveWeekPlan(db,'a',2027,10)},[0,1,2,3,4,5,6]);expect(coverage.days).toBe(7);expect(coverage.warnings.some(w=>w.dayIdx===6)).toBe(true);
  const bootstrap=(await call(store,'/api/bootstrap?employee=a')).obj;
  expect(employeeCalendarDay(bootstrap,'a',DATE).kind).toBe('work');expect(employeeCalendarDay(bootstrap,'a','2027-03-21').kind).toBe('rest');
  expect((await call(store,'/api/bootstrap?employee=b')).obj.overrides).not.toHaveProperty('a|'+DATE);
 });
 it('rejects non-Sundays, non-admin requests, partial rosters, invalid hours and stale writes without partial changes',async()=>{
  const store=storeFor(fixture()),db=structuredClone(await store.getDoc()),p=payload(db);
  for(const invalid of [{...p,admin:false},{...p,date:'2027-03-15'},{...p,rows:p.rows.slice(0,1)},{...p,original:{}},{...p,rows:[p.rows[0],{employeeId:'b',day:{worked:true,start:'19:00',end:'09:30'}}]}])expect((await call(store,'/api/sundays','PUT',invalid)).code).toBe(400);
  expect(await store.getDoc()).toEqual(db);
  await open(store);expect((await call(store,'/api/sundays','PUT',p)).code).toBe(400);
 });
 it('allows daily Sunday adjustments only on an enabled date and closes without changing other days',async()=>{
  const store=storeFor(fixture());expect((await call(store,'/api/overrides/a/'+DATE,'PUT',work())).code).toBe(400);
  let db=await open(store);
  expect((await call(store,'/api/overrides/b/'+DATE,'PUT',{...work(),end:'18:00'})).code).toBe(200);
  expect((await call(store,'/api/overrides/a/2027-03-21','PUT',work())).code).toBe(400);
  expect((await call(store,'/api/overrides/a/2027-03-15','PUT',work())).code).toBe(200);
  db=await store.getDoc();expect((await call(store,'/api/sundays','PUT',{admin:true,date:DATE,open:false,original:sundaySnapshot(db,DATE)})).code).toBe(200);
  db=await store.getDoc();expect(getOpenSundays(db)).toEqual([]);expect(Object.keys(db.overrides)).toEqual(['a|2027-03-15']);expect(db.overrides['a|2027-03-15'].worked).toBe(true);
 });
 it('includes open Sundays in week requests while keeping closed Sundays and blocked periods excluded',async()=>{
  const store=storeFor(fixture()),db=await open(store);
  expect(workdays('2027-03-13','2027-03-15',[DATE])).toEqual(['2027-03-13',DATE,'2027-03-15']);
  expect(weekPeriod('2027-03-11',[DATE]).end).toBe(DATE);expect(weekPeriod('2027-03-11').end).toBe('2027-03-13');
  expect(blockedReason(DATE,[],false,[DATE])).toBe('');expect(blockedReason('2027-03-21',[],false,[DATE])).toContain('fermé');
  const request={action:'request',employee:'a',start:DATE,end:DATE,leaveType:'leave'};changePlanning(db,request);changePlanning(db,{action:'approve',admin:true,id:db.requests[0].id});
  const view=planningData(db,false,'a');expect(JSON.parse(view.requests[0].days)).toEqual([DATE]);expect(requestCoversDay(view.requests[0],DATE,view.openSundays)).toBe(true);
  expect(()=>changePlanning(db,{...request,employee:'b'})).toThrow('dérogation');
  expect(effectiveWeekPlan(db,'a',2027,10)[6].worked).toBe(false);
  db.blocks=[{label:'Noël',start:'2027-03-14',end:'2027-03-14'}];expect(()=>changePlanning(db,{...request,employee:'b'})).toThrow('Noël');
 });
 it('keeps recovery deductions consistent and prevents closing a Sunday with approved recovery',async()=>{
  const store=storeFor(fixture());await open(store);
  await store.transact(db=>{db.recoveryLedger.push({id:'credit',employeeId:'a',deltaMin:600,reason:'test'});changePlanning(db,{action:'request',employee:'a',start:DATE,end:DATE,leaveType:'recovery'});changePlanning(db,{action:'approve',admin:true,id:db.requests[0].id});});
  let db=await store.getDoc();expect(db.requests[0].deductedMin).toBe(450);
  const before=structuredClone(db),p=payload(db);p.rows[0].day.end='18:00';expect((await call(store,'/api/sundays','PUT',p)).code).toBe(400);
  expect((await call(store,'/api/sundays','PUT',{admin:true,date:DATE,open:false,original:sundaySnapshot(db,DATE)})).code).toBe(400);expect(await store.getDoc()).toEqual(before);
  await store.transact(db=>{changePlanning(db,{action:'cancel',employee:'a',id:db.requests[0].id});changePlanning(db,{action:'confirmCancel',admin:true,id:db.requests[0].id});});
  db=await store.getDoc();expect(db.recoveryLedger.reduce((sum,l)=>sum+l.deltaMin,0)).toBe(600);
  expect((await call(store,'/api/sundays','PUT',{admin:true,date:DATE,open:false,original:sundaySnapshot(db,DATE)})).code).toBe(200);
 });
 it('preserves readable leave history when an opened Sunday is subsequently closed',async()=>{
  const store=storeFor(fixture());await open(store);
  await store.transact(db=>{changePlanning(db,{action:'request',employee:'a',start:DATE,end:DATE,leaveType:'leave'});changePlanning(db,{action:'approve',admin:true,id:db.requests[0].id});});
  const db=await store.getDoc();expect((await call(store,'/api/sundays','PUT',{admin:true,date:DATE,open:false,original:sundaySnapshot(db,DATE)})).code).toBe(200);
  expect((await call(store,'/api/planning?admin=1')).obj.requests[0]).toMatchObject({start:DATE,end:DATE,status:'approved',days:'[]'});
 });
 it('persists the date and employee plans in Postgres and removes only that date on closure',async()=>{
  const store=await createPgMemStore(),before=await store.getDoc(),p=payload(before);
  expect((await call(store,'/api/sundays','PUT',p)).code).toBe(200);
  let db=await store.getDoc();expect(getOpenSundays(db)).toEqual([DATE]);expect(db.templates).toEqual(before.templates);expect(db.overrides[p.rows[0].employeeId+'|'+DATE].worked).toBe(true);
  expect((await call(store,'/api/sundays','PUT',{admin:true,date:DATE,open:false,original:sundaySnapshot(db,DATE)})).code).toBe(200);
  db=await store.getDoc();expect(getOpenSundays(db)).toEqual([]);expect(db.overrides).toEqual(before.overrides);
 });
});
