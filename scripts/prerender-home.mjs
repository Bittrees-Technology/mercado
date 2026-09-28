import fs from 'node:fs/promises';
import { pageMeta,headTags,initialContent } from '../lib/seo.mjs';
const products=[['bitaxe','Bitaxe miners'],['asic','ASIC miners'],['ai-compute','AI compute'],['servers','Servers & networking'],['components','Electronic components'],['mining-accessories','Mining essentials']].map(([id,name])=>({id,name}));
const meta=pageMeta('/',products,[]);
let html=await fs.readFile('dist/index.html','utf8');
html=html.replace(/<title>[\s\S]*?<\/title>/,'').replace(/<meta\s+name="description"[\s\S]*?>/,'').replace(/<link rel="canonical"[^>]*>/,'').replace('<!-- SEO -->',`<!-- SEO:START -->${headTags(meta)}<!-- SEO:END -->`).replace('<div id="root"></div>',`<div id="root">${initialContent(meta,products,[])}</div>`);
await fs.writeFile('dist/index.html',html);
