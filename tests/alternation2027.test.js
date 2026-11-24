import {describe,it,expect} from 'vitest';
import {isoWeek,isoWeeksInYear,parityOf,parseISO,weekDates,toISODate} from '../src/domain/dates.js';
import {getDayPlan,effectiveWeekPlan} from '../src/domain/planning.js';
const day=(start)=>({worked:true,start,end:'19:00',pauseStart:null,pauseEnd:null,open:true,close:false});
const templates={e:{paire:Array.from({length:7},()=>day('09:00')),impaire:Array.from({length:7},()=>day('10:00'))}};
describe('A/B continuous from 4 January 2027 only',()=>{
 it('preserves every historical ISO week from 2020 through 2026',()=>{
  for(let year=2020;year<=2026;year++)for(let week=1;week<=isoWeeksInYear(year);week++)expect(parityOf({year,week})).toBe(week%2===0?'paire':'impaire');
 });
 it('keeps December unchanged and starts January A then B then A',()=>{
  for(const [date,want] of [['2026-12-21','paire'],['2026-12-28','impaire'],['2027-01-03','impaire'],['2027-01-04','paire'],['2027-01-11','impaire'],['2027-01-18','paire']])expect(parityOf(isoWeek(parseISO(date)))).toBe(want);
 });
 it('alternates across all future year boundaries through 2040',()=>{
  let previous=null;
  for(let year=2027;year<=2040;year++)for(let week=1;week<=isoWeeksInYear(year);week++){
   const current=parityOf({year,week});if(previous)expect(current).not.toBe(previous);previous=current;
  }
 });
 it('changes actual hours, not just the letter, and keeps daily overrides first',()=>{
  const before=structuredClone(templates),overrides={'e|2027-01-05':{worked:false,custom:true}};
  expect(getDayPlan(templates,overrides,'e',parseISO('2027-01-04')).start).toBe('09:00');
  expect(getDayPlan(templates,overrides,'e',parseISO('2027-01-11')).start).toBe('10:00');
  expect(getDayPlan(templates,overrides,'e',parseISO('2027-01-05'))).toEqual(overrides['e|2027-01-05']);
  expect(templates).toEqual(before);
 });
 it('preserves approved leave priority without mutation',()=>{
  const data={employees:[{id:'e',active:true}],templates,overrides:{},settings:{},requests:[{id:'r',employeeId:'e',type:'leave',status:'approved',dateStart:'2027-01-04',dateEnd:'2027-01-04'}],sickLeaves:[]};
  const before=structuredClone(data),plan=effectiveWeekPlan(data,'e',2027,1);
  expect(plan[0].worked).toBe(false);expect(plan[1].start).toBe('09:00');expect(data).toEqual(before);
 });
});
