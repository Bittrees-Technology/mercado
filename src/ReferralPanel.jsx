import React, { useState } from "react";
import { Copy } from "lucide-react";

export function ReferralPanel({ user, products, items, busy, share, signIn, copyCode, renew }) {
  const [customCode, setCustomCode] = useState("");
  const [collection, setCollection] = useState("");
  const [search, setSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const matches = items.filter((item) =>
    (!collection || item.product_id === collection) &&
    `${item.name} ${item.source_name || ""}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  return <div className="referral-panel">
    <div className="eyebrow">REFERRALS</div>
    <h2>Share Mercado</h2>
    <p>One code for every product. Customers can use your link or enter your code when requesting a quote.</p>
    {user ? <>
      <button className="primary referral-share" disabled={busy} onClick={() => share()}>
        <Copy size={16} /> Copy store link
      </button>
      <label htmlFor="member-referral">Your referral code</label>
      <div className="referral-code-row">
        <input id="member-referral" aria-label="Your member referral code" readOnly value={user.referral} />
        <button className="secondary" disabled={busy} onClick={copyCode} aria-label="Copy referral code">Copy</button>
      </div>
      <details className="referral-options">
        <summary>Link to a product or collection</summary>
        <label>Product collection
          <select value={collection} onChange={(e) => { setCollection(e.target.value); setItemId(""); }}>
            <option value="">All collections</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {collection && <button className="secondary" disabled={busy} onClick={() => share(collection)}>Copy collection link</button>}
        <label>Search products
          <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setItemId(""); }} placeholder="Product name or vendor" />
        </label>
        <label>Individual product
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} disabled={!matches.length}>
            <option value="">{matches.length ? "Choose a product" : "No matching products"}</option>
            {matches.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.source_name}</option>)}
          </select>
        </label>
        {!matches.length && <p role="status">Try another search or choose all collections.</p>}
        <button className="secondary" disabled={!itemId || busy} onClick={() => {
          const item = matches.find((p) => p.id === itemId);
          if (item) share(item.product_id, item.id);
        }}>Copy product link</button>
      </details>
      <details className="referral-options">
        <summary>Choose a custom code</summary>
        <form onSubmit={(e) => { e.preventDefault(); renew(customCode); }}>
          <label>Custom referral code
            <input value={customCode} onChange={(e) => setCustomCode(e.target.value.toLowerCase())}
              placeholder="e.g. mining-with-joao" required minLength={4} maxLength={32}
              pattern="[a-zA-Z0-9][a-zA-Z0-9\-]{2,30}[a-zA-Z0-9]" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </label>
          <p>4–32 letters, numbers or hyphens. Available codes activate immediately after validation; no staff approval is required.</p>
          <button className="primary" disabled={busy} type="submit">Save custom code</button>
        </form>
        <p>Previous codes and links will still work and remain attributed to you.</p>
        <button className="secondary" disabled={busy} onClick={() => renew()}>Generate a code instead</button>
      </details>
    </> : <button className="primary" onClick={signIn}>Sign in to get your link</button>}
    <small>Links track referrals. Commissions and payouts require a separate agreement.</small>
  </div>;
}
