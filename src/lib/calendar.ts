export const months=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
export const iso=(d:Date)=>d.toISOString().slice(0,10);
export const parse=(s:string)=>new Date(s+'T12:00:00Z');
export function validDate(s:unknown):s is string {return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parse(s).getTime()) && iso(parse(s))===s;}
export function workdays(start:string,end:string){if(!validDate(start)||!validDate(end)||end<start)throw new Error('Choisissez une période valide.'); const days:string[]=[]; const d=parse(start);for(let i=0;iso(d)<=end;i++){if(i>=370)throw new Error('La période ne peut pas dépasser un an.');if(d.getUTCDay()!==0)days.push(iso(d));d.setUTCDate(d.getUTCDate()+1);}if(!days.length)throw new Error('Le dimanche est un jour de fermeture.');return days;}
export function weekNumber(s:string){const d=parse(s);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));return Math.ceil(((d.getTime()-Date.UTC(d.getUTCFullYear(),0,1))/86400000+1)/7);}
export function weekPeriod(s:string){const d=parse(s);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));const start=iso(d);d.setUTCDate(d.getUTCDate()+5);return {start,end:iso(d)};}
export const defaultBlocks=[{id:'noel-2026',label:'Vacances de Noël · zone B',start:'2026-12-19',end:'2027-01-03'}];
export function blockedReason(day:string,blocks:{start:string,end:string,label:string}[],firstWeek:boolean){if(parse(day).getUTCDay()===0)return 'Dimanche · magasin fermé';if(firstWeek&&weekNumber(day)===1)return 'Semaine n° 1';return blocks.find(b=>b.start<=day&&b.end>=day)?.label||'';}
export function dateLabel(s:string){return parse(s).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Paris'});}
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
