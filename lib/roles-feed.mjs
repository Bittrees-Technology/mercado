import {neon} from '@neondatabase/serverless';
import {feedAuthorized,createRoleFeed} from './role-feed-core.mjs';
export async function readRoleFeed(sql){
const assigned=await sql`SELECT identity,role FROM marcada.roles ORDER BY identity LIMIT 1001`;
const rows=assigned.map(r=>({identity:r.identity,label:r.role,scope:'local-role-registry'}));
for(const identity of [process.env.ADMIN_EMAIL,process.env.ADMIN_WALLET].filter(Boolean))rows.push({identity:identity.toLowerCase(),label:'recovery owner',scope:'configured-recovery-owner'});
return createRoleFeed('mercado.bittrees.org',rows,{coverageNote:'Explicit local role assignments and configured recovery owners only. Gov/Snapshot-derived effective authority, linked identities, default customers and offer-specific grants remain separate and are not inferred.'});
}
export async function handleRoleFeed(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!feedAuthorized(req.headers.authorization,process.env.ROLES_FEED_READ_TOKEN))return res.status(401).json({error:'Feed authentication required'});
 try {if(!process.env.DATABASE_URL)throw Error('Storage unavailable');return res.status(200).json(await readRoleFeed(neon(process.env.DATABASE_URL)));}
 catch {return res.status(503).json({error:'Role feed unavailable'});}
}
