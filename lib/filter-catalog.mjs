export function filterCatalog(
  items,
  {
    query = "",
    market = "All",
    supplier = "All",
    currency = "All",
    availability = "All",
    maxPrice = "",
    sort = "name",
  } = {},
) {
  const q = query.trim().toLowerCase();
  return items
    .filter(
      (i) =>
        (!q ||
          (i.name + " " + i.description + " " + i.source_name + " " + (i.model_group || ""))
            .toLowerCase()
            .includes(q)) &&
        (market === "All" || (i.supplier_region || "Unverified") === market) &&
        (supplier === "All" || i.source_name === supplier) &&
        (currency === "All" || i.currency === currency) &&
        (availability === "All" ||
          (i.supplier_status || "Unknown") === availability) &&
        (currency === "All" ||
          maxPrice === "" ||
          !Number.isFinite(Number(maxPrice)) ||
          (i.price != null && Number(i.price) <= Number(maxPrice))),
    )
    .sort((a, b) =>
      currency !== "All" && sort !== "name"
        ? Number(a.price == null) - Number(b.price == null) || (sort === "price-desc" ? -1 : 1) *
            (Number(a.price) - Number(b.price)) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
}
