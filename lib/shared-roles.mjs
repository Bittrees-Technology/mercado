import {ecosystemAccess,ecosystemSubject} from './ecosystem-client.mjs';
export async function sharedMercadoRoles(identity,link={}){
 const values=[...new Set([identity,link.wallet,link.email].filter(Boolean))];
 const subjects=values.map(value=>ecosystemSubject('mercado',/^0x[a-f0-9]{40}$/.test(value)?'wallet':'email',value,process.env.ROLES_FEED_SUBJECT_SECRET));
 return ecosystemAccess('mercado',subjects,{authenticatedWallet:/^0x[a-f0-9]{40}$/.test(identity)?identity:null,verifiedEmails:values.flatMap((value,index)=>value.includes('@')?[{subject:subjects[index],email:value}]:[])}).catch(()=>({enrolled:true,authoritative:false,actions:[],expiresAt:0,unavailable:true}));
}
