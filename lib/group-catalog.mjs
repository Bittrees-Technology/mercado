// Only explicit, reviewed model/configuration groups may combine supplier listings.
// Ungrouped products always retain their own identity, even if titles look similar.
export function comparisonKey(item) {
  const group = String(item.model_group || "")
    .trim()
    .replace(/\s+/g, " ");
  return group
    ? "model:" + group.toLowerCase()
    : item.product_id + ":item:" + item.id;
}
export function sortVendorOffers(items) {
  return [...items].sort(
    (a, b) =>
      a.currency.localeCompare(b.currency) ||
      Number(a.price == null) - Number(b.price == null) ||
      Number(a.price) - Number(b.price) ||
      a.source_name.localeCompare(b.source_name) ||
      a.id.localeCompare(b.id),
  );
}
export function groupCatalog(items) {
  const groups = new Map();
  for (const item of items) {
    const key = comparisonKey(item);
    if (!groups.has(key))
      groups.set(key, { key, name: item.model_group || item.name, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    items: sortVendorOffers(group.items),
  }));
}
