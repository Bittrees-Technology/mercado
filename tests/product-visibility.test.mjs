import test from 'node:test';
import assert from 'node:assert/strict';
import { visibilityInput } from '../lib/product-visibility.mjs';
import { permissions } from '../lib/permissions.mjs';
test('visibility changes are bounded and reject ambiguous requests', () => {
  assert.deepEqual(visibilityInput({items:[{id:'product-1',active:true}],active:false}),{items:[{id:'product-1',active:true}],active:false});
  for (const body of [{items:[],active:false},{items:[{id:'x',active:true}],active:'false'},{items:[{id:'x',active:true},{id:'x',active:true}],active:false},{items:Array.from({length:101},(_,i)=>({id:'p-'+i,active:true})),active:false}]) assert.throws(()=>visibilityInput(body));
});
test('catalog changes remain limited to catalog-authorized roles',()=>{
  for(const role of ['owner','admin','dealer_manager','catalog_manager']) assert.equal(permissions(role).canProducts,true);
  for(const role of ['support','vendor','vendor_manager','offer_manager','member']) assert.equal(permissions(role).canProducts,false);
});
