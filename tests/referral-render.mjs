import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import assert from 'node:assert/strict';
const server = await createServer({server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
try {
  const {ReferralPanel}=await server.ssrLoadModule('/src/ReferralPanel.jsx');
  const props={products:[{id:'asic',name:'ASIC miners'}],items:[{id:'miner',product_id:'asic',name:'Test miner',source_name:'Vendor'}]};
  const guest=renderToStaticMarkup(React.createElement(ReferralPanel,props));
  assert.ok(guest.includes('Sign in to get your link'));
  assert.ok(!guest.includes('Request a new code'));
  const member=renderToStaticMarkup(React.createElement(ReferralPanel,{...props,user:{referral:'1234567890abcdef'}}));
  assert.ok(member.includes('Copy store link'));
  assert.ok(member.includes('1234567890abcdef'));
  assert.equal((member.match(/<details/g)||[]).length,2);
  assert.ok(!member.includes('<details open'));
  assert.ok(member.includes('Test miner'));
  console.log('PASS: referral guest/member rendering, code display, collapsed secondary options. Browser interactions not exercised.');
} finally {await server.close();}
