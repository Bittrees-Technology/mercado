// Run only through an isolated database harness; never against production.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import handler from '../api/index.mjs';
import {hash,token} from '../lib/security.mjs';
assert.equal(process.env.MERCADO_ISOLATED_AUDIT,'true','An isolated database harness is required');
const sql=neon(process.env.DATABASE_URL), cookies={}, owner='owner@audit.example', vendor='vendor@audit.example', other='other@audit.example', customer='customer@audit.example';
process.env.ADMIN_EMAIL=owner;
process.env.MAIL_FROM='Audit <test@example.com>';process.env.RESEND_API_KEY='fake-audit-key';
for(const [identity,role] of [[owner,null],[vendor,'vendor'],[other,'vendor'],[customer,null]]) {
  const t=token(); cookies[identity]='__Host-mercado='+t;
  await sql`INSERT INTO marcada.users(identity,referral) VALUES(${identity},${token().slice(0,16)})`;
  await sql`INSERT INTO marcada.sessions(hash,identity,expires_at) VALUES(${hash(t)},${identity},now()+interval '1 hour')`;
  if(role) await sql`INSERT INTO marcada.roles(identity,role) VALUES(${identity},${role})`;
}
async function req(path,body,who){let status=200,data;await handler({url:'/api/'+path,method:body===undefined?'GET':'POST',body,headers:{origin:process.env.APP_ORIGIN,'x-forwarded-for':randomUUID(),...(who?{cookie:cookies[who]}:{})}},{setHeader(){},status(n){status=n;return this},json(d){data=d;return this},end(){}});return {status,data};}
let mail=[];const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://api.resend.com/emails');mail.push(JSON.parse(options.body));return new Response(JSON.stringify({id:randomUUID()}));};
try {
  for(const kind of ['product_submitted','vendor_submitted','quote_received']){
    assert.equal((await req('admin/workflow-rule',{kind,enabled:true,recipient:'ops@example.com'},vendor)).status,403);
    assert.equal((await req('admin/workflow-rule',{kind,enabled:true,recipient:'ops@example.com'},owner)).status,200);
  }
  const body={product_id:'bitaxe',name:'Audit Gamma',description:'Test submission',source_name:'Test vendor',source_url:'https://example.com/miner',currency:'EUR',price:'',active:true};
  const saved=await req('admin/product-submission',body,vendor);assert.equal(saved.status,200,JSON.stringify(saved));const {id}=saved.data;
  assert.equal(mail.length,1);
  assert.equal((await req('admin/product-submission',{...body,id,revision:1},other)).status,409);assert.equal(mail.length,1);
  assert.equal((await req('admin/product-submission-review',{id,revision:1,status:'reviewed'},vendor)).status,403);
  assert.equal((await req('admin/product-submission-review',{id,revision:1,status:'changes_requested',note:''},owner)).status,400);
  assert.equal((await req('admin/product-submission-review',{id,revision:1,status:'changes_requested',note:'Add a photo'},owner)).status,200);
  assert.equal((await req('admin/product-submission',{...body,id,revision:1},vendor)).status,200);assert.equal(mail.length,2);
  assert.equal((await req('admin/product-submission',{...body,id,revision:1},vendor)).status,409);assert.equal(mail.length,2);
  assert.equal((await req('admin/product-submission-review',{id,revision:1,status:'reviewed'},owner)).status,409);
  assert.equal((await req('admin/product-submission-review',{id,revision:2,status:'reviewed'},owner)).status,200);
  const [proposal]=await sql`SELECT proposed FROM marcada.product_submissions WHERE id=${id}`;assert.equal(proposal.proposed.active,undefined);
  assert.equal((await req('admin',undefined,other)).data.productSubmissions.length,0);
  const qbody={product:'bitaxe',quantity:6,details:'Confidential customer instructions',request_key:randomUUID()};
  const q=await req('quotes',qbody,customer);assert.equal(q.status,201);assert.equal(mail.length,3);
  assert.equal((await req('quotes',qbody,customer)).status,200);assert.equal(mail.length,3);
  assert.equal((await req('admin/supplier-brief',{id:q.data.id},vendor)).status,403);
  const brief=await req('admin/supplier-brief',{id:q.data.id},owner);assert.equal(brief.status,200);assert.equal(brief.data.brief.quantity,6);assert.ok(!JSON.stringify(brief).includes('Confidential'));assert.ok(!JSON.stringify(brief).includes(customer));
  assert.ok(!JSON.stringify(mail).includes('Confidential'));
  const custom=await req('referrals/new',{code:'  Vendor-Mining  '},vendor);
  assert.equal(custom.status,201);assert.equal(custom.data.referral,'vendor-mining');
  assert.equal((await req('referrals/new',{code:'vendor-mining'},other)).status,409);
  assert.equal((await req('referrals/new',{code:'admin'},other)).status,400);
  const rotate=await req('referrals/new',{code:'vendor-hardware'},vendor);assert.equal(rotate.status,201);
  for(const code of ['VENDOR-MINING','vendor-hardware']) {
    const referralQuote=await req('quotes',{product:'asic',quantity:2,details:'Custom code attribution',referral:code,request_key:randomUUID()},customer);
    assert.equal(referralQuote.status,201,JSON.stringify(referralQuote));
    const [savedRef]=await sql`SELECT referral FROM marcada.quotes WHERE id=${referralQuote.data.id}`;
    assert.equal(savedRef.referral,code.toLowerCase());
  }
  assert.equal((await req('quotes',{product:'asic',quantity:1,details:'Own code check',referral:'vendor-mining',request_key:randomUUID()},vendor)).status,400);
  const vbody={name:'Audit vendor',website:'https://example.com',contact_email:vendor,feed_format:'manual',status:'submitted'};
  assert.equal((await req('admin/vendor',vbody,vendor)).status,200);const count=mail.length;
  assert.equal((await req('admin/vendor',vbody,vendor)).status,200);assert.equal(mail.length,count);
  const offer={id:q.data.id,unit_price:'100',tax:'20',shipping:'10',currency:'EUR',terms:'Audit only; no payment or real order.',expires_at:new Date(Date.now()+86400000).toISOString()};
  assert.equal((await req('admin/proposal',offer,vendor)).status,403);
  assert.equal((await req('admin/proposal',offer,owner)).status,200);
  assert.equal((await req('quote-accept',{id:q.data.id,version:1,confirm:true},other)).status,409);
  assert.equal((await req('quote-accept',{id:q.data.id,version:2,confirm:true},customer)).status,409);
  assert.equal((await req('quote-accept',{id:q.data.id,version:1,confirm:true},customer)).status,200);
  assert.equal((await req('admin/proposal',offer,owner)).status,409);
  const item={id:'audit-hidden-offer',product_id:'bitaxe',name:'Audit hidden offer',description:'Test hidden offer',price:100,currency:'EUR',price_kind:'reference',price_checked:'2026-09-01',source_name:'Audit',source_url:'https://example.com/miner',image_url:'https://example.com/miner.png',active:false,create_only:true};
  assert.equal((await req('admin/item',item,vendor)).status,403);
  assert.equal((await req('admin/item',item,owner)).status,200);
  assert.equal((await req('admin/item',item,owner)).status,409);
  const adminData=await req('admin',undefined,owner);const version=adminData.data.items.find(p=>p.id===item.id).edit_version;
  assert.equal((await req('admin/item',{...item,create_only:false,expected_updated_at:version,name:'Updated offer'},owner)).status,200);
  assert.equal((await req('admin/item',{...item,create_only:false,expected_updated_at:version},owner)).status,409);
  assert.ok(!(await req('catalog')).data.items.some(p=>p.id===item.id));
  console.log('PASS: workflow rule permissions, product review/revisions/ownership, failed-write mail suppression, quote deduplication and private-data-free supplier brief, vendor email deduplication, proposal acceptance and stale product edit protection; provider mocked.');
} finally {globalThis.fetch=originalFetch;}
