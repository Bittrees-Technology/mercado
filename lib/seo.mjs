export const SITE = 'https://mercado.bittrees.org';
export const DEFAULT_DESCRIPTION = 'Source Bitcoin miners, Bitaxe hardware, local AI computers, GPUs and servers. Compare supplier offerings and request a quote through Mercado by Bittrees.';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function pageMeta(path, products = [], items = [], preview = false) {
  const parts = path.split('/').filter(Boolean);
  const collection = products.find(p=>p.id===parts[1]);
  const item = parts.length===3 && items.find(p=>p.id===parts[2] && p.product_id===collection?.id);
  const home = path === '/';
  const equipment = parts[0]==='equipment' && collection && (parts.length===2 || item);
  const privatePage = /^\/(admin|account)(\/|$)/.test(path);
  const valid = home || equipment || privatePage;
  const title = item ? item.name+' | Mercado' : equipment ? collection.name+' | Mercado' : home ? 'Mercado — Bitcoin mining & AI hardware | Bittrees' : privatePage ? 'Your workspace | Mercado' : 'Product or page unavailable | Mercado';
  const description = item ? `${item.description} Request a quote through Mercado.`.slice(0,300) : equipment ? `${collection.description} Compare supplier offerings and request a quote through Mercado.` : !valid ? "This product or page is no longer available. Explore mining, AI and server hardware in the Mercado catalog." : DEFAULT_DESCRIPTION;
  let image=SITE+'/social/mercado.png';
  if(item?.image_url) {try {const url=new URL(item.image_url,SITE);if(url.protocol==='https:')image=url.href;}catch{}}
  const canonical=SITE+(home?'/':path.replace(/\/$/,''));
  const schema = home ? {'@context':'https://schema.org','@type':'WebSite',name:'Mercado',url:SITE+'/',description,publisher:{'@type':'Organization',name:'Bittrees Technology'}} : equipment ? {'@context':'https://schema.org','@graph':[
    {'@type':'BreadcrumbList',itemListElement:[{name:'Mercado',item:SITE+'/'},{name:collection.name,item:SITE+'/equipment/'+collection.id},...(item?[{name:item.name,item:canonical}]:[])].map((p,i)=>({'@type':'ListItem',position:i+1,...p}))},
    item ? {'@type':'Product',name:item.name,description:item.description,image,url:canonical} : {'@type':'CollectionPage',name:collection.name,description,url:canonical}
  ]} : null;
  // Supplier references are not binding Mercado offers: do not invent Offer, stock or reviews.
  return {title,description,image,canonical,schema,status:valid?200:404,noindex:!valid||privatePage||preview,item,collection,home};
}
export function headTags(meta) {
 const e=escapeHtml;
 return `<title>${e(meta.title)}</title>
<meta name="description" content="${e(meta.description)}">
<link rel="canonical" href="${e(meta.canonical)}">
<meta name="robots" content="${meta.noindex?'noindex, nofollow':'index, follow, max-image-preview:large'}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Mercado">
<meta property="og:title" content="${e(meta.title)}"><meta property="og:description" content="${e(meta.description)}">
<meta property="og:url" content="${e(meta.canonical)}"><meta property="og:image" content="${e(meta.image)}">
${meta.image===SITE+'/social/mercado.png'?'<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/png">':''}
<meta property="og:image:alt" content="${e(meta.item?.name || 'Mercado — Bitcoin mining, local AI and server hardware')}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(meta.title)}">
<meta name="twitter:description" content="${e(meta.description)}"><meta name="twitter:image" content="${e(meta.image)}">
${meta.schema?`<script id="seo-schema" type="application/ld+json">${JSON.stringify(meta.schema).replace(/</g,'\\u003c')}</script>`:''}`;
}
export function initialContent(meta, products, items) {
 const e=escapeHtml;
 const links=meta.home?products.map(p=>({name:p.name,url:'/equipment/'+p.id})):items.filter(p=>p.product_id===meta.collection?.id).slice(0,24).map(p=>({name:p.name,url:'/equipment/'+p.product_id+'/'+p.id}));
 return `<main><a href="/">Mercado</a><h1>${e(meta.status===404?'This product or page is no longer available':meta.item?.name || meta.collection?.name || (meta.home?'Bitcoin mining & AI hardware':'Your workspace'))}</h1><p>${e(meta.description)}</p>${meta.item?`<p>${e(meta.item.specifications || '')}</p><a href="/equipment/${e(meta.collection.id)}">Browse ${e(meta.collection.name)}</a>`:`<ul>${links.map(p=>`<li><a href="${e(p.url)}">${e(p.name)}</a></li>`).join('')}</ul>`}</main>`;
}
export function sitemap(products, items) {
 const entries=[{path:'/'},...products.map(p=>({path:'/equipment/'+p.id})),...items.filter(i=>products.some(p=>p.id===i.product_id)).map(p=>({path:'/equipment/'+p.product_id+'/'+p.id,updated:p.updated_at}))];
 return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+entries.map(p=>`<url><loc>${escapeHtml(SITE+p.path)}</loc>${p.updated?`<lastmod>${new Date(p.updated).toISOString()}</lastmod>`:''}</url>`).join('')+'</urlset>';
}
