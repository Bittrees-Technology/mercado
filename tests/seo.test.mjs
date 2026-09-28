import test from 'node:test';
import assert from 'node:assert/strict';
import { pageMeta,headTags,sitemap,initialContent } from '../lib/seo.mjs';
const products=[{id:'ai-compute',name:'AI compute',description:'Local AI hardware'}];
const items=[{id:'gpu',product_id:'ai-compute',name:'GPU <test>',description:'Compute & memory',image_url:'/products/gpu.jpg',updated_at:'2026-09-28T00:00:00Z'}];
test('product metadata has a specific canonical, safe HTML and no fabricated offers',()=>{
const m=pageMeta('/equipment/ai-compute/gpu',products,items);
assert.equal(m.status,200);assert.equal(m.image,'https://mercado.bittrees.org/products/gpu.jpg');
assert.equal(m.canonical,'https://mercado.bittrees.org/equipment/ai-compute/gpu');
assert(headTags(m).includes('GPU &lt;test&gt;'));assert(!JSON.stringify(m.schema).includes('offers'));assert(initialContent(m,products,items).includes('GPU &lt;test&gt;'));
});
test('unknown, hidden and mismatched products return 404; private and preview pages are noindex',()=>{
for(const path of ['/missing','/equipment/ai-compute/missing','/equipment/bitaxe/gpu']) assert.equal(pageMeta(path,products,items).status,404);
assert(pageMeta('/admin/products',products,items).noindex);assert(pageMeta('/equipment/ai-compute/gpu',products,items,true).noindex);
});
test('sitemap includes current supplied public products and valid lastmod',()=>{
const xml=sitemap(products,items);assert(xml.includes('/equipment/ai-compute/gpu'));assert(xml.includes('<lastmod>2026-09-28T00:00:00.000Z</lastmod>'));assert(!sitemap(products,[]).includes('/gpu'));
});
