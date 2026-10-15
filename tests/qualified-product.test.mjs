import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyProduct,validateQualifiedSource} from '../lib/qualified-product.mjs';
import {executeQualifiedProduct} from '../lib/qualified-execution.mjs';
const p={name:'Antminer S21 200TH/s',product_id:'asic',source_url:'https://miners.de/products/s21',price:1000,currency:'EUR'};
const fresh={title:p.name,description:'200 TH/s SHA-256 miner, 3500W.',variants:[{id:1,available:true,price:100000}],images:['//cdn.shopify.com/s/files/miner.jpg']};
test('Fresh exact variant qualifies with deterministic identity, source image, hashrate and quote disclosures',()=>{
 const r=qualifyProduct(p,fresh,'EUR'); assert.equal(r.qualified,true); assert.equal(r.product.hashrate,'200TH/S'); assert.match(r.product.tax_note,/Nevada or Portugal/); assert.equal(r.product.id,qualifyProduct(p,fresh,'EUR').product.id);
});
test('Exceptions from the manual review and changed evidence remain held',()=>{
 for(const description of ['PRE-ORDER ships December 2026','UK-only delivery','M640 compatible with MX7000','new without warranty','Refurbished assembled to order','200 TH/s or 234 TH/s']) assert.equal(qualifyProduct(p,{...fresh,description},'EUR').qualified,false,description);
 for(const change of [{title:'Different model'},{variants:[{id:1,available:false,price:100000}]},{variants:[...fresh.variants,...fresh.variants]},{images:[]},{images:['http://127.0.0.1/private']}]) assert.equal(qualifyProduct(p,{...fresh,...change},'EUR').qualified,false);
 assert.equal(qualifyProduct(p,fresh,'USD').qualified,false);
});
test('Unknown destinations never receive requests; proposal grants cannot publish',async()=>{
 let fetched=false;
 assert.equal((await validateQualifiedSource({...p,source_url:'https://localhost/products/foo'},async()=>{fetched=true;})).qualified,false); assert.equal(fetched,false);
 await assert.rejects(executeQualifiedProduct(()=>{throw Error('unexpected database access');},{managed:false},'id'),/not granted/);
});
