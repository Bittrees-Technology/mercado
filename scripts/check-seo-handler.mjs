import assert from 'node:assert/strict';
import handler from '../api/seo.mjs';
for(const [path,status,contains] of [['/',200,'og:image'],['/equipment/ai-compute',200,'AI compute'],['/equipment/ai-compute/local-ai2-6918771cc6',200,'NVIDIA RTX PRO 2000'],['/equipment/ai-compute/r4-vilros-7428184408158',404,'noindex'],['/admin/products',200,'noindex'],['/sitemap.xml',200,'<urlset']]) {
 let output,code;
 await handler({url:'/api/seo?path='+encodeURIComponent(path)},{setHeader(){},status(v){code=v;return this;},send(v){output=v;return this;}});
 assert.equal(code,status,path);assert(output.includes(contains),path);
 if(path==='/sitemap.xml')assert(!output.includes('r4-vilros-7428184408158'));
 console.log(path,code,'passed');
}
