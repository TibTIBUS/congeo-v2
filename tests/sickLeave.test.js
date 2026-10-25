import {describe,it,expect} from 'vitest';
import {createPgMemStore} from '../server/db-pg.js';
import {handleApi} from '../server/index.js';
import {changeSickLeave} from '../server/sick-leave.js';
import {changePlanning,planningData} from '../server/restored.js';
import {sickDays,sickCounters,activeSickLeaves,sickCalendarRows,approvedAbsences} from '../src/domain/sickLeave.js';
import {employeeCalendarDay,requestCoversDay} from '../src/domain/employeeCalendar.js';
import {defaultWorkTemplates} from '../src/domain/defaults.js';
import {effectiveWeekPlan,weekCoverage} from '../src/domain/planning.js';
import {requestDates} from '../src/domain/requests.js';
const fixture=()=>({employees:[{id:'a',name:'Aline',active:true},{id:'b',name:'Élodie',active:true}],templates:{a:defaultWorkTemplates(),b:defaultWorkTemplates()},requests:[],overrides:{},settings:{firstWeek:'false',blocksConfigured:'true'},blocks:[],recoveryLedger:[{employeeId:'a',deltaMin:600}],outbox:[]});
const add=(db,other={})=>changeSickLeave(db,{admin:true,action:'save',employeeId:'a',dateStart:'2026-12-30',dateEnd:'2027-01-04',...other}).record;
const call=(s,path,method='GET',body={})=>handleApi(s,method,new URL(path,'http://test'),body);
describe('manager sick leave',()=>{
 it('counts calendar days across weekends, year boundaries and daylight-saving changes',()=>{
  const db=fixture();add(db);expect(sickDays('2026-10-24','2026-10-26')).toHaveLength(3);
  expect(sickCounters(db,'a',2026)).toEqual({annual:2,total:6});expect(sickCounters(db,'a',2027)).toEqual({annual:4,total:6});expect(sickCounters(db,'b',2026)).toEqual({annual:0,total:0});
 });
 it('accepts past dates and blocked periods immediately, without changing recovery or requests',()=>{
  const db=fixture();db.settings.firstWeek='true';db.blocks=[{id:'blocked',label:'Fermé',start:'2020-01-01',end:'2020-01-03'}];const before=structuredClone(db);const r=add(db,{dateStart:'2020-01-01',dateEnd:'2020-01-03'});
  expect(r.status).toBe('active');expect(db.requests).toEqual(before.requests);expect(db.recoveryLedger).toEqual(before.recoveryLedger);expect(db.templates).toEqual(before.templates);
 });
 it('rejects invalid dates, employee access, overlapping duplicates and stale modifications',()=>{
  const db=fixture();expect(()=>add(db,{admin:false})).toThrow('gérante');for(const date of ['2026-02-30','bad'])expect(()=>add(db,{dateStart:date})).toThrow('dates');
  expect(()=>add(db,{employeeId:'unknown'})).toThrow('actif');const r=add(db);expect(()=>add(db)).toThrow('déjà enregistré');
  const updated=add(db,{id:r.id,originalRevision:r.revision,dateEnd:'2027-01-05'});expect(updated.id).toBe(r.id);
  const before=structuredClone(db);expect(()=>changeSickLeave(db,{admin:true,action:'cancel',id:r.id,originalRevision:r.revision})).toThrow('a changé');expect(db).toEqual(before);
 });
 it('cancels and restores reversibly with immediate counter updates',()=>{
  const db=fixture(),r=add(db);const c=changeSickLeave(db,{admin:true,action:'cancel',id:r.id,originalRevision:r.revision}).record;
  expect(activeSickLeaves(db)).toHaveLength(0);expect(sickCounters(db,'a',2026).total).toBe(0);expect(JSON.parse(db.settings.sickLeaves)).toHaveLength(1);
  changeSickLeave(db,{admin:true,action:'restore',id:r.id,originalRevision:c.revision});expect(sickCounters(db,'a',2026).total).toBe(6);
 });
 it('shows the absence in admin and employee calendars, including closed Sundays, and overrides personal hours',()=>{
  const db=fixture();add(db,{dateStart:'2026-10-24',dateEnd:'2026-10-26'});
  const rows=planningData(db,false,'a').requests;expect(rows[0].leave_type).toBe('sick');expect(requestCoversDay(rows[0],'2026-10-25')).toBe(true);
  expect(employeeCalendarDay({...db,employeeId:'a'},'a','2026-10-25',rows)).toEqual({kind:'sick',label:'Arrêt de travail'});
  expect(planningData(db,true,'').requests).toEqual(rows);expect(requestDates(approvedAbsences(db)[0])).toEqual(['2026-10-24','2026-10-25','2026-10-26']);
 });
 it('removes sick employees from opening and closing coverage, even after the first year of a long absence',()=>{
  const db=fixture();for(const d of db.templates.a.paire){d.worked=true;d.open=true;d.close=true;}
  add(db,{dateStart:'2025-01-01',dateEnd:'2027-12-31'});
  const week=effectiveWeekPlan(db,'a',2026,44);expect(week.every(d=>!d.worked&&!d.open&&!d.close)).toBe(true);expect(weekCoverage({a:week}).openingsCovered).toBe(0);
 });
 it('prevents overlapping approved leave or recovery without consuming balances or applying leave quotas to sick employees',()=>{
  const db=fixture();db.requests.push({id:'approved',employeeId:'a',type:'recovery',dates:['2026-12-30'],status:'approved'});expect(()=>add(db)).toThrow('déjà validé');db.requests=[];
  add(db,{dateStart:'2027-03-08',dateEnd:'2027-03-10'});
  expect(()=>changePlanning(db,{admin:true,action:'request',target:'a',leaveType:'leave',start:'2027-03-08',end:'2027-03-08'})).toThrow('arrêt de travail');
  changePlanning(db,{admin:true,action:'request',target:'b',leaveType:'leave',start:'2027-03-08',end:'2027-03-08'});expect(db.requests).toHaveLength(1);
 });
 it('persists in Postgres, restricts management to the manager and filters individual bootstrap data',async()=>{
  const store=await createPgMemStore(),before=await store.getDoc(),[a,b]=before.employees;
  expect((await call(store,'/api/sick-leaves')).code).toBe(403);expect((await call(store,'/api/sick-leaves','POST',{action:'save'})).code).toBe(403);
  const response=await call(store,'/api/sick-leaves','POST',{admin:true,action:'save',employeeId:a.id,dateStart:'2030-11-03',dateEnd:'2030-11-05'});expect(response.code).toBe(200);
  expect((await call(store,'/api/sick-leaves?admin=1')).obj.sickLeaves).toHaveLength(1);
  expect((await call(store,'/api/bootstrap?employee='+a.id)).obj.sickLeaves).toHaveLength(1);expect((await call(store,'/api/bootstrap?employee='+b.id)).obj.sickLeaves).toHaveLength(0);
  expect((await store.getDoc()).recoveryLedger).toEqual(before.recoveryLedger);
  const r=response.obj.record;expect((await call(store,'/api/sick-leaves','POST',{admin:true,action:'cancel',id:r.id,originalRevision:r.revision})).code).toBe(200);
  expect((await call(store,'/api/planning?admin=1')).obj.requests.some(r=>r.leave_type==='sick')).toBe(false);
 });
 it('blocks approval of a pending recovery when a sick leave was entered meanwhile',async()=>{
  const store=await createPgMemStore();let pending;
  await store.transact(db=>{const employeeId=db.employees[0].id;db.requests.push({id:'new-pending',employeeId,type:'recovery',dates:['2030-11-04'],status:'pending',createdAt:new Date().toISOString()});add(db,{employeeId,dateStart:'2030-11-03',dateEnd:'2030-11-05'});});
  pending=(await store.getDoc()).requests.find(r=>r.dates?.includes('2030-11-04'));
  const result=await store.validateRequest(pending.id);expect(result[0]).toBe(409);expect(result[1].error).toContain('arrêt de travail');
 });
});
