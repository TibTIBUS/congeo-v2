export const STAFF_COLORS=['#166534','#9d174d','#6d28d9','#b45309','#0f766e','#be123c','#3f6212','#9a3412','#475569','#854d0e','#7e22ce','#115e59'];
export function defaultWorkTemplates(){
 const week=()=>Array.from({length:7},(_,weekday)=>weekday<6?{worked:true,start:'09:30',end:'19:00',pauseStart:'12:00',pauseEnd:'14:00',open:false,close:false}:{worked:false,start:null,end:null,pauseStart:null,pauseEnd:null,open:false,close:false});
 return {paire:week(),impaire:week()};
}
