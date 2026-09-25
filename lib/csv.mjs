export const fields = [
  "id",
  "product_id",
  "name",
  "description",
  "price",
  "currency",
  "price_kind",
  "price_checked",
  "source_url",
  "source_name",
  "image_url",
  "image_credit",
  "specifications",
  "hashrate",
  "model_group",
  "supplier_status",
  "supplier_region",
  "tax_note",
  "configuration_note",
  "active",
];
export function parseCsv(text) {
  if (new TextEncoder().encode(text).length > 1048576)
    throw Error("Use a CSV file up to 1 MB.");
  text = text.replace(/^\uFEFF/, "");
  const records = [];
  let row = [],
    value = "",
    quoted = false,
    ended = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          ended = true;
        }
      } else value += c;
      continue;
    }
    if (c === '"') {
      if (value || ended) throw Error("Unexpected quote in CSV.");
      quoted = true;
      continue;
    }
    if (c === "," || c === "\n" || c === "\r") {
      row.push(value);
      value = "";
      ended = false;
      if (c !== ",") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (row.some((x) => x !== "")) records.push(row);
        row = [];
      }
      continue;
    }
    if (ended) throw Error("Unexpected text after a quoted field.");
    value += c;
  }
  if (quoted) throw Error("A quoted CSV field is not closed.");
  row.push(value);
  if (row.some((x) => x !== "")) records.push(row);
  const headers = records.shift()?.map((x) => x.trim().toLowerCase());
  if (
    !headers?.length ||
    headers.some((x) => !fields.includes(x)) ||
    new Set(headers).size !== headers.length
  )
    throw Error(
      "Use the template headers; unknown or duplicate columns are not supported.",
    );
  if (records.length > 200) throw Error("Import up to 200 products at a time.");
  return records.map((r, i) => {
    if (r.length !== headers.length)
      throw Error(`CSV record ${i + 2} has the wrong number of columns.`);
    const p = Object.fromEntries(headers.map((h, j) => [h, r[j].trim()]));
    return {
      currency: "USD",
      price_kind: "reference",
      supplier_status: "Unknown",
      supplier_region: "Unverified",
      active: "false",
      ...p,
    };
  });
}
export function problems(p, rows, collections) {
  const issues = [];
  for (const key of [
    "id",
    "product_id",
    "name",
    "price",
    "currency",
    "price_kind",
    "price_checked",
    "image_url",
  ])
    if (!(key === "image_url" || (p.price_kind === "quote" && key === "price")) && !String(p[key] ?? "").trim()) issues.push(`${key} is required`);
  if (p.id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id))
    issues.push("Use a lowercase ID with hyphens");
  if (p.id && rows.filter((x) => x.id === p.id).length > 1)
    issues.push("Duplicate product ID in this file");
  if (p.product_id && !collections.some((c) => c.id === p.product_id))
    issues.push("Choose an existing collection");
  if (
    p.price &&
    (!/^\d+(\.\d{1,2})?$/.test(p.price) || Number(p.price) > 99999999.99)
  )
    issues.push("Price must be a non-negative number with up to two decimals");
  if (!["USD", "EUR", "GBP", "MXN", "CAD", "AUD"].includes(p.currency))
    issues.push("Choose a supported currency");
  if (!["reference", "asking", "quote"].includes(p.price_kind))
    issues.push("Choose reference, asking or quote price");
  if (!["true", "false"].includes(p.active))
    issues.push("Visibility must be true or false");
  if (
    p.price_checked &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(p.price_checked) ||
      !Number.isFinite(Date.parse(p.price_checked)) ||
      new Date(p.price_checked).toISOString().slice(0, 10) !==
        p.price_checked ||
      p.price_checked > new Date().toISOString().slice(0, 10))
  )
    issues.push("Enter a valid price-check date, not in the future");
  for (const key of ["source_url", "image_url"])
    if (p[key]) {
      try {
        if (key === "image_url" && /^\/(products\/|api\/image\?)/.test(p[key]))
          continue;
        const u = new URL(p[key]);
        if (u.protocol !== "https:" || u.username || u.password) throw Error();
      } catch {
        issues.push(`${key} must be a public HTTPS URL`);
      }
    }
  return issues;
}
