import {test} from 'node:test';
import assert from 'node:assert/strict';
import {customReferralCode,validReferralCode} from '../lib/referrals.mjs';
test('custom referral codes normalize and preserve the generated-code format for attribution',()=>{
  assert.equal(customReferralCode('  Joao-Mining  '),'joao-mining');
  assert.ok(validReferralCode('0123456789abcdef'));
  for(const code of ['abc','-mining','mining-','name with spaces','name@example.com','ábcde','a'.repeat(33),'admin','bittrees-team','official','0123456789abcdef','']) assert.throws(()=>customReferralCode(code));
});
