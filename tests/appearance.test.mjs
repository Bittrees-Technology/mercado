import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const script=readFileSync(new URL('../public/appearance.js',import.meta.url),'utf8');
test('appearance defaults to light and honors explicit dark, including disabled storage',()=>{
 for(const [stored,wanted] of [[null,'light'],['light','light'],['dark','dark'],['invalid','light']]){
  const document={documentElement:{dataset:{}}};runInNewContext(script,{document,localStorage:{getItem(key){assert.equal(key,'mercado-appearance-choice');return stored;}}});assert.equal(document.documentElement.dataset.theme,wanted);
 }
 const document={documentElement:{dataset:{}}};runInNewContext(script,{document,localStorage:{getItem(){throw Error('Storage blocked')}}});assert.equal(document.documentElement.dataset.theme,'light');
});
