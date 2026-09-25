// Exercise the actual SQL against transaction-local tables; no marketplace records change.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';
const db = neon(process.env.DATABASE_URL);
const code = fs.readFileSync(new URL('../api/index.mjs', import.meta.url),'utf8');
function query(route, context) {
 const section=code.slice(code.indexOf(`if (route === "${route}" && req.method === "POST")`));
 const template=section.match(/await sql\(\)`(WITH[\s\S]*?)`;/)[1].replaceAll('marcada.', 'pg_temp.');
 const values=[];
 const text=template.replace(/\$\{([^}]+)\}/g,(_,expr)=>{
  values.push(Function(...Object.keys(context),`return (${expr});`)(...Object.values(context)));
  return '$'+values.length;
 });
 return db.query(text,values);
}
const u={identity:'vendor-a',canProducts:false};
const base={product_id:'ai-compute',name:'Vendor test product',description:'Test',price:null,currency:'USD',price_kind:'quote',price_checked:'2026-09-25',source_url:'https://example.com/product',source_name:'Vendor A',image_url:'',image_credit:'',specifications:'Test',active:true,supplier_region:'US',tax_note:'Quote',configuration_note:'Test',supplier_status:'Unknown'};
const save=(id,who=u,extra={})=>query('admin/item',{u:who,p:{...base,id,...extra},vendorIdentity:who.identity,body:{}});
const visibility=(items,active,who=u)=>query('admin/item-visibility',{u:who,change:{items,active}});
const remove=(id,who=u)=>query('admin/item-delete',{u:who,body:{id,expected_updated_at:'2026-01-01T00:00:00Z'}});
const results=await db.transaction([
 db.query('CREATE TEMP TABLE items (LIKE marcada.items INCLUDING ALL) ON COMMIT DROP'),
 db.query('CREATE TEMP TABLE audit (LIKE marcada.audit INCLUDING ALL) ON COMMIT DROP'),
 db.query('CREATE TEMP TABLE vendor_integrations (identity text PRIMARY KEY,status text) ON COMMIT DROP'),
 db.query("INSERT INTO vendor_integrations VALUES ('vendor-a','approved'),('vendor-b','approved'),('pending','submitted')"),
 save('own'),save('other',{identity:'vendor-b',canProducts:false}),
 save('other',u,{name:'Unauthorized edit'}),
 save('own',u,{name:'Updated own product'}),
 visibility([{id:'other',active:true}],false),
 visibility([{id:'own',active:true},{id:'other',active:true}],false),
 visibility([{id:'own',active:true}],false),
 visibility([{id:'own',active:false}],true),
 db.query("UPDATE items SET updated_at='2026-01-01T00:00:00Z'"),
 remove('other'), remove('own'),save('own'),
 db.query("UPDATE vendor_integrations SET status='paused' WHERE identity='vendor-a'"),
 save('paused-new'),save('pending-new',{identity:'pending',canProducts:false}),
 db.query('SELECT id,name,active,vendor_identity,deleted_at FROM items ORDER BY id'),
 db.query('SELECT action,count(*)::int AS n FROM audit GROUP BY action')
]);
assert.equal(results[4][0].vendor_identity,'vendor-a');
assert.equal(results[6].length,0);assert.equal(results[7][0].name,'Updated own product');
for(const i of [8,9,13,15,17,18]) assert.equal(results[i].length,0,`Unauthorized operation ${i}`);
for(const i of [10,11,14]) assert.equal(results[i].length,1);
assert.equal(results[19].find(p=>p.id==='other').active,true);
assert(results[19].find(p=>p.id==='own').deleted_at);
assert.equal(results[20].find(e=>e.action==='delete_product').n,1);
console.log('Vendor integration checks passed: own create/edit/hide/undo/delete; cross-vendor and mixed-batch denial; paused/pending denial; deleted records cannot be republished. Temporary tables dropped.');
