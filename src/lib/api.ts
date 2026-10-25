export const basePath=new URL('.',document.baseURI).pathname;
export const employeeHref=basePath;
export const adminHref=basePath+'#/admin';
export async function apiFetch(path:string,options:RequestInit={}){
 const configured=import.meta.env.VITE_API_URL?.trim()||window.CONGEO_API_URL?.trim()||location.origin;
 if(!configured)throw new Error('Le planning partagé n’est pas encore connecté. Contactez la gérante.');
 const origin=new URL(configured);
 if(origin.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(origin.hostname)&&!(import.meta.env.DEV&&origin.origin===location.origin))throw new Error('L’adresse du planning doit utiliser une connexion sécurisée.');
 let response:Response;
 try{response=await fetch(origin.origin+path,{...options,credentials:'omit'});}catch{throw new Error('Le planning partagé est momentanément inaccessible. Réessayez dans un instant.');}
 if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Le planning partagé ne répond pas correctement. Contactez la gérante.');
 return response;
}
