import React, { useState } from "react";
import { fields, parseCsv, problems } from "../lib/csv.mjs";
const choices = {
  currency: ["USD", "EUR", "GBP", "MXN", "CAD", "AUD"],
  price_kind: ["reference", "asking", "quote"],
  active: ["false", "true"],
  supplier_status: ["Unknown", "InStock", "OutOfStock"],
  supplier_region: ["Unverified", "US", "EU", "CA", "CN"],
};
export function CsvImport({ items, collections, api, refresh, notify }) {
  const [rows, setRows] = useState([]),
    [selected, setSelected] = useState(0),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [updates, setUpdates] = useState(false),
    [results, setResults] = useState({});
  const p = rows[selected];
  function edit(key, value) {
    setRows((old) =>
      old.map((r, i) => (i === selected ? { ...r, [key]: value } : r)),
    );
    setResults((old) => ({ ...old, [selected]: undefined }));
  }
  function issues(r) {
    return [
      ...problems(r, rows, collections),
      ...(!updates && items.some((i) => i.id === r.id)
        ? ["Existing ID: enable updates or use a new ID"]
        : []),
    ];
  }
  const ready = rows.filter(
    (r, i) => !issues(r).length && results[i] !== "Saved",
  ).length;
  async function save() {
    setSaving(true);
    setError("");
    let count = 0;
    try {
      for (let i = 0; i < rows.length; i++) {
        if (issues(rows[i]).length || results[i] === "Saved") continue;
        try {
          await api("admin/item", {
            ...rows[i],
            active: rows[i].active === "true",
            create_only: !updates,
          });
          setResults((old) => ({ ...old, [i]: "Saved" }));
          count++;
        } catch (e) {
          setResults((old) => ({ ...old, [i]: e.message || "Save failed" }));
        }
      }
      await refresh();
      notify(
        `${count} product${count === 1 ? "" : "s"} imported. Review any remaining rows.`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <details className="csv-import">
      <summary>Import products from CSV</summary>
      <p>
        Upload up to 200 products (1 MB). Review and complete each row before
        importing. Nothing is saved until you choose Import ready rows.
        Incomplete rows stay here while this page is open.
      </p>
      <a href="/product-import-template.csv" download>
        Download CSV template
      </a>
      <label>
        Choose CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={saving}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setError("");
            try {
              if (file.size > 1048576)
                throw Error("Use a CSV file up to 1 MB.");
              setRows(parseCsv(await file.text()));
              setSelected(0);
              setResults({});
              setUpdates(false);
            } catch (err) {
              setRows([]);
              setError(err.message);
            }
            e.target.value = "";
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {!!rows.length && (
        <>
          <label>
            <input
              type="checkbox"
              checked={updates}
              disabled={saving}
              onChange={(e) => setUpdates(e.target.checked)}
            />{" "}
            Allow updates to matching product IDs (all fields will be replaced)
          </label>
          <p>
            {rows.length} rows · {ready} ready to import. New rows default to
            hidden unless active is true. Missing dates are never filled
            automatically.
          </p>
          <label>
            Review a row
            <select
              value={selected}
              disabled={saving}
              onChange={(e) => setSelected(Number(e.target.value))}
            >
              {rows.map((r, i) => (
                <option key={i} value={i}>
                  {i + 1}. {r.name || r.id || "Unnamed product"} —{" "}
                  {results[i] ||
                    (issues(r).length ? `${issues(r).length} issues` : "Ready")}
                </option>
              ))}
            </select>
          </label>
          {p && (
            <fieldset disabled={saving || results[selected] === "Saved"}>
              <legend>Complete product data</legend>
              {!!issues(p).length && (
                <ul>
                  {issues(p).map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
              <p>
                Check the supplier page for missing details. Enter the date you
                actually verified the price.
              </p>
              {p.source_url && /^https:\/\//.test(p.source_url) && (
                <a
                  href={p.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open supplier source ↗
                </a>
              )}{" "}
              {(p.name || p.source_name) && (
                <a
                  href={
                    "https://www.google.com/search?q=" +
                    encodeURIComponent(
                      [p.source_name, p.name, "official product"]
                        .filter(Boolean)
                        .join(" "),
                    )
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Find product details ↗
                </a>
              )}
              <div className="admin-form">
                {fields.map((key) => (
                  <label key={key}>
                    {key.replaceAll("_", " ")}
                    {key === "product_id" ? (
                      <select
                        value={p[key] || ""}
                        onChange={(e) => edit(key, e.target.value)}
                      >
                        <option value="">Choose collection</option>
                        {collections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    ) : choices[key] ? (
                      <select
                        value={p[key] || ""}
                        onChange={(e) => edit(key, e.target.value)}
                      >
                        <option value="">Choose a value</option>
                        {choices[key].map((value) => (
                          <option key={value} value={value}>
                            {key === "active"
                              ? value === "true"
                                ? "Published"
                                : "Hidden"
                              : value}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={key === "price_checked" ? "date" : "text"}
                        value={p[key] || ""}
                        onChange={(e) => edit(key, e.target.value)}
                      />
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {results[selected] && <p role="status">{results[selected]}</p>}
          <button
            className="primary"
            disabled={saving || !ready}
            onClick={save}
          >
            {saving ? "Importing…" : `Import ${ready} ready rows`}
          </button>
        </>
      )}
    </details>
  );
}
