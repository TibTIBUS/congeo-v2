import {schoolOn} from './school.js';
import {isClosedHoliday} from './publicHolidays.js';
export function storedDutyAssignments(data){return data.dutyAssignments||data.requests?.filter(r=>r.status==='approved').flatMap(r=>(r.details?.dutyReplacements||[]).map(x=>({...x,requestId:r.id,absentEmployeeId:r.employeeId})))||[];}
export function effectiveDutyAssignments(data,employeeId,day){if(isClosedHoliday(data,day)||schoolOn(data,employeeId,day))return [];return storedDutyAssignments(data).filter(x=>x.employeeId===employeeId&&x.day===day);}
