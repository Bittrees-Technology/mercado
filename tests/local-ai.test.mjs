import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {itemInput} from '../lib/catalog.mjs';
import {filterCatalog} from '../lib/filter-catalog.mjs';
import {sortVendorOffers} from '../lib/group-catalog.mjs';
test('all researched local AI offers have valid distinct catalog entries',()=>{
 const rows=JSON.parse(fs.readFileSync(new URL('../data/local-ai-expansion.json',import.meta.url)));
 assert.equal(rows.length,26);assert.equal(new Set(rows.map(x=>x.id)).size,26);
 for(const row of rows){const p=itemInput(row);assert.equal(p.product_id,'ai-compute');assert.equal(p.price==null,p.price_kind==='quote');assert.ok(p.source_url.startsWith('https://'));}
});
test('unknown prices never appear as cheapest or pass a budget filter',()=>{
 const rows=[{id:'a',name:'A',price:null,currency:'USD',source_name:'One'},{id:'b',name:'B',price:100,currency:'USD',source_name:'Two'}];
 for(const sort of ['price-asc','price-desc'])assert.equal(filterCatalog(rows,{currency:'USD',sort})[0].id,'b');
 assert.equal(filterCatalog(rows,{currency:'USD',maxPrice:'200'}).length,1);
 assert.equal(sortVendorOffers(rows)[0].id,'b');
});
