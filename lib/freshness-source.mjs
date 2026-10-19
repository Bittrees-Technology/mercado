import {createHash} from 'node:crypto';
import {qualifiedSuppliers} from './qualified-product.mjs';
const plain=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const hold=reason=>({state:'held',reason});
export function sourceRequest(item){
 let u;try{u=new URL(item.source_url)}catch{return null}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)return null;
 if(qualifiedSuppliers[u.hostname]&&/^\/products\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname))return {kind:'shopify',url:u.href.replace(/\/$/,'')+'.js',currency:qualifiedSuppliers[u.hostname][1],region:qualifiedSuppliers[u.hostname][2]};
 return null;
}
export function verifyShopify(item,product,source,now=Date.now()){
 if(item.price_kind!=='reference'||item.vendor_identity||item.manual_override)return hold('Vendor-maintained, manually overridden or non-reference record');
 if(item.currency!==source.currency||item.supplier_region!==source.region)return hold('Region/currency mismatch');
 if(plain(item.name)!==plain(product.title))return hold('Exact product title changed');
 if(!Array.isArray(product.variants)||product.variants.length!==1)return hold('Variant requires review');
 const v=product.variants[0];
 if(!v||typeof v.available!=='boolean'||!Number.isSafeInteger(v.price)||v.price<=0||v.price>100000000||!v.id)return hold('Missing exact variant price/stock');
 if(product.handle!==new URL(item.source_url).pathname.split('/').filter(Boolean).pop())return hold('Supplier product path mismatch');
 // Price changes and tax semantics are held until a reviewed supplier-specific tax adapter exists.
 // This first policy can safely refresh stock when the exact existing reference price is unchanged.
 if(Math.round(Number(item.price)*100)!==v.price)return hold('Reference price changed; tax/from-price review required');
 if(/pre.?order|back.?order|coming soon|ships? (in|from)|refurbished|renewed|used|as.is|for parts|from price|starting at|only (ship|deliver)|cannot (ship|deliver)|no international|restricted shipping|solo env/i.test(plain(product.description)+' '+plain(v.title)+' '+item.configuration_note+' '+item.tax_note))return hold('Condition, dispatch or price-basis ambiguity');
 if(product.available!==v.available)return hold('Conflicting product/variant stock');
 return {state:'verified',supplier_status:v.available?'InStock':'OutOfStock',priceVerified:false,reason:'Exact single variant and unchanged reference price; stock verified, tax basis not reverified',evidence:{sku:String(v.sku||''),variantId:String(v.id),unitMinor:v.price,currency:source.currency,observedAt:new Date(now).toISOString()}};
}
export async function verifyFreshnessSource(item,request=fetch){
 const source=sourceRequest(item);if(!source)return hold('No reviewed supplier adapter');
 try{
 const r=await request(source.url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!r.ok)return {...hold('Supplier HTTP '+r.status+'; no stock inference'),retryAfter:r.headers.get('retry-after')};
 if(!r.headers.get('content-type')?.includes('json'))return hold('Supplier returned non-JSON evidence');
 const reader=r.body?.getReader();if(!reader)return hold('Supplier response missing');let n=0;const parts=[];
 try{for(;;){const v=await reader.read();if(v.done)break;n+=v.value.length;if(n>2000000)throw Error('Response exceeds limit');parts.push(v.value)}}finally{await reader.cancel()}
 const body=Buffer.concat(parts);const decision=verifyShopify(item,JSON.parse(body),source);
 return {...decision,sourceUrl:source.url,evidenceHash:createHash('sha256').update(body).digest('hex')};
 }catch{return hold('Supplier unavailable, redirected or invalid; no stock inference')}
}
