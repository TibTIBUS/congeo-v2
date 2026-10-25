import {jsPDF} from 'jspdf';
import {regular,bold} from './pdfFonts.js';
import {formatOvertime,monthLabel} from '../domain/monthlyOvertime.js';

// A4 report generated locally from the saved monthly declaration.
export function createMonthlyOvertimePdf(data,generated=new Date()){
 const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
 for(const [style,font] of [['normal',regular],['bold',bold]]){doc.addFileToVFS('Nunito-'+style+'.ttf',font);doc.addFont('Nunito-'+style+'.ttf','Nunito',style);}
 doc.setProperties({title:'Heures supplémentaires - '+monthLabel(data.month),author:'Congéo',subject:'Relevé mensuel pour le comptable'});
 let y=0;
 const text=(value,x,top,size=10,bold=false)=>{doc.setFont('Nunito',bold?'bold':'normal');doc.setFontSize(size);doc.text(value,x,top);};
 const header=()=>{
  doc.setFillColor(55,125,122);doc.rect(15,15,180,2,'F');doc.setTextColor(35,37,42);
  text('CONGÉO | MAGASIN - LA HAYE',15,26,10,true);
  text('Heures supplémentaires',15,38,20,true);
  text(monthLabel(data.month),15,48,13,true);
  doc.setTextColor(90,103,106);text('Relevé mensuel saisi par la gérante - transmission au comptable',15,57,9);
  doc.setFillColor(224,240,233);doc.rect(15,65,180,11,'F');doc.setTextColor(35,70,64);
  text('Salarié',19,72,10,true);text('Heures du mois',84,72,10,true);text('Observation',122,72,10,true);y=76;
 };
 const next=()=>{doc.addPage();header();};
 header();
 for(const row of data.rows){
  doc.setFont('Nunito','normal');doc.setFontSize(10);
  const names=doc.splitTextToSize(row.name+(row.active?'':' (archivé)'),59);
  const notes=doc.splitTextToSize(row.entry?.note||'-',69);
  const lines=Math.max(names.length,notes.length,1);
  let offset=0;
  while(offset<lines){
   if(y+12>264)next();
   const count=Math.min(lines-offset,Math.floor((264-y-7)/5));
   if(count<1){next();continue;}
   const height=Math.max(14,count*5+7);
   doc.setFillColor(248,251,250);doc.rect(15,y,180,height,'F');doc.setTextColor(35,37,42);
   text(names.slice(offset,offset+count),19,y+7,10,true);
   if(offset===0)text(row.entry?formatOvertime(row.entry.minutes):'Non renseigné',84,y+7,10);
   text(notes.slice(offset,offset+count),122,y+7,10);
   doc.setDrawColor(215,231,225);doc.line(15,y+height,195,y+height);
   y+=height;offset+=count;
  }
 }
 if(y+33>264)next();
 const entries=data.rows.filter(r=>r.entry!==null),total=entries.reduce((sum,r)=>sum+r.entry.minutes,0),missing=data.rows.length-entries.length;
 doc.setTextColor(35,70,64);text('Total des heures supplémentaires renseignées : '+formatOvertime(total),15,y+13,11,true);
 doc.setTextColor(90,103,106);text(`${entries.length} salarié(s) renseigné(s) / ${data.rows.length} - ${missing} non renseigné(s)`,15,y+22,9);
 text('Les cases non renseignées ne valent pas zéro.',15,y+29,9);
 const pages=doc.getNumberOfPages();
 for(let i=1;i<=pages;i++){
  doc.setPage(i);doc.setDrawColor(215,231,225);doc.line(15,277,195,277);doc.setTextColor(90,103,106);
  text('Édité le '+generated.toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'})+' - Données enregistrées',15,284,8);
  text('Page '+i+' / '+pages,174,284,8);
 }
 return doc;
}
