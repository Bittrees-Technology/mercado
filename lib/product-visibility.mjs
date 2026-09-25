export function visibilityInput(body) {
  if (typeof body.active !== 'boolean' || !Array.isArray(body.items) || !body.items.length || body.items.length > 100)
    throw new Error('Choose 1–100 products and a visibility.');
  const ids = new Set();
  const items = body.items.map(p => {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id || '') || ids.has(p.id) || typeof p.active !== 'boolean') throw new Error('Invalid or duplicate product.');
    ids.add(p.id);
    return { id: p.id, active: p.active };
  });
  return { items, active: body.active };
}
