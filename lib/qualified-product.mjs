import { createHash } from 'node:crypto';

// Server-owned policy. Neither a proposal nor supplier prose can grant authority.
export const qualifiedSuppliers = {
  'serverdepotus.com': ['Server Depot US', 'USD', 'US'],
  'mercadominero.com.mx': ['Mercado Minero', 'MXN', 'MX'],
  'bitcoinmerch.com': ['Bitcoin Merch', 'USD', 'US'],
  'www.noxar.mx': ['NOXAR', 'MXN', 'MX'],
  'thepihut.com': ['The Pi Hut', 'GBP', 'UK'],
  'shop.pimoroni.com': ['Pimoroni', 'GBP', 'UK'],
  'vilros.com': ['Vilros', 'USD', 'US'],
  'miners.de': ['Miners.de', 'EUR', 'EU'],
};
export const canonicalSource = value => {
  const u = new URL(value);
  return u.hostname.replace(/^www\./, '') + decodeURI(u.pathname).replace(/\/$/, '');
};
const plain = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
export function qualifyProduct(proposal, fresh, currency, now = new Date()) {
  const hold = reason => ({ qualified: false, reason });
  const u = new URL(proposal.source_url);
  const supplier = qualifiedSuppliers[u.hostname];
  if (!supplier || currency !== supplier[1] || proposal.currency !== currency) return hold('Unapproved supplier or currency mismatch');
  const title = plain(fresh.title);
  const description = plain(fresh.description);
  if (!title || title.length > 160 || !description) return hold('Missing source title or specifications');
  if (title !== plain(proposal.name)) return hold('Supplier title changed; review exact model');
  const text = title + ' ' + description;
  if (/pre[ -]?order|back[ -]?order|coming soon|ships? (in |from )?(january|february|march|april|may|june|july|august|september|october|november|december)|preventa|reserva/i.test(text)) return hold('Preorder or future dispatch requires review');
  if (/UK[- ]only|only (ship|deliver).*UK|cannot (ship|deliver)|no (international|overseas) shipping|solo (env[ií]os|entregas)|restricted shipping/i.test(text)) return hold('Shipping restriction requires destination confirmation');
  if (/\bM640\b|\bblade\b|MX7000/i.test(text)) return hold('Blade enclosure compatibility requires review');
  if (/no warranty|without warranty|sin garant[ií]a|as[- ]is|for parts/i.test(text)) return hold('Warranty or condition exception');
  if (/\b(pre-owned|refurbished|renewed|used|reacondicionado)\b/i.test(text)) return hold('Refurbished condition and configuration require review');
  if (/\b(doge|scrypt|litecoin|kaspa)\b|\b(case|adapter|cable|fan|heatsink|rail kit|power supply)\s*(only|for)\b/i.test(title)) return hold('Outside automatic product scope');
  const collection = /bitaxe|nerd[qa]*xe|bitforge|gekkoscience|bitfortun|nexus s1|avalon|whatsminer|antminer [st]\d|bitcoin miner/i.test(title) ? 'asic' : /\b(jetson|dgx|hailo)\b|raspberry pi.*(ai (hat|kit)|llm kit)|(?:geforce|nvidia|quadro).*\brtx\s*[0-9a-z]+/i.test(title) ? 'ai-compute' : /\b(poweredge|proliant)\b|supermicro.*server/i.test(title) ? 'servers' : null;
  if (!collection || collection !== proposal.product_id) return hold('Collection or product scope needs review');
  const variants = fresh.variants?.filter(v => v.available === true && v.price === Math.round(Number(proposal.price) * 100)) || [];
  if (variants.length !== 1 || fresh.variants?.length !== 1) return hold('Variant selection, stock or price needs review');
  if (!(Number(proposal.price) > 0 && Number(proposal.price) <= 1000000)) return hold('Price outside automatic limits');
  let image = fresh.images?.[0];
  if (typeof image !== 'string') return hold('Missing official product image');
  if (image.startsWith('//')) image = 'https:' + image;
  const imageUrl = new URL(image);
  if (imageUrl.protocol !== 'https:' || imageUrl.hostname !== 'cdn.shopify.com' || imageUrl.username || imageUrl.password || imageUrl.port) return hold('Image requires review');
  const rates = [...new Set((text.match(/\d+(?:\.\d+)?\s*[GMTPE]H\s*\/\s*s/gi) || []).map(s => s.replace(/\s/g, '').toUpperCase()))];
  if (collection === 'asic' && rates.length !== 1) return hold('Missing or ambiguous mining hash rate');
  const lead = text.match(/\d+\s*(?:[-–]\s*\d+)?\s*(?:business\s*)?(?:weeks?|days?)/i)?.[0];
  const note = 'Supplier reference price. Stock, taxes, import duties, warranty and delivery to Nevada or Portugal require confirmation by quote.';
  return { qualified: true, policy: 'mercado-qualified-v1', product: {
    ...proposal, name: title, source_name: supplier[0], product_id: collection,
    id: 'auto-' + createHash('sha256').update(canonicalSource(u.href)).digest('hex').slice(0, 24),
    price_kind: 'reference', price_checked: now.toISOString().slice(0, 10),
    image_url: imageUrl.href, image_credit: supplier[0], supplier_region: supplier[2],
    supplier_status: lead ? 'Unknown' : 'InStock', hashrate: rates[0] || '',
    specifications: description.slice(0, 1800), configuration_note: lead ? 'Supplier lead time: ' + lead : '',
    description: `${title}. ${description.slice(0, 950)} ${note}`, tax_note: note, active: true,
  }};
}
async function readJson(url, request) {
  const response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(12000), cache: 'no-store' });
  if (!response.ok) throw Error('Supplier verification unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw Error('Empty supplier response');
  let size = 0; const chunks = [];
  try { for (;;) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > 2000000) throw Error('Supplier response too large'); chunks.push(value); } }
  finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function validateQualifiedSource(proposal, request = fetch) {
  const u = new URL(proposal.source_url);
  if (!qualifiedSuppliers[u.hostname] || u.protocol !== 'https:' || u.port || u.username || u.password || u.search || u.hash || !/^\/products\/[^/]+$/.test(u.pathname)) return { qualified: false, reason: 'Source requires a reviewed adapter' };
  const [fresh, cart] = await Promise.all([readJson(u.href + '.js', request), readJson(u.origin + '/cart.js', request)]);
  return qualifyProduct(proposal, fresh, cart.currency);
}
