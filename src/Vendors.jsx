import React, { useState } from "react";
export function Vendors({ user, admin, api, run, setAdmin, setNotice, busy }) {
  const [selected, setSelected] = useState("");
  const p = user.canVendors ? admin.vendors?.find(v => v.identity === selected) : admin.vendors?.[0];
  const approved = p?.status === 'approved';
  return <section className="vendor-onboarding">
    <h2>{user.canVendors ? 'Vendor accounts' : 'Your business'}</h2>
    <p>{user.canVendors ? 'Review business details and approve vendors for direct management of their own products.' : 'Complete your business details once. After approval, add, publish, edit and remove your own products without individual reviews.'}</p>
    {user.canVendors && <label>Vendor account<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">New vendor</option>{admin.vendors?.map(v => <option key={v.identity} value={v.identity}>{v.name} · {v.status}</option>)}</select></label>}
    {p && <p role="status"><strong>{({draft:'Draft',submitted:'Awaiting approval',approved:'Approved',paused:'Paused'})[p.status]}</strong>{p.status === 'submitted' ? ' — Your business is ready for staff review.' : p.status === 'paused' ? ' — Direct product changes are unavailable. Contact the Mercado team.' : approved ? ' — Direct product management is enabled for the vendor account.' : ' — Complete your details and request approval.'}</p>}
    {user.vendorApproved && <a className="primary" href="/admin/products">Manage my products</a>}
    <form className="admin-form" key={p?.identity || 'new'} onSubmit={e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.currentTarget));
      if (!user.canVendors) data.status = e.nativeEvent.submitter?.value === 'submitted' ? 'submitted' : 'draft';
      run(async () => {
        await api('admin/vendor', data);
        if(user.canVendors) setSelected(data.identity);
        setAdmin(await api('admin'));
        setNotice(data.status === 'submitted' && !approved ? 'Business details submitted for approval.' : 'Business details saved.');
      });
    }}>
      {user.canVendors ? <label>Account email or wallet<input name="identity" required defaultValue={p?.identity || ''} readOnly={Boolean(p)} /><small>Use the account with the Vendor role. Approval does not grant a role to a different account.</small></label> : <p className="span2">Signed in as {user.identity}</p>}
      <label>Business name<input name="name" required maxLength={160} defaultValue={p?.name || ''}/></label>
      <label>Website<input name="website" type="url" required defaultValue={p?.website || ''} placeholder="https://"/></label>
      <label>Contact email<input name="contact_email" type="email" required defaultValue={p?.contact_email || ''}/></label>
      <label className="span2">Business notes<textarea name="notes" maxLength={2000} defaultValue={p?.notes || ''} placeholder="Products you supply, dispatch locations and support details"/></label>
      <details className="span2"><summary>Optional catalog feed</summary><p>Manual product management is available after approval. Feeds are references for staff; they do not automatically import products. Use public URLs without passwords or API keys.</p>
        <label>Feed format<select name="feed_format" defaultValue={p?.feed_format || 'manual'}><option value="manual">No feed</option><option value="csv">CSV</option><option value="json">JSON</option></select></label>
        <label>Public feed URL<input name="feed_url" type="url" defaultValue={p?.feed_url || ''}/></label>
      </details>
      {user.canVendors && <label>Account status<select name="status" defaultValue={p?.status || 'draft'}>{['draft','submitted','approved','paused'].map(v => <option key={v}>{v}</option>)}</select></label>}
      <div className="span2 product-row-actions"><button className="primary" disabled={busy} type="submit" value={user.canVendors || approved || p?.status === 'paused' ? 'save' : 'submitted'}>{user.canVendors || approved || p?.status === 'paused' ? 'Save business details' : 'Request vendor approval'}</button>{!user.canVendors && !approved && p?.status !== 'paused' && <button className="secondary" disabled={busy} type="submit" value="draft">Save draft</button>}</div>
      {approved && <small className="span2">Updating business details preserves approval. A vendor manager can pause access.</small>}
    </form>
  </section>;
}
