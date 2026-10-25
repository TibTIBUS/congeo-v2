import {describe,it,expect} from 'vitest';
import {createPgMemStore} from '../server/db-pg.js';
import {handleApi} from '../server/index.js';
import {monthlyOvertime,saveMonthlyOvertime} from '../server/monthly-overtime.js';
import {overtimeEntry,overtimeDraft,overtimeChanges} from '../src/domain/monthlyOvertime.js';
import {createMonthlyOvertimePdf} from '../src/lib/monthlyOvertimePdf.js';
const fixture=()=>({seedVersion:3,employees:[{id:'a',name:'Élodie',active:true},{id:'b',name:'Aline',active:true}],templates:{},overrides:{},requests:[],recoveryLedger:[{id:'credit',employeeId:'a',deltaMin:600}],blocks:[],settings:{}});
const change=(employeeId,minutes,note='',original=null)=>({employeeId,original,entry:{minutes,note}});
const save=(db,changes,month='2026-10')=>saveMonthlyOvertime(db,{admin:true,month,changes});
const call=(store,path,method='GET',body={})=>handleApi(store,method,new URL(path,'http://test'),body);
describe('monthly payroll overtime',()=>{
 it('keeps months independent from recovery balances and distinguishes blank from zero',()=>{
  const db=fixture();expect(monthlyOvertime(db,'2026-10').rows.every(r=>r.entry===null)).toBe(true);
  save(db,[change('a',90,'Inventaire'),change('b',0)]);
  expect(monthlyOvertime(db,'2026-10').rows.map(r=>r.entry.minutes)).toEqual([0,90]);
  expect(monthlyOvertime(db,'2026-11').rows.every(r=>r.entry===null)).toBe(true);
  expect(db.recoveryLedger).toEqual(fixture().recoveryLedger);
 });
 it('preserves archived employees and recorded names in historical reports',()=>{
  const db=fixture();save(db,[change('a',120)]);db.employees[0].active=false;db.employees[0].name='Autre nom';
  expect(monthlyOvertime(db,'2026-10').rows.find(r=>r.employeeId==='a')).toMatchObject({name:'Élodie',active:false,entry:{minutes:120}});
  expect(monthlyOvertime(db,'2026-11').rows).toHaveLength(1);
 });
 it('rejects stale rows atomically, allows independent edits, and supports clearing a value',()=>{
  const db=fixture();save(db,[change('a',60)]);save(db,[change('b',120)]);
  const before=structuredClone(db);expect(()=>save(db,[change('b',30,'',monthlyOvertime(db,'2026-10').rows[0].entry),change('a',90)])).toThrow('ont changé');expect(db).toEqual(before);
  const original=monthlyOvertime(db,'2026-10').rows.find(r=>r.employeeId==='a').entry;
  save(db,[{employeeId:'a',original,entry:null}]);expect(monthlyOvertime(db,'2026-10').rows.find(r=>r.employeeId==='a').entry).toBeNull();
 });
 it('validates manager access, months, duplicate employees and all values before any write',()=>{
  const db=fixture();expect(()=>saveMonthlyOvertime(db,{admin:false})).toThrow('gérante');
  for(const month of ['2026-13','2026-00','bad','2026-1',null])expect(()=>save(db,[],month)).toThrow('mois');
  for(const minutes of [-1,0.5,60001,'90',null])expect(()=>save(db,[change('a',60),change('b',minutes)])).toThrow('durée');
  expect(()=>save(db,[change('a',60),change('a',60)])).toThrow('plusieurs');
  expect(()=>save(db,[change('unknown',60)])).toThrow('Salarié');expect(()=>save(db,[change('a',60,'x'.repeat(501))])).toThrow('500');
  expect(db.settings).toEqual({});
 });
 it('persists the monthly declaration through Postgres and restricts its endpoint',async()=>{
  const store=await createPgMemStore();const db=await store.getDoc(),employeeId=db.employees[0].id;
  expect((await call(store,'/api/monthly-overtime?month=2026-10')).code).toBe(403);
  expect((await call(store,'/api/monthly-overtime','PUT',{month:'2026-10',changes:[]})).code).toBe(403);
  const response=await call(store,'/api/monthly-overtime','PUT',{admin:true,month:'2026-10',changes:[change(employeeId,135,'Remplacement')]});
  expect(response.code).toBe(200);
  expect((await call(store,'/api/monthly-overtime?admin=1&month=2026-10')).obj.rows.find(r=>r.employeeId===employeeId).entry.minutes).toBe(135);
  const own=(await call(store,'/api/bootstrap?employee='+employeeId)).obj;expect(JSON.stringify(own)).not.toContain('Remplacement');
  expect((await store.getDoc()).recoveryLedger).toEqual(db.recoveryLedger);
 });
 it('handles hours and minutes without silently treating missing declarations as zero',()=>{
  expect(overtimeEntry(overtimeDraft(null))).toBeNull();expect(overtimeEntry({hours:'0',minutes:'',note:''})).toEqual({minutes:0,note:''});
  expect(overtimeEntry({hours:'2',minutes:'30',note:' inventaire '})).toEqual({minutes:150,note:'inventaire'});
  for(const d of [{hours:'2.5',minutes:'0',note:''},{hours:'0',minutes:'60',note:''},{hours:'',minutes:'',note:'Note'}])expect(()=>overtimeEntry(d)).toThrow();
  const entry={minutes:90,note:'Note',name:'A'};expect(overtimeChanges([{employeeId:'a',entry}],{a:overtimeDraft(entry)})).toEqual([]);
 });
 it('creates a real PDF with automatic pagination for long observations and many employees',()=>{
  const rows=Array.from({length:45},(_,i)=>({employeeId:String(i),name:'Élodie '+i,active:true,entry:i%3?{minutes:90,note:'Inventaire et remplacement. '.repeat(18)}:null}));
  const pdf=createMonthlyOvertimePdf({month:'2026-10',rows},new Date('2026-10-25T12:00:00Z'));
  expect(pdf.getNumberOfPages()).toBeGreaterThan(2);expect(pdf.output().startsWith('%PDF-')).toBe(true);
 });
});
