import {describe,it,expect} from 'vitest';
import {employeeCalendarDay,requestCoversDay} from '../src/domain/employeeCalendar.js';
const off={worked:false};
const work={worked:true,start:'09:30',end:'19:00',pauseStart:'12:30',pauseEnd:'14:00'};
const schedule={employeeId:'a',templates:{a:{paire:[off,work,work,{...work,end:'18:00'},work,work,off],impaire:[work,work,off,work,work,{...work,end:'18:00'},off]}},overrides:{}};
describe('personal calendar hours',()=>{
 it('uses the correct even/odd week, including upcoming weeks',()=>{
  expect(employeeCalendarDay(schedule,'a','2026-10-26').kind).toBe('rest');
  expect(employeeCalendarDay(schedule,'a','2026-10-27').ranges).toEqual(['9h30–12h30','14h–19h']);
  expect(employeeCalendarDay(schedule,'a','2026-10-29').end).toBe('18h');
  expect(employeeCalendarDay(schedule,'a','2026-11-02').kind).toBe('work');
  expect(employeeCalendarDay(schedule,'a','2026-11-04').kind).toBe('rest');
  expect(employeeCalendarDay(schedule,'a','2026-11-07').end).toBe('18h');
 });
 it('uses daily corrections and supports a shift with no lunch break',()=>{
  const changed={...schedule,overrides:{'a|2026-10-27':{worked:true,start:'10:00',end:'13:00'}}};
  expect(employeeCalendarDay(changed,'a','2026-10-27').ranges).toEqual(['10h–13h']);
  changed.overrides['a|2026-10-27']={worked:false};
  expect(employeeCalendarDay(changed,'a','2026-10-27').kind).toBe('rest');
 });
 it('approved leave or recovery replaces working hours, while pending requests do not',()=>{
  const r={employee_id:'a',status:'approved',leave_type:'leave',start:'2026-10-27',end:'2026-10-27'};
  expect(employeeCalendarDay(schedule,'a',r.start,[r])).toEqual({kind:'leave',label:'Congé validé'});
  expect(employeeCalendarDay(schedule,'a',r.start,[{...r,leave_type:'recovery'}]).kind).toBe('recovery');
  for(const status of ['pending','refused','cancelled'])expect(employeeCalendarDay(schedule,'a',r.start,[{...r,status}]).kind).toBe('work');
 });
 it('does not mistake another employee’s absence for a day off',()=>{
  const r={employee_id:'b',status:'approved',leave_type:'leave',start:'2026-10-27',end:'2026-10-27'};
  expect(employeeCalendarDay(schedule,'a',r.start,[r]).kind).toBe('work');
  expect(employeeCalendarDay(schedule,'b',r.start,[r])).toBeNull();
  expect(employeeCalendarDay(null,'a',r.start)).toBeNull();
 });
 it('supports discontinuous absence dates without blocking intervening workdays',()=>{
  const r={start:'2026-10-27',end:'2026-10-29',days:'["2026-10-27","2026-10-29"]'};
  expect(requestCoversDay(r,'2026-10-28')).toBe(false);
  expect(requestCoversDay(r,'2026-10-29')).toBe(true);
 });
 it('keeps Sundays closed even when a template is inconsistent',()=>{
  expect(employeeCalendarDay(schedule,'a','2026-11-01').kind).toBe('rest');
 });
});
