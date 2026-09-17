import { CsvImport } from "./CsvImport.jsx";
import {
  comparisonKey,
  groupCatalog,
  sortVendorOffers,
} from "../lib/group-catalog.mjs";
import { filterCatalog } from "../lib/filter-catalog.mjs";
import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowRight,
  Copy,
  Upload,
  Plus,
} from "lucide-react";
export const equipmentLink = (id, ref = "", item = "") =>
  "/equipment/" +
  id +
  (item ? "/" + item : "") +
  (ref ? "?ref=" + encodeURIComponent(ref) : "");
export function ProductImage({ item }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="photo-missing">Image unavailable</div>
  ) : (
    <img
      src={item.image_url}
      alt={item.name}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
export function Price({ item }) {
  return (
    <div className="item-price">
      <strong>
        {item.configuration_note?.startsWith("From-price") ? "From " : ""}
        {new Intl.NumberFormat("en", {
          style: "currency",
          currency: item.currency,
          currencyDisplay: "code",
        }).format(item.price)}
      </strong>
      <span>
        {item.price_kind === "asking"
          ? "Listed price"
          : "Supplier reference price"}
      </span>
    </div>
  );
}
function Source({ item }) {
  return (
    <div className="item-source">
      {item.source_url && (
        <a href={item.source_url} target="_blank" rel="noopener noreferrer">
          {item.source_name || "Supplier"} source <ArrowUpRight size={12} />
        </a>
      )}
      <span>Checked {String(item.price_checked).slice(0, 10)}</span>
      <span>
        {{
          US: "US supplier market",
          EU: "EU supplier market",
          UK: "UK supplier market",
          MX: "Mexico supplier market",
          CA: "Canada supplier",
          CN: "China supplier",
        }[item.supplier_region] || "Supplier market unverified"}
      </span>
      {item.supplier_status === "OutOfStock" && (
        <span>Source reported out of stock</span>
      )}
    </div>
  );
}
export function EquipmentPage({
  canEdit = false,
  collections,
  items,
  loading,
  referral,
  onQuote,
  onShare,
  offers,
  renderOffer,
}) {
  const defaults = {
    query: "",
    market: "All",
    supplier: "All",
    currency: "All",
    availability: "All",
    maxPrice: "",
    sort: "name",
  };
  const [filters, setFilters] = useState(defaults);
  const [quantity, setQuantity] = useState("1");
  const [visible, setVisible] = useState(24);
  const setFilter = (key, value) => {
    setVisible(24);
    setFilters((f) => ({
      ...f,
      [key]: value,
      ...(key === "currency" && value === "All"
        ? { maxPrice: "", sort: "name" }
        : {}),
    }));
  };
  const parts = location.pathname.split("/").filter(Boolean);
  const domain = collections.find((p) => p.id === parts[1]),
    selected = parts[2]
      ? items.find((p) => p.id === parts[2] && p.product_id === domain?.id)
      : null;
  if (loading)
    return (
      <section className="equipment-page">
        <p>Loading products…</p>
      </section>
    );
  if (
    parts[0] !== "equipment" ||
    !domain ||
    (parts[2] && !selected) ||
    parts.length > 3
  )
    return (
      <section className="equipment-page">
        <h1>Collection not found.</h1>
        <a className="primary" href="/">
          Browse equipment
        </a>
      </section>
    );
  const ownItems = items.filter((i) => i.product_id === domain.id);
  const ownGroups = new Set(
    ownItems.filter((i) => i.model_group).map(comparisonKey),
  );
  const collectionItems = items.filter(
    (i) =>
      i.product_id === domain.id ||
      (i.model_group && ownGroups.has(comparisonKey(i))),
  );
  const list = filterCatalog(collectionItems, filters);
  const groups = groupCatalog(list);
  const alternatives = selected
    ? items.filter((i) => comparisonKey(i) === comparisonKey(selected))
    : [];
  return (
    <section className="equipment-page">
      <div className="breadcrumbs">
        <a
          href={"/" + (referral ? "?ref=" + encodeURIComponent(referral) : "")}
        >
          <ArrowLeft size={14} /> All equipment
        </a>
        {selected && (
          <>
            <span>/</span>
            <a href={equipmentLink(domain.id, referral)}>{domain.name}</a>
          </>
        )}
      </div>
      <div className="collection-heading">
        <div>
          <div className="eyebrow">
            {selected ? "PRODUCT DETAILS" : "EXPLORE THE COLLECTION"}
          </div>
          <h1>{selected ? selected.name : domain.name}</h1>
          <p>{selected ? selected.description : domain.description}</p>
        </div>
        <span className="pill">
          {selected
            ? selected.currency
            : groups.length +
              (groups.length === 1 ? " product · " : " products · ") +
              list.length +
              " offers"}
        </span>
      </div>
      {!selected && (
        <nav className="collection-nav">
          {collections.map((c) => (
            <a
              key={c.id}
              className={c.id === domain.id ? "active" : ""}
              href={equipmentLink(c.id, referral)}
            >
              {c.name}
            </a>
          ))}
        </nav>
      )}
      {!selected && (
        <section className="catalog-filters" aria-label="Filter products">
          <label>
            Find a product
            <input
              type="search"
              placeholder="Model, feature or supplier"
              value={filters.query}
              onChange={(e) => setFilter("query", e.target.value)}
            />
          </label>
          <label>
            Supplier market
            <select
              value={filters.market}
              onChange={(e) => setFilter("market", e.target.value)}
            >
              <option>All</option>
              <option value="US">United States</option>
              <option value="EU">European Union</option>
              <option value="UK">United Kingdom</option>
              <option value="MX">Mexico</option>
              <option value="CA">Canada</option>
              <option value="CN">China</option>
              <option value="Unverified">Unverified</option>
            </select>
          </label>
          <label>
            Supplier
            <select
              value={filters.supplier}
              onChange={(e) => setFilter("supplier", e.target.value)}
            >
              <option>All</option>
              {[...new Set(collectionItems.map((i) => i.source_name))]
                .sort()
                .map((v) => (
                  <option key={v}>{v}</option>
                ))}
            </select>
          </label>
          <label>
            Currency
            <select
              value={filters.currency}
              onChange={(e) => setFilter("currency", e.target.value)}
            >
              <option>All</option>
              {[...new Set(collectionItems.map((i) => i.currency))]
                .sort()
                .map((v) => (
                  <option key={v}>{v}</option>
                ))}
            </select>
          </label>
          <label>
            Supplier availability
            <select
              value={filters.availability}
              onChange={(e) => setFilter("availability", e.target.value)}
            >
              <option>All</option>
              <option value="InStock">Reported in stock</option>
              <option value="OutOfStock">Reported out of stock</option>
              <option value="Unknown">Not confirmed</option>
            </select>
          </label>
          <label>
            Maximum price
            {filters.currency !== "All" ? " (" + filters.currency + ")" : ""}
            <input
              type="number"
              min="0"
              disabled={filters.currency === "All"}
              value={filters.maxPrice}
              placeholder={
                filters.currency === "All" ? "Choose a currency" : "No maximum"
              }
              onChange={(e) => setFilter("maxPrice", e.target.value)}
            />
          </label>
          <label>
            Sort
            <select
              value={filters.sort}
              onChange={(e) => setFilter("sort", e.target.value)}
            >
              <option value="name">Name</option>
              <option value="price-asc" disabled={filters.currency === "All"}>
                Price: low to high
              </option>
              <option value="price-desc" disabled={filters.currency === "All"}>
                Price: high to low
              </option>
            </select>
          </label>
          <div className="filter-summary">
            <span>
              {list.length} of {collectionItems.length} offers
            </span>
            <button onClick={() => setFilters(defaults)}>Reset filters</button>
          </div>
        </section>
      )}
      <p className="price-note">
        Supplier prices are dated references, not confirmed hub stock. Nevada
        and Portugal coordinate sourcing. Final configuration, taxes and
        delivery are confirmed in your quote.
      </p>
      {!selected && (
        <p className="comparison-note">
          Matching models are grouped by configuration and condition. Vendor
          prices run from lowest to highest within each currency; delivery and
          taxes are confirmed by quote.
        </p>
      )}
      {selected && canEdit && (
        <a
          className="secondary"
          href={"/admin/products?item=" + encodeURIComponent(selected.id)}
        >
          Edit this product
        </a>
      )}
      {selected ? (
        <div className="item-detail">
          <div className="real-photo">
            <ProductImage key={selected.image_url} item={selected} />
            <small>{selected.image_credit}</small>
          </div>
          <div>
            <Hashrate item={selected} />
            <Price item={selected} />
            <Source item={selected} />
            <p className="tax-note">
              {selected.tax_note || "Tax and shipping confirmed by quote"}
            </p>
            {selected.configuration_note &&
              selected.configuration_note !== selected.specifications && (
                <p>{selected.configuration_note}</p>
              )}
            {alternatives.length > 1 && (
              <VendorOffers
                items={alternatives}
                domain={domain.id}
                referral={referral}
                selectedId={selected.id}
              />
            )}
            <h3>About this configuration</h3>
            <p>{selected.specifications}</p>
            <label>
              Quantity to request
              <input
                aria-label="Quantity to request"
                type="number"
                min="1"
                max="10000"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <p>
              Buy through Mercado: request a quote for your quantity and
              delivery destination. Supplier reference prices are not a binding
              offer.
            </p>
            <button
              className="primary"
              disabled={
                !/^\d+$/.test(quantity) ||
                Number(quantity) < 1 ||
                Number(quantity) > 10000
              }
              onClick={() => onQuote(domain, selected, Number(quantity))}
            >
              Request a purchase quote <ArrowUpRight size={17} />
            </button>
            <button
              className="secondary"
              onClick={() => onShare(domain.id, selected.id)}
            >
              <Copy size={15} /> Share product
            </button>
          </div>
        </div>
      ) : (
        <div className="product-grid real-products">
          {groups.slice(0, visible).map((group) => {
            const item = group.items[0];
            return (
              <article key={item.id} className="real-product">
                <a
                  className="real-photo"
                  href={equipmentLink(item.product_id, referral, item.id)}
                >
                  <ProductImage key={item.image_url} item={item} />
                  <span className="art-arrow">
                    <ArrowUpRight size={19} />
                  </span>
                </a>
                <div className="product-title">
                  <a href={equipmentLink(item.product_id, referral, item.id)}>
                    <h3>{group.name}</h3>
                  </a>
                  <button
                    className="icon"
                    aria-label={"Share " + item.name}
                    onClick={() => onShare(item.product_id, item.id)}
                  >
                    <Copy size={15} />
                  </button>
                </div>
                <p>{item.description}</p>
                <Hashrate item={item} />
                {group.items.length > 1 ? (
                  <VendorOffers
                    items={group.items}
                    domain={domain.id}
                    referral={referral}
                  />
                ) : (
                  <>
                    <Price item={item} />
                    <Source item={item} />
                  </>
                )}
                <small className="image-credit">
                  Photo: {item.image_credit || item.source_name}
                </small>
                <a
                  className="text-link"
                  href={equipmentLink(item.product_id, referral, item.id)}
                >
                  View product <ArrowRight size={14} />
                </a>
              </article>
            );
          })}
        </div>
      )}
      {!selected && groups.length > visible && (
        <button className="secondary" onClick={() => setVisible((n) => n + 24)}>
          Show more products ({visible} of {groups.length})
        </button>
      )}
      {!selected && !list.length && (
        <p className="empty">
          Products are being added to this collection. You can request a quote
          below.
        </p>
      )}
      {offers.some(
        (o) =>
          o.product_id === domain.id &&
          (!o.item_id || o.item_id === selected?.id),
      ) && (
        <section className="collection-offers">
          <h2>Dealer offers</h2>
          {offers
            .filter(
              (o) =>
                o.product_id === domain.id &&
                (!o.item_id || o.item_id === selected?.id),
            )
            .map(renderOffer)}
        </section>
      )}
      <section className="category-quote" id="request-a-quote">
        <div>
          <div className="eyebrow">LET’S BUILD YOUR SETUP</div>
          <h2>Request a quote.</h2>
          <p>
            {selected
              ? "Get a quote for " + selected.name + "."
              : "Tell us which " +
                domain.name.toLowerCase() +
                " you need, your quantity and delivery country."}
          </p>
        </div>
        <button className="primary" onClick={() => onQuote(domain, selected)}>
          Request a quote <ArrowUpRight size={18} />
        </button>
      </section>
    </section>
  );
}
export function ProductManager({
  submissions = [],
  items,
  collections,
  api,
  run,
  refresh,
  notify,
  busy,
}) {
  const [edit, setEdit] = useState(null),
    [image, setImage] = useState(""),
    [filter, setFilter] = useState(""),
    [editorOpen, setEditorOpen] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    const q = new URLSearchParams(location.search);
    const submission = submissions.find((s) => s.id === q.get("submission"));
    const item = items.find(
      (i) => i.id === (submission?.item_id || q.get("item")),
    );
    if (submission) {
      choose({
        ...item,
        ...submission.proposed,
        id: item?.id || "",
        active: item?.active || false,
        price_kind: item?.price_kind || "reference",
        price_checked: submission.proposed.price_checked || "",
        updated_at: item?.updated_at,
      });
      initialized.current = true;
    } else if (item) {
      choose(item);
      initialized.current = true;
    }
  }, [items, submissions]);
  function choose(p) {
    setEdit(p);
    setEditorOpen(true);
    setImage(p?.image_url || "");
  }
  const fresh = {
    id: "",
    product_id: collections[0]?.id || "",
    name: "",
    price: "",
    currency: "USD",
    price_kind: "asking",
    price_checked: "",
    active: false,
  };
  const p = edit || fresh;
  return (
    <section className="product-manager">
      <h3>Products, pricing & photos</h3>
      <CsvImport
        items={items}
        collections={collections}
        api={api}
        refresh={refresh}
        notify={notify}
      />
      <p>
        Products appear inside their equipment collection. Photos are public.
        Upload JPEG, PNG or WebP up to 1 MB, or use an HTTPS image URL. Uploaded
        images are public on IPFS; removing them here does not erase stored
        copies.
      </p>
      <div className="admin-toolbar">
        <label>
          Search products
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Product name, ID or supplier"
          />
        </label>
        {edit?.id && (
          <>
            <a
              className="secondary"
              href={equipmentLink(edit.product_id, "", edit.id)}
            >
              View product
            </a>
            <button
              className="secondary"
              onClick={() =>
                choose({
                  ...edit,
                  id: "",
                  name: edit.name.slice(0, 145) + " — new offer",
                  active: false,
                  updated_at: null,
                })
              }
            >
              Duplicate as new offer
            </button>
          </>
        )}
        <button className="secondary" onClick={() => choose(null)}>
          Add product
        </button>
      </div>
      <label>
        Find an existing product
        <select
          value={edit?.id || ""}
          onChange={(e) =>
            choose(items.find((i) => i.id === e.target.value) || null)
          }
        >
          <option value="">Add a new product</option>
          {items
            .filter((i) =>
              [i.name, i.id, i.source_name]
                .join(" ")
                .toLowerCase()
                .includes(filter.toLowerCase()),
            )
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {!i.active ? " — hidden" : ""}
              </option>
            ))}
        </select>
      </label>
      <details
        className="admin-editor"
        open={editorOpen}
        onToggle={(e) => setEditorOpen(e.currentTarget.open)}
      >
        <summary>{edit ? "Edit " + edit.name : "New product details"}</summary>
        <form
          className="admin-form"
          key={edit?.id || "new-product"}
          onSubmit={(e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));
            if (!data.id)
              data.id =
                (data.name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "")
                  .slice(0, 65) || "product") +
                "-" +
                crypto.randomUUID().slice(0, 8);
            run(async () => {
              await api("admin/item", {
                ...data,
                image_url: image,
                create_only: !edit?.id,
                expected_updated_at: edit?.id
                  ? edit.edit_version || edit.updated_at
                  : null,
                active: data.visibility === "active",
              });
              await refresh();
              setEdit(null);
              setEditorOpen(false);
              setImage("");
              notify(
                "Product saved. Pricing and images are updated on the site.",
              );
            });
          }}
        >
          <label>
            Product ID
            <input
              name="id"
              defaultValue={p.id}
              required={Boolean(edit?.id)}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              readOnly={Boolean(edit?.id)}
              placeholder="Generated automatically if left blank"
            />
          </label>
          <label>
            Collection
            <select name="product_id" defaultValue={p.product_id}>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="span2">
            Product name
            <input name="name" defaultValue={p.name} required maxLength={160} />
          </label>
          <label className="span2">
            Description
            <textarea
              name="description"
              defaultValue={p.description}
              required
              maxLength={1500}
            />
          </label>
          <label>
            Price
            <input
              name="price"
              type="number"
              min="0"
              max="99999999.99"
              step="0.01"
              defaultValue={p.price}
              required
            />
          </label>
          <label>
            Currency
            <select name="currency" defaultValue={p.currency}>
              {["USD", "EUR", "GBP", "MXN", "CAD", "AUD"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Price type
            <select name="price_kind" defaultValue={p.price_kind}>
              <option value="asking">Listed price</option>
              <option value="reference">Supplier reference price</option>
            </select>
          </label>
          <label>
            Price checked
            <input
              name="price_checked"
              type="date"
              defaultValue={String(p.price_checked).slice(0, 10)}
              max={new Date().toISOString().slice(0, 10)}
              required
            />
          </label>
          <label>
            Source name
            <input
              name="source_name"
              defaultValue={p.source_name}
              maxLength={100}
            />
          </label>
          <label>
            Source product URL
            <input name="source_url" type="url" defaultValue={p.source_url} />
          </label>
          <label className="span2">
            Image URL
            <input
              value={image}
              onChange={(e) => setImage(e.target.value)}
              required
              placeholder="https://… or upload below"
            />
          </label>
          <label className="span2 upload-label">
            <Upload size={18} /> Upload a replacement photo to public IPFS
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files[0];
                if (!file) return;
                run(async () => {
                  if (file.size > 1048576)
                    throw Error("Choose an image no larger than 1 MB");
                  const data = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                  });
                  const r = await api("admin/image", { image: data });
                  setImage(r.url);
                  notify("Image uploaded. Save the product to apply it.");
                });
              }}
            />
          </label>
          {image && (
            <div className="admin-image-preview span2">
              <ProductImage
                key={image}
                item={{
                  image_url: image,
                  name: p.name || "Product image preview",
                }}
              />
            </div>
          )}
          <label className="span2">
            Image credit / owner
            <input
              name="image_credit"
              defaultValue={p.image_credit}
              maxLength={200}
            />
          </label>
          <label className="span2">
            Comparison group
            <input
              name="model_group"
              defaultValue={p.model_group || ""}
              maxLength={160}
              placeholder="Raspberry Pi 5 — 8 GB board"
            />
            <small>
              Use the same group only for matching models, configurations and
              conditions. Leave blank to keep this offer separate.
            </small>
          </label>
          <label className="span2">
            Hash rate (miners)
            <input
              name="hashrate"
              defaultValue={p.hashrate || ""}
              maxLength={200}
              placeholder="1.2 TH/s (standard settings)"
            />
            <small>
              Include units and configuration or overclocking conditions. Leave
              blank if unverified.
            </small>
          </label>
          <label className="span2">
            Specifications
            <textarea
              name="specifications"
              defaultValue={p.specifications}
              maxLength={2000}
            />
          </label>
          <label>
            Supplier market
            <select
              name="supplier_region"
              defaultValue={p.supplier_region || "Unverified"}
            >
              <option value="CN">China</option>
              <option value="Unverified">Unverified</option>
              <option value="US">United States</option>
              <option value="EU">European Union</option>
              <option value="UK">United Kingdom</option>
              <option value="MX">Mexico</option>
              <option value="CA">Canada</option>
            </select>
          </label>
          <label>
            Source-reported availability
            <select
              name="supplier_status"
              defaultValue={p.supplier_status || "Unknown"}
            >
              <option value="Unknown">Not confirmed</option>
              <option value="InStock">Reported in stock</option>
              <option value="OutOfStock">Reported out of stock</option>
            </select>
          </label>
          <label className="span2">
            Tax and delivery note
            <input
              name="tax_note"
              defaultValue={
                p.tax_note || "Taxes and delivery confirmed by quote"
              }
              maxLength={200}
            />
          </label>
          <label className="span2">
            Configuration / from-price note
            <input
              name="configuration_note"
              defaultValue={p.configuration_note || ""}
              maxLength={300}
            />
          </label>
          <label>
            Visibility
            <select
              name="visibility"
              defaultValue={p.active ? "active" : "hidden"}
            >
              <option value="active">Published</option>
              <option value="hidden">Hidden</option>
            </select>
          </label>
          <div className="span2">
            <button className="primary" disabled={busy}>
              Save product <Plus size={16} />
            </button>
            {edit && (
              <button
                className="secondary"
                type="button"
                onClick={() => choose(null)}
              >
                Add another product
              </button>
            )}
          </div>
        </form>
      </details>
    </section>
  );
}

function Hashrate({ item }) {
  if (!["bitaxe", "asic"].includes(item.product_id)) return null;
  return (
    <p className="miner-hashrate">
      <strong>Hash rate</strong>
      <span>{item.hashrate || "Confirm with supplier"}</span>
    </p>
  );
}

function VendorOffers({ items, domain, referral, selectedId }) {
  const sorted = sortVendorOffers(items);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? sorted : sorted.slice(0, 4);
  return (
    <section className="vendor-comparison" aria-label="Compare vendor offers">
      <h4>{items.length} vendor offers</h4>
      <ul>
        {shown.map((item, index) => (
          <li key={item.id}>
            {(index === 0 || shown[index - 1].currency !== item.currency) && (
              <div className="offer-currency">
                {item.currency} · lowest price first
              </div>
            )}
            <a
              className="vendor-offer"
              aria-current={selectedId === item.id ? "page" : undefined}
              href={equipmentLink(item.product_id, referral, item.id)}
            >
              <span>
                <b>{item.source_name}</b>
                <small>
                  {{
                    US: "United States",
                    MX: "Mexico",
                    EU: "EU",
                    UK: "UK",
                    CA: "Canada",
                    CN: "China",
                  }[item.supplier_region] || "Market unverified"}{" "}
                  ·{" "}
                  {item.supplier_status === "OutOfStock"
                    ? "Source out of stock"
                    : "Confirm stock"}
                </small>
              </span>
              <span className="vendor-offer-price">
                <strong>
                  {new Intl.NumberFormat("en", {
                    style: "currency",
                    currency: item.currency,
                  }).format(item.price)}
                </strong>
                <small>Checked {String(item.price_checked).slice(0, 10)}</small>
                <small>View offer →</small>
              </span>
            </a>
          </li>
        ))}
      </ul>
      {sorted.length > 4 && (
        <button
          type="button"
          className="text-link"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? "Show fewer offers"
            : "Show all " + sorted.length + " offers"}
        </button>
      )}
      <small>
        Supplier reference prices. Confirm configuration and delivered cost.
      </small>
    </section>
  );
}
