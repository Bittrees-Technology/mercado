import React, { useState } from "react";
export function Vendors({ user, admin, api, run, setAdmin, setNotice, busy }) {
  const [selected, setSelected] = useState("");
  const p = user.vendor
    ? admin.vendors?.[0]
    : admin.vendors?.find((v) => v.identity === selected);
  return (
    <section>
      <h2>Vendor integrations</h2>
      <p>
        1. Register your business → 2. Submit products → 3. Resolve review
        feedback → 4. Staff publish qualified listings.
      </p>
      {(user.vendor || user.canProducts) && (
        <a className="secondary" href="/admin/submissions">
          Submit or revise individual products
        </a>
      )}
      <p>
        Register supplier details and a catalog feed for review. Feeds are not
        fetched automatically. Approved CSV feeds can be downloaded and reviewed
        through Products → CSV import by a product manager.
      </p>
      <p>
        Use public feed URLs only. Do not enter passwords, API keys or
        confidential dealer terms.
      </p>
      {user.canVendors && (
        <label>
          Integration
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">New vendor integration</option>
            {admin.vendors?.map((v) => (
              <option key={v.identity} value={v.identity}>
                {v.name} · {v.status}
              </option>
            ))}
          </select>
        </label>
      )}
      <form
        className="admin-form"
        key={p?.identity || "new"}
        onSubmit={(e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.target));
          run(async () => {
            await api("admin/vendor", data);
            setAdmin(await api("admin"));
            setNotice(
              "Vendor integration saved. Feed synchronization is not enabled.",
            );
          });
        }}
      >
        {user.canVendors ? (
          <label>
            Vendor account email or wallet
            <input name="identity" required defaultValue={p?.identity || ""} />
          </label>
        ) : (
          <p>Account: {user.identity}</p>
        )}
        <label>
          Vendor name
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={p?.name || ""}
          />
        </label>
        <label>
          Website
          <input
            name="website"
            type="url"
            required
            placeholder="https://supplier.example"
            defaultValue={p?.website || ""}
          />
        </label>
        <label>
          Contact email
          <input
            name="contact_email"
            type="email"
            required
            defaultValue={p?.contact_email || ""}
          />
        </label>
        <label>
          Feed format
          <select name="feed_format" defaultValue={p?.feed_format || "manual"}>
            <option value="manual">Manual</option>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <label>
          Public catalog feed URL
          <input name="feed_url" type="url" defaultValue={p?.feed_url || ""} />
        </label>
        <label>
          Integration notes
          <textarea
            name="notes"
            maxLength={2000}
            defaultValue={p?.notes || ""}
          />
        </label>
        <label>
          Status
          <select
            name="status"
            defaultValue={
              user.vendor
                ? p?.status === "submitted"
                  ? "submitted"
                  : "draft"
                : p?.status || "draft"
            }
          >
            {(user.canVendors
              ? ["draft", "submitted", "approved", "paused"]
              : ["draft", "submitted"]
            ).map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        {user.vendor && p && (
          <p>
            Current review status: {p.status}. Saving changes requires a new
            review.
          </p>
        )}
        <button className="primary" disabled={busy}>
          Save integration
        </button>
      </form>
    </section>
  );
}
