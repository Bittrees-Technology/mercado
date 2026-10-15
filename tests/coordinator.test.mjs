import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {coordinatorGrant,coordinatorRequest} from '../lib/coordinator.mjs';
test('Coordinator credentials expire and product scope is enforced before database writes',async()=>{
 const token='a'.repeat(64),grant={identity:'test',tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:100,collections:['asic']};
 assert.equal(coordinatorGrant('Bearer '+token,[grant],99),grant);
 assert.throws(()=>coordinatorGrant('Bearer '+token,[grant],100));
 assert.throws(()=>coordinatorGrant('Bearer '+'b'.repeat(64),[grant],99));
 const db=()=>{throw Error('Unexpected database write');};
 await assert.rejects(coordinatorRequest(db,grant,'preview',{operationId:randomUUID(),product:{name:'GPU',description:'Test scope',source_name:'Vendor',product_id:'ai-compute',source_url:'https://bittrees.org',currency:'USD'}}),/scope/);
 await assert.rejects(coordinatorRequest(db,grant,'publish',{operationId:randomUUID()}),/Unknown operation/);
});
