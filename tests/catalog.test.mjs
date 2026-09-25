import { test } from "node:test";
import assert from "node:assert/strict";
import { itemInput, imageUpload, imageUrl } from "../lib/catalog.mjs";
const valid = {
  id: "sample-product",
  product_id: "bitaxe",
  name: "Sample",
  description: "Sample product",
  price: "123.45",
  currency: "USD",
  price_kind: "reference",
  price_checked: "2026-09-13",
  source_url: "https://example.com/product",
  image_url: "/products/sample-product.png",
  active: true,
};
test("catalog prices and product identity are validated", () => {
  assert.equal(itemInput(valid).price, 123.45);
  for (const patch of [
    { price: -1 },
    { price: 1.001 },
    { price: "" },
    { currency: "BTC" },
    { id: "../private" },
    { active: "true" },
    { price_checked: "2026-02-31" },
  ])
    assert.throws(() => itemInput({ ...valid, ...patch }));
});
test("image uploads reject active content, mime spoofing and oversized payloads", () => {
  for (const s of [
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "data:image/png;base64," +
      Buffer.from("not a real png file").toString("base64"),
    "x".repeat(1400001),
  ])
    assert.throws(() => imageUpload(s));
  assert.throws(() => imageUrl("javascript:alert(1)"));
  assert.throws(() => imageUrl("//evil.example/track"));
  assert.equal(
    imageUrl("/products/sample-product.png"),
    "/products/sample-product.png",
  );
  const p = imageUpload(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  );
  assert.equal(p.mime, "image/png");
  assert.ok(p.bytes > 12);
});

test("hash rates retain units and conditions, are optional and bounded", () => {
  assert.equal(itemInput(valid).hashrate, "");
  assert.equal(
    itemInput({ ...valid, hashrate: " 1.2 TH/s (standard) " }).hashrate,
    "1.2 TH/s (standard)",
  );
  assert.equal(
    itemInput({ ...valid, hashrate: "x".repeat(201) }).hashrate.length,
    200,
  );
});

test('quote-only listings preserve missing prices and optional photography', () => {
  assert.equal(itemInput({...valid, price_kind:'quote', price:'', image_url:''}).price,null);
  assert.equal(itemInput({...valid, price_kind:'quote', price:123}).price,null);
  assert.throws(()=>itemInput({...valid,price:null}));
});
