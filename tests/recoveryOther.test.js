// Solde de récupération « à renseigner » (inconnu, jamais 0 h confirmé) et
// nouvelle catégorie « autre récupération / jour férié » sans débit du
// compteur horaire — décision d'Aline, 19 nov 2026.
import {describe,it,expect} from 'vitest';
import {changePlanning} from '../server/restored.js';
import {defaultWorkTemplates} from '../src/domain/defaults.js';
import {checkRecoveryValidation,isBalanceKnown} from '../src/domain/requests.js';

const fixture=()=>({employees:[{id:'a',name:'Aline',active:true},{id:'c',name:'Chloé',active:true}],templates:{a:defaultWorkTemplates(),c:defaultWorkTemplates()},overrides:{},requests:[],blocks:[],settings:{firstWeek:'false',blocksConfigured:'true'},recoveryLedger:[],outbox:[]});
const addRecovery=(db,emp,start,end,leaveType='recovery')=>{changePlanning(db,{employee:emp,action:'request',start,end,leaveType});return db.requests.at(-1);};

describe('solde de récupération « à renseigner »',()=>{
 it('suspend la validation d’une récupération horaire tant que le solde est inconnu',()=>{
  const db=fixture(),r=addRecovery(db,'c','2027-06-07','2027-06-07');
  expect(()=>changePlanning(db,{admin:true,action:'approve',id:r.id})).toThrow('à renseigner');
  expect(r.status).toBe('pending');expect(db.recoveryLedger).toHaveLength(0);
 });
 it('le premier enregistrement du solde part de l’inconnu, puis la validation décompte normalement',()=>{
  const db=fixture(),r=addRecovery(db,'c','2027-06-07','2027-06-07');
  expect(()=>changePlanning(db,{admin:true,action:'hoursSetBalance',target:'c',minutes:900,originalBalance:480})).toThrow('pas encore renseigné');
  changePlanning(db,{admin:true,action:'hoursSetBalance',target:'c',minutes:900,originalBalance:null});
  expect(isBalanceKnown(db,'c')).toBe(true);
  expect(db.recoveryLedger).toHaveLength(1);
  expect(db.recoveryLedger[0]).toMatchObject({deltaMin:900,reason:'Solde initial de récupération renseigné'});
  changePlanning(db,{admin:true,action:'approve',id:r.id});
  expect(r.status).toBe('approved');expect(r.deductedMin).toBe(450);
  expect(db.recoveryLedger.reduce((s,l)=>s+l.deltaMin,0)).toBe(450);
 });
 it('un 0 enregistré est un 0 confirmé : validation bloquée par solde insuffisant, pas par inconnu',()=>{
  const db=fixture(),r=addRecovery(db,'c','2027-06-07','2027-06-07');
  changePlanning(db,{admin:true,action:'hoursSetBalance',target:'c',minutes:0,originalBalance:null});
  expect(()=>changePlanning(db,{admin:true,action:'approve',id:r.id})).toThrow('ne couvre pas');
 });
 it('checkRecoveryValidation distingue inconnu et insuffisant',()=>{
  const db=fixture(),r=addRecovery(db,'c','2027-06-07','2027-06-07');
  expect(checkRecoveryValidation(r,db.templates,db.overrides,0,false).reason).toContain('a renseigner');
  expect(checkRecoveryValidation(r,db.templates,db.overrides,0,true).reason).toContain('insuffisant');
 });
});

describe('autre récupération / jour férié (recovery_other)',()=>{
 it('se pose et se valide sans jamais débiter le compteur horaire, solde inconnu ou non',()=>{
  const db=fixture(),r=addRecovery(db,'c','2027-06-07','2027-06-07','recovery_other');
  expect(r.type).toBe('recovery_other');expect(r.dates).toEqual(['2027-06-07']);
  changePlanning(db,{admin:true,action:'approve',id:r.id});
  expect(r.status).toBe('approved');expect(r.deductedMin??0).toBe(0);expect(db.recoveryLedger).toHaveLength(0);
 });
 it('rejette un type d’absence inconnu',()=>{
  const db=fixture();
  expect(()=>addRecovery(db,'c','2027-06-07','2027-06-07','conge_paye')).toThrow('Type d’absence invalide');
 });
});

describe('import de récupérations déjà validées (aucune double déduction)',()=>{
 it('importe la récupération validée de Chloé 9-10/12 : visible, 15 h affichées, journal inchangé',()=>{
  const db=fixture();
  changePlanning(db,{admin:true,action:'importApprovedLeave',target:'c',start:'2026-12-09',end:'2026-12-10',confirm:true,leaveType:'recovery'});
  const r=db.requests.at(-1);
  expect(r).toMatchObject({type:'recovery',status:'approved',dates:['2026-12-09','2026-12-10'],deductedMin:900});
  expect(r.details.importedRecovery).toBe(1);
  expect(db.recoveryLedger).toHaveLength(0); // pas de débit : les 15 h ne sont pas débitées une première fois…
  expect(db.outbox).toHaveLength(0); // … et aucune notification.
  const before=db.requests.length;
  changePlanning(db,{admin:true,action:'importApprovedLeave',target:'c',start:'2026-12-09',end:'2026-12-10',confirm:true,leaveType:'recovery'});
  expect(db.requests).toHaveLength(before); // idempotent
 });
 it('conserve la note V1 (« Rendez-vous (après-midi) ») à l’import',()=>{
  const db=fixture();
  changePlanning(db,{admin:true,action:'importApprovedLeave',target:'c',start:'2026-11-18',end:'2026-11-18',confirm:true,leaveType:'recovery_other',note:'Rendez-vous (après-midi)'});
  const r=db.requests.at(-1);
  expect(r).toMatchObject({type:'recovery_other',status:'approved',dates:['2026-11-18']});
  expect(r.details.note).toBe('Rendez-vous (après-midi)');
  expect(r.deductedMin??0).toBe(0);expect(db.recoveryLedger).toHaveLength(0);
 });
 it('une correction ultérieure ne recrédite pas puis ne débite qu’une seule fois les 15 h',()=>{
  const db=fixture();
  changePlanning(db,{admin:true,action:'importApprovedLeave',target:'c',start:'2026-12-09',end:'2026-12-10',confirm:true,leaveType:'recovery'});
  changePlanning(db,{admin:true,action:'hoursSetBalance',target:'c',minutes:1800,originalBalance:null});
  const r=db.requests.at(-1),ledgerBefore=db.recoveryLedger.length;
  changePlanning(db,{admin:true,action:'editApproved',id:r.id,originalStart:'2026-12-09',originalEnd:'2026-12-10',originalStatus:'approved',start:'2026-12-09',end:'2026-12-10',leaveType:'recovery'});
  const entries=db.recoveryLedger.slice(ledgerBefore);
  expect(entries.filter(l=>l.deltaMin>0)).toHaveLength(0); // aucune recréditation fantôme
  expect(entries.filter(l=>l.deltaMin===-900)).toHaveLength(1); // … ni deuxième débit des 15 h
  expect(r.details.importedRecovery).toBeUndefined();
 });
 it('la suppression d’une récupération importée ne crédite rien',()=>{
  const db=fixture();
  changePlanning(db,{admin:true,action:'importApprovedLeave',target:'c',start:'2026-12-09',end:'2026-12-10',confirm:true,leaveType:'recovery'});
  const r=db.requests.at(-1);
  changePlanning(db,{admin:true,action:'deleteApproved',id:r.id,originalStart:'2026-12-09',originalEnd:'2026-12-10',originalStatus:'approved'});
  expect(db.requests).toHaveLength(0);
  expect(db.recoveryLedger.every(l=>l.deltaMin!==900)).toBe(true);
 });
});
