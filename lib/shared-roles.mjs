import {localRoles} from './permissions.mjs';
import {ecosystemAccess,ecosystemSubject} from './ecosystem-client.mjs';
export async function sharedMercadoRoles(identity,link={}){
 const values=[...new Set([identity,link.wallet,link.email].filter(Boolean))];
 const subjects=values.map(value=>ecosystemSubject('mercado',/^0x[a-f0-9]{40}$/.test(value)?'wallet':'email',value,process.env.ROLES_FEED_SUBJECT_SECRET));
 return ecosystemAccess('mercado',subjects,{authenticatedWallet:/^0x[a-f0-9]{40}$/.test(identity)?identity:null,verifiedEmails:values.flatMap((value,index)=>value.includes('@')?[{subject:subjects[index],email:value}]:[])}).catch(()=>({enrolled:true,authoritative:false,actions:[],expiresAt:0,unavailable:true}));
}

// Private vendor ownership survives a shared staff reset. Staff authority never
// falls back to local rows, configured owners or governance labels.
export function effectiveMercadoRole(access,localRole,now=Date.now()){
 const actions=access?.enrolled&&access.authoritative&&access.expiresAt>now?access.actions:[];
 return actions.includes('role.owner')?'owner':actions.includes('role.admin')?'admin':localRoles.find(role=>role!=='vendor'&&actions.includes('role.'+role.replaceAll('_','-')))||(localRole==='vendor'?'vendor':'customer');
}
