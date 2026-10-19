import {createHash,randomUUID} from 'node:crypto';
import {checkWorkflowAuthority} from './workflow-authority.mjs';
import {verifyFreshnessSource} from './freshness-source.mjs';
const fail=(m,status=400)=>Object.assign(Error(m),{status});
export function freshnessInput(action,input){
 const fields=action==='inventory'?['cursor']:action==='review'?['operationId','itemId','expectedRevision']:action==='status'?['operationId']:null;
 if(!fields||!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k)))throw fail('Invalid freshness request');
 if(action==='inventory'){if(input.cursor!==undefined&&(typeof input.cursor!=='string'||input.cursor.length>100))throw fail('Invalid cursor');return input;}
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.operationId||''))throw fail('Operation UUID required');
 if(action==='review'&&(!/^[a-z0-9-]{1,100}$/.test(input.itemId||'')||typeof input.expectedRevision!=='string'||input.expectedRevision.length>80||!Number.isFinite(Date.parse(input.expectedRevision))))throw fail('Exact item revision required');return input;
}
export async function freshnessRequest(db,grant,action,raw,{authorize=checkWorkflowAuthority,verify=verifyFreshnessSource}={}){
 if(!grant.managed||grant.freshnessPolicy!=='mercado-freshness-v1')throw fail('Freshness scope not granted',403);
 const check=()=>authorize(grant.bearer,'mercado','review:freshness');await check();
 const input=freshnessInput(action,raw);
 if(action==='inventory'){
 const rows=await db`SELECT id,product_id,name,source_url,source_name,price_kind,CASE WHEN price_kind='reference' THEN price ELSE NULL END AS price,currency,supplier_region,tax_note,configuration_note,supplier_status,price_checked,active,deleted_at,updated_at::text AS updated_at,updated_at::text AS revision,(vendor_identity IS NOT NULL AND vendor_identity<>'') AS vendor_maintained,EXISTS(SELECT 1 FROM marcada.audit a WHERE a.action='save_product' AND a.detail=i.id) AS manual_override FROM marcada.items i WHERE active AND deleted_at IS NULL AND product_id=ANY(${grant.collections}::text[]) AND id>${input.cursor||''} ORDER BY id LIMIT 100`;
 await check();return {items:rows,nextCursor:rows.length===100?rows.at(-1).id:null};
 }
 const receipt=async()=>{const [r]=await db`SELECT actor,action,detail FROM marcada.audit WHERE id=${input.operationId}`;if(!r)return null;if(r.actor!==grant.identity||r.action!=='freshness_operation')throw fail('Operation conflict',409);return JSON.parse(r.detail)};
 const old=await receipt();if(action==='status'){await check();return old||{state:'not_found'}}
 const hash=createHash('sha256').update(JSON.stringify([input.itemId,input.expectedRevision])).digest('hex');
 if(old){if(old.inputHash!==hash)throw fail('Operation input changed',409);await check();return old;}
 const [item]=await db`SELECT i.*,i.updated_at::text AS revision,EXISTS(SELECT 1 FROM marcada.audit a WHERE a.action='save_product' AND a.detail=i.id) AS manual_override FROM marcada.items i WHERE id=${input.itemId} AND product_id=ANY(${grant.collections}::text[])`;
 if(!item||!item.active||item.deleted_at||item.revision!==input.expectedRevision)throw fail('Record changed or unavailable',409);
 const decision=item.vendor_identity||item.manual_override?{state:'held',reason:'Vendor-maintained or manually edited record'}:await verify(item);
 // No model-provided updates. Only this server-owned adapter can supply a stock value.
 if(decision.state==='verified'&&!['InStock','OutOfStock'].includes(decision.supplier_status))throw fail('Invalid adapter decision');
 const update=decision.state==='verified'&&decision.supplier_status!==item.supplier_status;
 const result={state:decision.state,operationId:input.operationId,itemId:item.id,inputHash:hash,applied:update,before:{supplier_status:item.supplier_status,revision:item.revision},after:{supplier_status:update?decision.supplier_status:item.supplier_status},decision};
 await check();
 try{
 const rows=await db`WITH guarded AS (SELECT id FROM marcada.items WHERE id=${item.id} AND updated_at=${input.expectedRevision}::timestamptz AND active AND deleted_at IS NULL AND coalesce(vendor_identity,'')=coalesce(${item.vendor_identity||''},'') AND NOT EXISTS(SELECT 1 FROM marcada.audit WHERE id=${input.operationId}) FOR UPDATE), changed AS (UPDATE marcada.items SET supplier_status=${decision.supplier_status||item.supplier_status},updated_at=now() WHERE id IN(SELECT id FROM guarded) AND ${update} AND price_kind='reference' AND coalesce(vendor_identity,'')='' AND NOT EXISTS(SELECT 1 FROM marcada.audit a WHERE a.action='save_product' AND a.detail=marcada.items.id) RETURNING id), operation AS (INSERT INTO marcada.audit(id,actor,action,detail) SELECT ${input.operationId},${grant.identity},'freshness_operation',${JSON.stringify(result)} FROM guarded WHERE NOT ${update} OR EXISTS(SELECT 1 FROM changed) RETURNING id), logged AS (INSERT INTO marcada.audit(id,actor,action,detail) SELECT ${randomUUID()},${grant.identity},'supplier_availability_update',id FROM changed) SELECT id FROM operation`;
 if(!rows.length)throw fail('Record or operation changed; reconcile',409);
 }catch(error){const saved=await receipt();if(!saved||saved.inputHash!==hash)throw error;await check();return saved;}
 await check();return result;
}
