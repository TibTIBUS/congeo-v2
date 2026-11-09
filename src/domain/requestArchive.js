export const expiredUnapproved=(r,today)=>r.status!=='approved'&&r.leave_type!=='sick'&&!!r.end&&r.end<today;
