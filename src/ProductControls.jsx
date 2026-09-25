import React, { useEffect, useState } from 'react';

export function VisibilityAction({ items, active, api, refresh = async () => {}, onChanged = () => {}, onUndoAvailable, label }) {
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState(null);
  const [message, setMessage] = useState('');
  async function apply(targets, next, restoring = false) {
    setBusy(true);
    try {
      await api('admin/item-visibility', { items: targets.map(p => ({ id: p.id, active: p.active })), active: next });
      const recovery = restoring ? null : { items: targets.map(p => ({ ...p, active: next })), active: !next };
      setUndo(recovery);
      onUndoAvailable?.(recovery);
      setMessage(restoring ? 'Visibility restored.' : `${targets.length === 1 ? 'Product' : targets.length + ' products'} ${next ? 'published' : 'unpublished'}.`);
      onChanged(next);
      await refresh();
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  return <div className="visibility-action">
    <button className="secondary" disabled={busy || !items.length} onClick={() => apply(items, active)}>{label || (active ? 'Publish' : 'Unpublish')}</button>
    {message && <span role="status">{message}</span>}
    {undo && <button disabled={busy} onClick={() => apply(undo.items, undo.active, true)}>Undo</button>}
  </div>;
}

export function ProductHistory({ id, api, version }) {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('');
  useEffect(() => {
    let current = true;
    setEvents([]); setStatus('Loading history…');
    api('admin/item-history?id=' + encodeURIComponent(id)).then(r => {
      if (current) { setEvents(r.events); setStatus(r.events.length ? '' : 'No recorded changes.'); }
    }).catch(e => { if (current) setStatus(e.message); });
    return () => { current = false; };
  }, [id, version]);
  return <details className="product-history"><summary>Change history</summary>
    {status && <p role="status">{status}</p>}
    <ul>{events.map((event, i) => <li key={i}><strong>{{save_product:'Product details saved',publish_product:'Published',unpublish_product:'Unpublished',delete_product:'Deleted'}[event.action]}</strong> · {new Date(event.created_at).toLocaleString()}<br/><span>{event.actor}</span></li>)}</ul>
  </details>;
}

export function ProductTable({ items, collections, choose, api, refresh, onDeleted = () => {} }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState([]);
  const [recovery, setRecovery] = useState(null);
  const [deleting,setDeleting] = useState(null);
  const [deletingBusy,setDeletingBusy] = useState(false);
  const [deleteMessage,setDeleteMessage] = useState("");
  const filtered = items.filter(p => (status === 'all' || p.active === (status === 'published')) && [p.name,p.id,p.source_name].join(' ').toLowerCase().includes(query.toLowerCase()));
  const shown = filtered.slice(0, limit);
  const chosen = filtered.filter(p => selected.includes(p.id) && p.active);
  function reset() { setLimit(25); setSelected([]); }
  return <section aria-label="Manage product listings">
    {deleteMessage && <p role="status">{deleteMessage}</p>}
    {deleting && <div className="delete-product-confirm" role="group" aria-label="Confirm product removal"><h3>Delete {deleting.name}?</h3><p>This removes the listing from your catalog and the marketplace. Existing quote and activity records are retained. To keep it available for editing, choose Hide instead.</p><button className="secondary" disabled={deletingBusy} onClick={()=>setDeleting(null)}>Cancel</button><button className="primary" disabled={deletingBusy} onClick={async()=>{setDeletingBusy(true);try{await api('admin/item-delete',{id:deleting.id,expected_updated_at:deleting.edit_version || deleting.updated_at});onDeleted(deleting.id);setDeleting(null);setDeleteMessage('Product deleted.');await refresh();}catch(e){setDeleteMessage(e.message);}finally{setDeletingBusy(false);}}}>Delete product</button></div>}

    <div className="admin-toolbar">
      <label>Search products<input type="search" value={query} placeholder="Name, ID or vendor" onChange={e => {setQuery(e.target.value); reset();}} /></label>
      <label>Status<select value={status} onChange={e => {setStatus(e.target.value); reset();}}><option value="all">All products</option><option value="published">Published</option><option value="hidden">Hidden</option></select></label>
    </div>
    <VisibilityAction items={chosen.slice(0,100)} active={false} api={api} refresh={refresh} onChanged={() => setSelected([])} label={`Unpublish selected (${Math.min(chosen.length,100)})`} />
    {recovery && <div role="status">Product visibility updated. <VisibilityAction key={JSON.stringify(recovery)} items={recovery.items} active={recovery.active} api={api} refresh={refresh} onChanged={() => setRecovery(null)} label="Undo last change" /></div>}
    <div className="product-table-scroll"><table className="product-table"><thead><tr><th><input aria-label="Select published products on this page" type="checkbox" checked={shown.some(p=>p.active) && shown.filter(p=>p.active).every(p=>selected.includes(p.id))} onChange={e=>setSelected(e.target.checked ? shown.filter(p=>p.active).map(p=>p.id) : [])}/></th><th>Product</th><th>Vendor</th><th>Collection</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{shown.map(p => <tr key={p.id}><td><input type="checkbox" aria-label={'Select '+p.name} disabled={!p.active} checked={selected.includes(p.id)} onChange={e=>setSelected(ids=>e.target.checked ? [...ids,p.id] : ids.filter(id=>id!==p.id))}/></td><td>{p.name}</td><td>{p.source_name}</td><td>{collections.find(c=>c.id===p.product_id)?.name}</td><td>{p.active ? 'Published' : 'Hidden'}</td><td><div className="product-row-actions"><button onClick={()=>choose(p)}>Edit</button><a href={'/equipment/'+p.product_id+'/'+p.id+(p.active?'':'?preview=1')}>Preview</a><VisibilityAction items={[p]} active={!p.active} api={api} refresh={refresh} onUndoAvailable={setRecovery}/><button onClick={()=>setDeleting(p)}>Delete</button></div></td></tr>)}</tbody>
    </table></div>
    {!filtered.length && <p>No products match these filters.</p>}
    <p>Showing {shown.length} of {filtered.length} products</p>
    {filtered.length > limit && <button className="secondary" onClick={()=>setLimit(n=>n+25)}>Show more</button>}
  </section>;
}
