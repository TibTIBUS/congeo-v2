import {describe,it,expect} from 'vitest';
import {displayTime,normalizeTime} from '../src/domain/dates.js';

describe('affichage des heures sans zéro initial',()=>{
 it('retire le zéro devant l’heure, garde les minutes',()=>{
  expect(displayTime('09:30')).toBe('9:30');expect(displayTime('08:00')).toBe('8:00');
  expect(displayTime('12:00')).toBe('12:00');expect(displayTime('19:00')).toBe('19:00');
  expect(displayTime('00:30')).toBe('0:30');expect(displayTime('')).toBe('');expect(displayTime(null)).toBe('');
 });
});
describe('saisie normalisée en HH:MM',()=>{
 it('accepte 9:30, 09:30, 9h30, 9.30 et normalise',()=>{
  expect(normalizeTime('9:30')).toBe('09:30');expect(normalizeTime('09:30')).toBe('09:30');
  expect(normalizeTime('9h30')).toBe('09:30');expect(normalizeTime('9.30')).toBe('09:30');
  expect(normalizeTime(' 19:00 ')).toBe('19:00');expect(normalizeTime('0:00')).toBe('00:00');
 });
 it('vide reste vide, invalide renvoie null',()=>{
  expect(normalizeTime('')).toBe('');expect(normalizeTime('   ')).toBe('');
  expect(normalizeTime('9h3')).toBe(null);expect(normalizeTime('24:00')).toBe(null);
  expect(normalizeTime('9:60')).toBe(null);expect(normalizeTime('abc')).toBe(null);
 });
});
