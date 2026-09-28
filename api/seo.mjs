import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { pageMeta, headTags, initialContent, sitemap } from '../lib/seo.mjs';
let template;
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 try {
  template ||= await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const url=new URL(req.url,'https://mercado.bittrees.org');
  const path=url.searchParams.get('path') || '/';
  const privatePage=/^\/(admin|account)(\/|$)/.test(path);
  let products=[],items=[];
  if(!privatePage) {
   const sql=neon(process.env.DATABASE_URL);
   [products,items]=await Promise.all([
    sql`SELECT id,name,description FROM marcada.products WHERE active ORDER BY name`,
    sql`SELECT id,product_id,name,description,specifications,image_url,updated_at FROM marcada.items WHERE active AND deleted_at IS NULL AND (${path === '/sitemap.xml'} OR product_id=${path.split('/')[2] || ''}) AND (${!path.split('/')[3]} OR id=${path.split('/')[3] || ''}) ORDER BY name LIMIT ${path === '/sitemap.xml' ? 50000 : 24}`
   ]);
  }
  if(path==='/sitemap.xml') {res.setHeader('Content-Type','application/xml; charset=utf-8');return res.status(200).send(sitemap(products,items));}
  const meta=pageMeta(path,products,items,url.searchParams.has('preview'));
  if(meta.noindex)res.setHeader('X-Robots-Tag','noindex, nofollow');
  const html=template.replace(/<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/,'<!-- SEO -->').replace(/<title>[\s\S]*?<\/title>/,'').replace(/<meta\s+name="description"[\s\S]*?>/,'').replace(/<link rel="canonical"[^>]*>/,'').replace('<!-- SEO -->',headTags(meta)).replace(/<div id="root">[\s\S]*?<\/div>/,`<div id="root">${privatePage?'':initialContent(meta,products,items)}</div>`);
  res.setHeader('Content-Type','text/html; charset=utf-8');
  return res.status(meta.status).send(html);
 }catch(error){
  console.error('SEO rendering failed',error.message);
  res.setHeader('Retry-After','60');res.setHeader('X-Robots-Tag','noindex');
  return res.status(503).send('Mercado is temporarily unavailable. Please try again shortly.');
 }
}
