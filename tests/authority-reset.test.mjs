import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {generateKeyPairSync,verify} from 'node:crypto';
import {effectiveMercadoRole} from '../lib/shared-roles.mjs';import {readRoleFeed} from '../lib/roles-feed.mjs';
const valid=(actions,extra={})=>({enrolled:true,authoritative:true,actions,expiresAt:Date.now()+60000,...extra});
test('staff roles require current scoped authority, while private vendors retain ownership',()=>{
 for(const access of [undefined,valid([]),valid(['role.owner'],{enrolled:false}),valid(['role.owner'],{authoritative:false}),valid(['role.owner'],{expiresAt:0})])for(const local of ['owner','admin','dealer_manager','support','vendor','customer'])assert.equal(effectiveMercadoRole(access,local),local==='vendor'?'vendor':'customer');
 for(const role of ['owner','admin','dealer_manager','catalog_manager','offer_manager','support','vendor_manager'])assert.equal(effectiveMercadoRole(valid(['role.'+role.replaceAll('_','-')]),'customer'),role);
 assert.equal(effectiveMercadoRole(valid(['project.admin','tier.partner']),'customer'),'admin');
});
test('project administration remains current and never grants ownership',()=>{
 assert.equal(effectiveMercadoRole(valid(['project.admin']),'owner'),'admin');
 assert.equal(effectiveMercadoRole(valid(['tier.partner']),'customer'),'customer');
 for(const extra of [{enrolled:false},{authoritative:false},{expiresAt:0}]){
  assert.equal(effectiveMercadoRole(valid(['project.admin'],extra),'admin'),'customer');
  assert.equal(effectiveMercadoRole(valid(['project.admin'],extra),'vendor'),'vendor');
 }
});
const bundle=await build({entryPoints:['api/index.mjs'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^sharp$/},()=>({path:'image',namespace:'image-fixture'}));b.onLoad({filter:/.*/,namespace:'image-fixture'},()=>({contents:'export default ()=>{throw Error("Image processing is outside this authority test")};'}));b.onResolve({filter:/^@neondatabase\/serverless$/},()=>({path:'db',namespace:'fixture'}));b.onResolve({filter:/shared-roles\.mjs$/},()=>({path:'roles',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='db'?'export const neon=()=>globalThis.mercadoFixture.sql;':'export const sharedMercadoRoles=async()=>globalThis.mercadoFixture.access;export const effectiveMercadoRole=(...a)=>globalThis.mercadoFixture.effective(...a);'}));}}]});
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('actual API denies legacy email and wallet staff, preserves approved vendor ownership, and denies vendor promotion',async()=>{
 const old={...process.env},wallet='0x'+'1'.repeat(40),email='legacy@example.invalid';process.env.APP_ORIGIN='https://mercado.bittrees.org';process.env.DATABASE_URL='fixture';process.env.ADMIN_EMAIL=email;process.env.ADMIN_WALLET=wallet;
 let identity=email,role='dealer_manager';const queries=[];
 globalThis.mercadoFixture={effective:effectiveMercadoRole,access:valid([]),sql:async(strings,...values)=>{const q=strings.join('?');queries.push({q,values});if(q.includes('FROM marcada.sessions s JOIN'))return [{identity,role,referral:'fixture',theme:'light',email:null,wallet:null}];if(q.includes('SELECT status,name FROM marcada.vendor_integrations'))return [{status:'approved',name:'Private vendor'}];if(q.includes('SELECT identity,role FROM marcada.roles'))return [{identity,role}];if(/INSERT|UPDATE|DELETE/.test(q))throw Error('Unexpected mutation');return [];}};
 const req=async(path,method='GET',body={})=>{let status=200,data;await handler({url:'/api/'+path,method,body,headers:{origin:process.env.APP_ORIGIN,cookie:'__Host-mercado=fixture','x-forwarded-for':'local-test'}},{setHeader(){},status(s){status=s;return this},json(d){data=d},end(){}});return {status,data}};
 try{
 for(const who of [email,wallet]){identity=who;for(const access of [valid([]),valid(['role.owner'],{enrolled:false}),valid(['role.owner'],{authoritative:false}),valid(['role.owner'],{expiresAt:0})]){globalThis.mercadoFixture.access=access;for(const path of ['admin/roles','admin/notifications','admin/offers'])assert.equal((await req(path)).status,403);assert.equal((await req('admin/role','POST',{identity:'another@example.invalid',role:'vendor'})).status,403);}}
 role='vendor';globalThis.mercadoFixture.access=valid([]);const me=await req('me');assert.equal(me.status,200);assert.equal(me.data.user.role,'vendor');assert.equal(me.data.user.vendorApproved,true);assert.equal(me.data.user.owner,false);const start=queries.length;assert.equal((await req('admin')).status,200);const privateQueries=queries.slice(start).filter(({q})=>/FROM marcada\.(items|vendor_integrations|product_submissions)/.test(q));assert(privateQueries.length>=3);assert(privateQueries.every(({q,values})=>q.includes('WHERE')&&values.includes(identity)));assert(!queries.slice(start).some(({q})=>/FROM marcada\.(offers|quotes|workflow_rules)/.test(q)));assert.equal((await req('admin/role','POST',{identity:'another@example.invalid',role:'admin'})).status,403);
 role='customer';globalThis.mercadoFixture.access=valid(['role.owner']);assert.equal((await req('me')).data.user.owner,true);assert.equal((await req('admin/role','POST',{identity:'another@example.invalid',role:'dealer_manager'})).status,409);
 assert(!queries.some(({q})=>/INSERT|UPDATE|DELETE/.test(q)));
 }finally{delete globalThis.mercadoFixture;for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old)}
});
test('signed feed retains private vendors and role definitions without resurrecting legacy owners or staff',async()=>{
 const old={...process.env},keys=generateKeyPairSync('ed25519');process.env.ROLES_FEED_PRIVATE_KEY=keys.privateKey.export({format:'pem',type:'pkcs8'});process.env.ROLES_FEED_SUBJECT_SECRET='x'.repeat(40);process.env.ADMIN_EMAIL='legacy@example.invalid';process.env.ADMIN_WALLET='0x'+'1'.repeat(40);
 try{const rows=[{identity:'vendor@example.invalid',role:'vendor'},{identity:'legacy@example.invalid',role:'dealer_manager'}],snapshot=structuredClone(rows);const feed=await readRoleFeed(async()=>rows);assert(verify(null,Buffer.from(JSON.stringify(feed.data)),keys.publicKey,Buffer.from(feed.signature,'base64')));assert.deepEqual(Object.values(feed.data.roles).flat().map(x=>x.label),['vendor']);assert(feed.data.roledefs.some(x=>x.label==='owner'));assert.deepEqual(rows,snapshot);assert(!JSON.stringify(feed.data).includes('vendor@example.invalid'));}finally{for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old)}
});

test("signed-in public browsing skips Roles and restricts offers to public listings", async () => {
 const record = { identity: "member@example.invalid", referral: "abc123", theme: "light", role: "owner" };
 let authorizationChecks = 0;
 const offerQueries = [];
 const catalog = [
  { id: "gamma", product_id: "bitaxe", name: "Gamma", model_group: "Bitaxe Gamma", price: 100 },
  { id: "gamma-alt", product_id: "asic", name: "Gamma alternative", model_group: " bitaxe  gamma ", price: 110 },
  { id: "server", product_id: "servers", name: "Server", model_group: "", price: 900 },
 ];
 const directory = catalog.map(({ id, product_id, name }) => ({ id, product_id, name }));
 globalThis.mercadoFixture = {
  effective: effectiveMercadoRole,
  get access() { authorizationChecks++; return valid(["project.admin"]); },
  sql: async (strings, ...values) => {
   const q = strings.join("?");
   if (q.includes("FROM marcada.sessions s JOIN")) return [record];
   if (q.includes("FROM marcada.offers o")) offerQueries.push(values);
   if (q.includes("FROM marcada.items")) {
    assert.match(q, /WHERE active AND deleted_at IS NULL/);
    return q.includes("SELECT id,product_id,name FROM") ? directory : catalog;
   }
   return [];
  },
 };
 async function get(path) {
  let status, data;
  await handler({ url: path.startsWith("/") ? path : "/api/" + path, method: "GET", headers: { cookie: "__Host-mercado=fixture" } },
   { setHeader() {}, status(s) { status = s; return this; }, json(d) { data = d; }, end() {} });
  return { status, data };
 }
 try {
  assert.deepEqual((await get("session")).data.user, {
   identity: record.identity, referral: record.referral, theme: record.theme, avatar_url: undefined, avatar_cid: undefined,
  });
  assert.deepEqual((await get("catalog?public=1")).data.items, catalog);
  assert.deepEqual((await get("catalog?public=1&compact=1")).data.items, directory);
  assert.deepEqual((await get("catalog?public=1&compact=1&collection=bitaxe")).data.items,
   [catalog[0], catalog[1], directory[2]]);
  assert.deepEqual((await get("catalog?public=1&compact=1&collection=missing")).data.items, directory);
  assert.equal((await get("/auth/session-complete")).status, 204);
  assert.equal(authorizationChecks, 0);
  assert.deepEqual(offerQueries[0], [false, false, false, ""]);
  assert.equal((await get("private-offers")).status, 200);
  assert.equal(authorizationChecks, 1);
  assert.deepEqual(offerQueries.at(-1), [true, true, true, record.identity]);
 } finally {
  delete globalThis.mercadoFixture;
 }
});
