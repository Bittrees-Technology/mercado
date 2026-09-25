import { dealerUrl, textField, uuid } from "./security.mjs";
const invalid = (m) => {
  throw Object.assign(Error(m), { status: 400 });
};
export function imageUrl(value) {
  if (typeof value !== "string") return invalid("Choose a product image");
  if (
    /^\/products\/[a-z0-9-]+\.(png|jpe?g|webp)$/i.test(value) ||
    (/^\/api\/image\?id=[a-f0-9-]{36}$/.test(value) &&
      uuid(value.split("=")[1]))
  )
    return value;
  return dealerUrl(value);
}
export function imageUpload(value) {
  if (typeof value !== "string" || value.length > 1400000)
    return invalid("Upload a JPEG, PNG or WebP image up to 1 MB");
  const m = value.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!m) return invalid("Use JPEG, PNG or WebP");
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length < 12 || buffer.length > 1048576)
    return invalid("Image must be between 12 bytes and 1 MB");
  const valid =
    m[1] === "image/png"
      ? buffer
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : m[1] === "image/jpeg"
        ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
        : buffer.toString("ascii", 0, 4) === "RIFF" &&
          buffer.toString("ascii", 8, 12) === "WEBP";
  if (!valid) return invalid("The image file does not match its format");
  return { mime: m[1], data: buffer.toString("base64"), bytes: buffer.length };
}
export function itemInput(b) {
  const id = textField(b.id, 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
    return invalid("Use a lowercase product ID with hyphens");
  const quoteOnly = b.price_kind === "quote";
  const price = quoteOnly ? null : Number(b.price);
  if (!quoteOnly && (
    b.price === "" ||
    b.price == null ||
    !Number.isFinite(price) ||
    price < 0 ||
    price > 99999999.99 ||
    Math.abs(price * 100 - Math.round(price * 100)) > 0.000001
  ))
    return invalid("Enter a price with at most two decimal places");
  if (
    !["USD", "EUR", "GBP", "MXN", "CAD", "AUD"].includes(b.currency) ||
    !["reference", "asking", "quote"].includes(b.price_kind) ||
    typeof b.active !== "boolean"
  )
    return invalid("Check price type, currency and visibility");
  const date = String(b.price_checked || "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    date > new Date().toISOString().slice(0, 10)
  )
    return invalid("Use a valid price check date, not in the future");
  return {
    id,
    product_id: textField(b.product_id, 80),
    name: textField(b.name, 160),
    description: textField(b.description, 1500),
    price,
    currency: b.currency,
    price_kind: b.price_kind,
    price_checked: date,
    source_url: b.source_url ? dealerUrl(b.source_url) : "",
    source_name: String(b.source_name || "").slice(0, 100),
    image_url: !b.image_url ? "" : imageUrl(b.image_url),
    image_credit: String(b.image_credit || "").slice(0, 200),
    model_group: String(b.model_group || "")
      .trim()
      .slice(0, 160),
    hashrate: String(b.hashrate || "")
      .trim()
      .slice(0, 200),
    specifications: String(b.specifications || "").slice(0, 2000),
    supplier_status: ["InStock", "OutOfStock", "Unknown"].includes(
      b.supplier_status,
    )
      ? b.supplier_status
      : "Unknown",
    supplier_region: [
      "US",
      "EU",
      "UK",
      "MX",
      "CA",
      "CN",
      "Unverified",
    ].includes(b.supplier_region)
      ? b.supplier_region
      : "Unverified",
    tax_note: String(
      b.tax_note || "Taxes and delivery confirmed by quote",
    ).slice(0, 200),
    configuration_note: String(b.configuration_note || "").slice(0, 300),
    active: b.active,
  };
}
