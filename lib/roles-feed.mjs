import {localRoles} from './permissions.mjs';
import {neon} from '@neondatabase/serverless';
import {feedAuthorized,createRoleFeed} from './role-feed-core.mjs';
export async function readRoleFeed(sql){
const assigned=await sql`SELECT identity,role FROM marcada.roles ORDER BY identity LIMIT 1001`;
const rows=assigned.filter(r=>r.role==='vendor').map(r=>({identity:r.identity,label:r.role,scope:'local-role-registry'}));
return createRoleFeed('mercado.bittrees.org',rows,{roledefs:['owner','admin',...localRoles],coverageNote:'Private vendor ownership only. Current shared staff assignments come from Roles; historical local staff records remain stored but are not active authority. Customer data and offer-specific access remain separate.'});
}
export async function handleRoleFeed(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!feedAuthorized(req.headers.authorization,process.env.ROLES_FEED_READ_TOKEN))return res.status(401).json({error:'Feed authentication required'});
 try {if(!process.env.DATABASE_URL)throw Error('Storage unavailable');return res.status(200).json(await readRoleFeed(neon(process.env.DATABASE_URL)));}
 catch {return res.status(503).json({error:'Role feed unavailable'});}
}
