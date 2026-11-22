import { createServer } from "vite";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const server = await createServer({
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
try {
  const { EquipmentPage, ProductManager } =
    await server.ssrLoadModule("/src/Equipment.jsx");
  const items = [
    ...JSON.parse(await readFile("data/catalog-seed.json", "utf8")),
    ...JSON.parse(await readFile("data/regional-sources.json", "utf8")),
    ...JSON.parse(await readFile("data/sourcing-expansion.json", "utf8")),
    ...JSON.parse(await readFile("data/sourcing-round2.json", "utf8")),
    ...JSON.parse(await readFile("data/dtv-electronics.json", "utf8")),
    ...JSON.parse(await readFile("data/home-mining-gadgets.json", "utf8")),
    ...JSON.parse(await readFile("data/sourcing-round3.json", "utf8")),
    ...JSON.parse(await readFile("data/sourcing-round4.json", "utf8")),
    ...JSON.parse(await readFile("data/sourcing-round5.json", "utf8")),
  ];
  const groupAssignments = new Map(
    JSON.parse(await readFile("data/comparison-groups.json", "utf8")).map(
      (x) => [x.id, x.model_group],
    ),
  );
  for (const item of items)
    item.model_group = groupAssignments.get(item.id) || item.model_group || "";
  const collections = [...new Set(items.map((i) => i.product_id))].map(
    (id) => ({ id, name: id, description: "Collection" }),
  );
  for (const c of collections) {
    globalThis.location = { pathname: "/equipment/" + c.id };
    const html = renderToStaticMarkup(
      React.createElement(EquipmentPage, {
        collections,
        items,
        loading: false,
        referral: "abc123",
        onQuote() {},
        onShare() {},
        offers: [],
      }),
    );
    const filterDisclosure = html.match(/<details class="catalog-filter-disclosure"[^>]*>/)?.[0];
    assert.ok(filterDisclosure, `Filters are available in ${c.id}`);
    assert.doesNotMatch(filterDisclosure, /\sopen(?:[\s=>])/, `Filters start closed in ${c.id}`);
    assert.equal(
      (html.match(/class="real-product"/g) || []).length,
      Math.min(24, items.filter((p) => p.product_id === c.id).length),
    );
    assert.ok(html.includes('id="request-a-quote"'));
    assert.ok(
      html.lastIndexOf('id="request-a-quote"') >
        html.lastIndexOf('class="real-product"'),
    );
    assert.ok(html.includes("/equipment/" + c.id + "/"));
    assert.ok(html.includes('loading="lazy"'));
    assert.ok(!html.includes('fetchPriority="high"'));
  }
  for (const item of items) {
    globalThis.location = {
      pathname: "/equipment/" + item.product_id + "/" + item.id,
    };
    const html = renderToStaticMarkup(
      React.createElement(EquipmentPage, {
        collections,
        items,
        loading: false,
        offers: [],
      }),
    );
    assert.equal(
      html.includes('class="miner-hashrate"'),
      ["bitaxe", "asic"].includes(item.product_id),
    );
    if (["bitaxe", "asic"].includes(item.product_id))
      assert.ok(html.includes(item.hashrate || "Confirm with supplier"));
    assert.ok(html.includes(item.image_url));
    assert.match(html, /loading="eager" fetchPriority="high"/);
    assert.ok(html.includes("Request a purchase quote"));
    assert.ok(html.includes(item.currency));
    assert.ok(html.includes('aria-label="Quantity to request"'));
  }
  const admin = renderToStaticMarkup(
    React.createElement(ProductManager, { items, collections }),
  );
  assert.ok(admin.includes("Upload a replacement photo"));
  assert.ok(admin.includes('name="price"'));
  console.log(
    `PASS: ${collections.length} collection pages, ${items.length} product pages, referral URLs, product photos/prices and bottom quote requests render correctly.`,
  );
} finally {
  await server.close();
}
