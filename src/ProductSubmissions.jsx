import { ImageUpload } from "./ImageUpload.jsx";
import React, { useState } from "react";
export function ProductSubmissions({
  user,
  admin,
  items,
  products,
  api,
  run,
  setAdmin,
  setNotice,
  busy,
}) {
  const [edit, setEdit] = useState(null),
    [draft, setDraft] = useState({}),
    [query, setQuery] = useState("");
  const [formVersion, setFormVersion] = useState(0);
  const rows = admin.productSubmissions || [];
  const reset = () => {
    setEdit(null);
    setDraft({});
    setFormVersion((v) => v + 1);
  };
  const save = async (f) => {
    await api("admin/product-submission", {
      ...Object.fromEntries(f),
      id: edit?.id,
      revision: edit?.revision || 0,
      item_id: edit?.item_id || draft.item_id || null,
    });
    setAdmin(await api("admin"));
    setNotice(
      "Submission saved for catalog review. The live product has not changed.",
    );
    reset();
  };
  if (user.vendorApproved) return <section><h2>Manage your products directly</h2><p>Your business is approved. Product changes no longer need individual review.</p><a className="primary" href="/admin/products">Manage my products</a></section>;
  return (
    <section>
      <h2>Product submissions</h2>
      <p>
        Suggest a new listing or update an existing one. Vendors can revise
        their own submissions; catalog staff review and publish changes through
        the product editor.
      </p>
      <div className="admin-toolbar">
        <label>
          Find a submitted product
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Product, supplier or submission ID"
          />
        </label>
        <button className="secondary" onClick={reset}>
          New submission
        </button>
      </div>
      <details className="admin-editor" open={Boolean(edit)}>
        <summary>
          {edit
            ? "Revise " + edit.proposed.name
            : "Submit a product or correction"}
        </summary>
        {!edit && (
          <label>
            Existing product (optional)
            <select
              value={draft.item_id || ""}
              onChange={(e) => {
                const p = items.find((p) => p.id === e.target.value);
                setDraft(
                  p
                    ? {
                        ...p,
                        item_id: p.id,
                        image_url: p.image_url?.startsWith("https://")
                          ? p.image_url
                          : "",
                      }
                    : {},
                );
              }}
            >
              <option value="">New product</option>
              {items
                .filter(
                  (p) =>
                    !query ||
                    [p.name, p.source_name, p.id]
                      .join(" ")
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )
                .slice(0, 100)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.source_name}
                  </option>
                ))}
            </select>
            <small>Use the search above to narrow the first 100 matches.</small>
          </label>
        )}
        <form
          className="admin-form"
          key={
            (edit?.id || "new") +
            ":" +
            (draft.item_id || "") +
            ":" +
            formVersion
          }
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => save(f));
          }}
        >
          <label>
            Collection
            <select
              name="product_id"
              defaultValue={draft.product_id || products[0]?.id}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {[
            ["name", "Product name", "text", true],
            ["source_name", "Supplier name", "text", true],
            ["source_url", "Supplier product URL", "url", true],
            ["price", "Reference price (optional)", "number", false],
            [
              "price_checked",
              "Actual price-check date (optional)",
              "date",
              false,
            ],
            [
              "hashrate",
              "Miner hash rate and conditions (optional)",
              "text",
              false,
            ],
          ].map(([name, label, type, required]) => (
            <label key={name}>
              {label}
              <input
                name={name}
                type={type}
                step={type === "number" ? "0.01" : undefined}
                min={type === "number" ? "0" : undefined}
                defaultValue={
                  name === "image_url" && !draft[name]?.startsWith("https://")
                    ? ""
                    : String(draft[name] ?? "").slice(
                        0,
                        name === "price_checked" ? 10 : 5000,
                      )
                }
                required={required}
              />
            </label>
          ))}
          <label className="span2">
            Product image URL (optional)
            <input
              name="image_url"
              type="url"
              value={draft.image_url || ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, image_url: e.target.value }))
              }
            />
          </label>
          <ImageUpload
            api={api}
            purpose="product"
            disabled={busy}
            onUploaded={(r) => setDraft((d) => ({ ...d, image_url: r.url }))}
          />
          {draft.image_url?.startsWith("https://") && (
            <img
              className="submission-image span2"
              src={draft.image_url}
              alt="Product image preview"
            />
          )}
          <label>
            Currency
            <select name="currency" defaultValue={draft.currency || "USD"}>
              {["USD", "EUR", "GBP", "MXN", "CAD", "AUD"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="span2">
            Description
            <textarea
              name="description"
              required
              maxLength={1500}
              defaultValue={draft.description || ""}
            />
          </label>
          <label className="span2">
            Specifications / proposed corrections
            <textarea
              name="specifications"
              maxLength={2000}
              defaultValue={draft.specifications || ""}
            />
          </label>
          <p className="span2">
            Leave unknown prices and dates blank. Do not include customer data,
            credentials or private dealer terms. Staff must complete missing
            information before publishing.
          </p>
          <button className="primary" disabled={busy}>
            Submit for review
          </button>
        </form>
      </details>
      {rows
        .filter((s) =>
          [s.proposed.name, s.proposed.source_name, s.id]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .map((s) => (
          <article className="record" key={s.id}>
            <h3>{s.proposed.name}</h3>
            <p>
              {s.status.replaceAll("_", " ")} · revision {s.revision} ·{" "}
              {s.proposed.source_name}
            </p>
            <small>{s.id}</small>
            {s.review_note && <p>Review feedback: {s.review_note}</p>}
            <details>
              <summary>Submitted details</summary>
              <dl>
                {Object.entries(s.proposed).map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>{k.replaceAll("_", " ")}</dt>
                    <dd>{String(v)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </details>
            {s.identity === user.identity && (
              <button
                className="secondary"
                onClick={() => {
                  setEdit(s);
                  setDraft({ ...s.proposed, item_id: s.item_id });
                }}
              >
                Revise submission
              </button>
            )}
            {user.canProducts && (
              <>
                <a
                  className="secondary"
                  href={"/admin/products?submission=" + s.id}
                >
                  Open in product editor
                </a>
                {s.status === "submitted" && (
                  <form
                    className="admin-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      run(async () => {
                        await api("admin/product-submission-review", {
                          id: s.id,
                          revision: s.revision,
                          status: f.get("status"),
                          note: f.get("note"),
                        });
                        setAdmin(await api("admin"));
                        setNotice(
                          "Review recorded. Publishing is a separate product-editor action.",
                        );
                      });
                    }}
                  >
                    <label>
                      Review result
                      <select name="status">
                        <option value="changes_requested">
                          Request changes
                        </option>
                        <option value="reviewed">Mark reviewed</option>
                      </select>
                    </label>
                    <label>
                      Feedback
                      <textarea name="note" maxLength={2000} />
                    </label>
                    <button disabled={busy} className="secondary">
                      Save review
                    </button>
                  </form>
                )}
              </>
            )}
          </article>
        ))}
    </section>
  );
}
