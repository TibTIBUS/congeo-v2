import {describe,it,expect} from 'vitest';
import {changePlanning} from '../server/restored.js';
import {plannedMinutes} from '../src/domain/planning.js';
const fixture=()=>({employees:[{id:'a',name:'A',active:true},{id:'b',name:'B',active:true}],templates:{},overrides:{},requests:[],blocks:[],settings:{},recoveryLedger:[{id:'credit',employeeId:'a',deltaMin:600,reason:'Heures supplémentaires'},{id:'spent',employeeId:'a',deltaMin:-120,reason:'Récupération validée',requestId:'r1'}]});
const set=(db,minutes,originalBalance=480,admin=true)=>changePlanning(db,{action:'hoursSetBalance',admin,target:'a',employee:'a',minutes,originalBalance});
describe('inline team overtime balances',()=>{
 it('gives a new employee editable default hours with 7 h 30 of work per day',()=>{
  const d=fixture();changePlanning(d,{admin:true,action:'employee',name:'Nouvelle personne'});const employee=d.employees.at(-1),t=d.templates[employee.id];
  for(const parity of ['paire','impaire']){expect(t[parity]).toHaveLength(7);expect(plannedMinutes(t[parity][0])).toBe(450);expect(t[parity][6].worked).toBe(false);}
  t.paire[0].end='18:00';expect(t.impaire[0].end).toBe('19:00');
 });
 it('corrects a balance with a history entry and preserves hours already consumed',()=>{
  const d=fixture();set(d,690);expect(d.recoveryLedger).toHaveLength(3);expect(d.recoveryLedger[2].deltaMin).toBe(210);expect(d.recoveryLedger[1].deltaMin).toBe(-120);expect(d.recoveryLedger.reduce((s,l)=>s+l.deltaMin,0)).toBe(690);
 });
 it('allows a downward correction and a zero balance without deleting history',()=>{
  const d=fixture();set(d,60);set(d,0,60);expect(d.recoveryLedger).toHaveLength(4);expect(d.recoveryLedger.reduce((s,l)=>s+l.deltaMin,0)).toBe(0);
 });
 it('rejects a stale balance after a concurrent recovery',()=>{
  const d=fixture();d.recoveryLedger.push({id:'new',employeeId:'a',deltaMin:-60});expect(()=>set(d,600)).toThrow('solde a changé');expect(d.recoveryLedger).toHaveLength(3);
 });
 it('rejects employee access, invalid values and other employee IDs',()=>{
  const d=fixture();expect(()=>set(d,600,480,false)).toThrow('gérante');for(const x of [-1,0.5,60001,'bad'])expect(()=>set(d,x)).toThrow('solde positif ou nul');expect(d.recoveryLedger).toHaveLength(2);
 });
 it('does not create duplicate history when the balance is unchanged',()=>{
  const d=fixture();set(d,480);expect(d.recoveryLedger).toHaveLength(2);
 });
});
