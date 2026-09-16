import { WorkflowRules, SupplierBriefButton } from "./WorkflowTools.jsx";
import { ProductSubmissions } from "./ProductSubmissions.jsx";
import React, { useState, useEffect } from "react";
import { ProductManager } from "./Equipment.jsx";
import { Vendors } from "./Vendors.jsx";
import { Plus, ExternalLink } from "lucide-react";
export function AdminPages({
  navigate = (path) => { location.href = path; },
  error,
  notice,
  user,
  admin,
  products,
  api,
  run,
  setAdmin,
  setNotice,
  refresh,
  busy,
  editOffer,
  setEditOffer,
  open,
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [limit, setLimit] = useState(20);
  const [offerCollection, setOfferCollection] = useState(
    editOffer?.product_id || products[0]?.id || "",
  );
  useEffect(
    () => setOfferCollection(editOffer?.product_id || products[0]?.id || ""),
    [editOffer?.id, products[0]?.id],
  );
  const items = admin?.items || [];
  const matches = (values) =>
    values
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase());
  const quoteList = (admin?.quotes || []).filter(
    (q) =>
      matches([q.identity, q.item_name, q.name, q.referral, q.details]) &&
      (status === "all" || q.status === status),
  );
  const offerList = (admin?.offers || []).filter(
    (o) =>
      matches([o.dealer, o.product_id, o.item_id, o.notes]) &&
      (status === "all" ||
        (status === "private"
          ? o.private
          : status === "active"
            ? o.active
            : !o.active)),
  );

  const page = location.pathname.split("/")[2] || "overview";
  const pages = [
    ["overview", "Overview", true],
    ["products", "Products", user?.canProducts],
    ["offers", "Dealer offers", user?.canDeals],
    ["quotes", "Quotes", user?.canQuotes],
    ["vendors", "Vendors", user?.canVendors || user?.vendor],
    ["submissions", "Product submissions", user?.canProducts || user?.vendor],
    ["team", "Team access", user?.owner],
    ["notifications", "Notifications", user?.owner],
  ];
  if (!user)
    return (
      <section className="equipment-page">
        <h1>Store administration</h1>
        <button onClick={() => open("login")}>Sign in</button>
      </section>
    );
  if (!user.staff)
    return (
      <section className="equipment-page">
        <h1>Staff access required</h1>
      </section>
    );
  const allowed = pages.some(([id, , ok]) => id === page && ok);
  return (
    <section className="equipment-page admin-page" aria-busy={busy || !admin}>
      <header className="admin-heading">
        <div>
          <small>Mercado workspace</small>
          <h1>{pages.find(([id]) => id === page)?.[1] || "Administration"}</h1>
        </div>
        <div>
          <span className="pill">{user.role.replaceAll("_", " ")}</span>
          <p className="identity">{user.identity}</p>
          <a href="/">View marketplace</a>
        </div>
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <label className="admin-mobile-navigation">
        Workspace page
        <select
          value={page}
          onChange={(e) => {
            navigate("/admin/" + e.target.value);
          }}
        >
          {pages
            .filter((p) => p[2])
            .map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
        </select>
      </label>
      <nav aria-label="Administration pages">
        {pages
          .filter((p) => p[2])
          .map(([id, label]) => (
            <a
              className="secondary"
              key={id}
              aria-current={page === id ? "page" : undefined}
              href={"/admin/" + id}
            >
              {label}
            </a>
          ))}
      </nav>
      {["quotes", "offers"].includes(page) && allowed && admin && (
        <div className="admin-toolbar">
          <label>
            Search {page}
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(20);
              }}
              placeholder={
                page === "quotes"
                  ? "Customer, product or referral"
                  : "Dealer, product or notes"
              }
            />
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setLimit(20);
              }}
            >
              <option value="all">All statuses</option>
              {(page === "quotes"
                ? ["new", "reviewing", "quoted", "closed"]
                : ["active", "inactive", "private"]
              ).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <p role="status">
            {page === "quotes" ? quoteList.length : offerList.length} results
          </p>
        </div>
      )}
      {!allowed ? (
        <p role="alert">Your role does not have access to this page.</p>
      ) : !admin ? (
        <p>Loading administration…</p>
      ) : (
        <>
          {page === "overview" && (
            <>
              <h2>Your workspace</h2>
              <p>
                Role: {user.role.replaceAll("_", " ")}. Choose a page above to
                manage the tools assigned to you.
              </p>
              <div className="admin-shortcuts">
                {pages
                  .filter(([id, , ok]) => ok && id !== "overview")
                  .map(([id, label]) => (
                    <a
                      className="admin-shortcut"
                      href={"/admin/" + id}
                      key={id}
                    >
                      <strong>{label}</strong>
                      <span>
                        {id === "quotes"
                          ? `${admin.quotes.filter((q) => q.status === "new").length} new requests`
                          : id === "products"
                            ? `${items.length} products`
                            : id === "offers"
                              ? `${admin.offers.length} offers`
                              : id === "team"
                                ? "Delegate access by responsibility"
                                : "Manage supplier integrations"}
                      </span>
                    </a>
                  ))}
              </div>
            </>
          )}
          <>
            <>
              {page === "products" && user.canProducts && (
                <>
                  {" "}
                  <ProductManager
                    items={admin.items || []}
                    submissions={admin.productSubmissions || []}
                    collections={products}
                    api={api}
                    run={run}
                    refresh={async () => {
                      setAdmin(await api("admin"));
                      await refresh();
                    }}
                    notify={setNotice}
                    busy={busy}
                  />
                </>
              )}
              {page === "vendors" && (user.canVendors || user.vendor) && (
                <Vendors
                  {...{ user, admin, api, run, setAdmin, setNotice, busy }}
                />
              )}
              {page === "submissions" && (user.canProducts || user.vendor) && (
                <ProductSubmissions
                  {...{
                    user,
                    admin,
                    items,
                    products,
                    api,
                    run,
                    setAdmin,
                    setNotice,
                    busy,
                  }}
                />
              )}
              {page === "notifications" && user.owner && (
                <section>
                  <WorkflowRules
                    {...{ admin, api, run, setAdmin, setNotice, busy }}
                  />
                  <h2>Referral email notifications</h2>
                  <p>
                    Send new referred quote submissions to your operations
                    inbox. This includes customer account information and
                    requirements. Referring members and vendors do not receive
                    these details.
                  </p>
                  <form
                    className="admin-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = Object.fromEntries(
                        new FormData(e.currentTarget),
                      );
                      run(async () => {
                        await api("admin/notifications", {
                          recipient: f.recipient,
                          enabled: f.enabled === "on",
                        });
                        setAdmin(await api("admin"));
                        setNotice(
                          "Notification settings saved. No test email was sent.",
                        );
                      });
                    }}
                  >
                    <label className="span2">
                      Operations email
                      <input
                        type="email"
                        name="recipient"
                        defaultValue={
                          admin.notificationSettings?.recipient || ""
                        }
                        autoComplete="email"
                      />
                    </label>
                    <label className="span2 checkbox-label">
                      <input
                        type="checkbox"
                        name="enabled"
                        defaultChecked={
                          admin.notificationSettings?.enabled || false
                        }
                      />{" "}
                      Email future referred quote submissions
                    </label>
                    <p className="span2">
                      Changes apply to future requests. Messages already queued
                      retain their original recipient. Delivery attempts appear
                      on the Quotes page.
                    </p>
                    <button className="primary" disabled={busy}>
                      Save notification settings
                    </button>
                  </form>
                  <h3>Wallet messaging</h3>
                  <p>
                    Account updates are available inside Mercado. External
                    wallet delivery is not active; it requires opt-in, a
                    dedicated sender and a persistent worker.
                  </p>
                </section>
              )}
              {page === "team" && user.owner && (
                <section className="roles">
                  <h3>Team access</h3>
                  <p>
                    Owner and administrator access follows Bittrees governance.
                    Assign a focused local role below. Removing a role takes
                    effect on the next request; governance access remains
                    managed in governance.
                  </p>
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = Object.fromEntries(new FormData(e.target));
                      run(async () => {
                        await api("admin/role", f);
                        e.target.reset();
                        setAdmin(await api("admin"));
                        setNotice("Role updated. No invitation was sent.");
                      });
                    }}
                  >
                    <input
                      name="identity"
                      placeholder="Email or 0x wallet address"
                      aria-label="Team member identity"
                      required
                    />
                    <select name="role" aria-label="Team member role">
                      <option value="support">Support</option>
                      <option value="dealer_manager">
                        Dealer manager — products and offers
                      </option>
                      <option value="catalog_manager">
                        Catalog manager — products only
                      </option>
                      <option value="offer_manager">
                        Offer manager — offers only
                      </option>
                      <option value="vendor_manager">
                        Vendor manager — integrations only
                      </option>
                      <option value="vendor">
                        Vendor — own integration only
                      </option>
                    </select>
                    <button className="secondary">Assign role</button>
                  </form>
                  {admin.roles.map((r) => (
                    <div className="grant" key={r.identity}>
                      <span>
                        {r.identity} · {r.role}
                      </span>
                      <button
                        onClick={() =>
                          run(async () => {
                            await api("admin/role", {
                              identity: r.identity,
                              role: "customer",
                            });
                            setAdmin(await api("admin"));
                          })
                        }
                      >
                        Remove role
                      </button>
                    </div>
                  ))}
                </section>
              )}
              {page === "offers" && user.canDeals && (
                <>
                  <h3>
                    {editOffer ? "Edit dealer offer" : "Add dealer offer"}
                  </h3>
                  <form
                    key={editOffer?.id || "new"}
                    className="admin-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = Object.fromEntries(new FormData(e.target));
                      run(async () => {
                        await api("admin/offer", {
                          ...f,
                          id: editOffer?.id,
                          private: f.visibility === "private",
                        });
                        e.target.reset();
                        setAdmin(await api("admin"));
                        await refresh();
                        setEditOffer(null);
                        setNotice("Dealer offer saved.");
                      });
                    }}
                  >
                    <label>
                      Collection
                      <select
                        name="product"
                        value={offerCollection}
                        onChange={(e) => setOfferCollection(e.target.value)}
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Specific product (optional)
                      <select
                        name="item_id"
                        key={offerCollection}
                        defaultValue={editOffer?.item_id || ""}
                      >
                        <option value="">Entire collection</option>
                        {items
                          .filter((i) => i.product_id === offerCollection)
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Dealer name
                      <input
                        name="dealer"
                        defaultValue={editOffer?.dealer}
                        required
                        maxLength={100}
                      />
                    </label>
                    <label className="span2">
                      Dealer checkout / referral URL
                      <input
                        name="url"
                        defaultValue={editOffer?.url}
                        type="url"
                        placeholder="https://dealer.example/product?ref=…"
                        required
                      />
                    </label>
                    <label>
                      Price (optional)
                      <input
                        name="price"
                        defaultValue={editOffer?.price ?? ""}
                        type="number"
                        min="0"
                        step="0.01"
                      />
                    </label>
                    <label>
                      Currency
                      <select
                        name="currency"
                        defaultValue={editOffer?.currency || "USD"}
                      >
                        {["USD", "EUR", "GBP", "MXN", "CAD", "AUD"].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Visibility
                      <select
                        name="visibility"
                        defaultValue={
                          editOffer?.private === false ? "public" : "private"
                        }
                      >
                        <option value="private">
                          Private — invited accounts only
                        </option>
                        <option value="public">Public — everyone</option>
                      </select>
                    </label>
                    <label>
                      Expiry (optional)
                      <input
                        name="expires"
                        type="datetime-local"
                        defaultValue={
                          editOffer?.expires_at
                            ? new Date(
                                new Date(editOffer.expires_at).getTime() -
                                  new Date().getTimezoneOffset() * 60000,
                              )
                                .toISOString()
                                .slice(0, 16)
                            : ""
                        }
                      />
                    </label>
                    <label className="span2">
                      Internal deal terms / notes
                      <textarea
                        name="notes"
                        defaultValue={editOffer?.notes}
                        maxLength={3000}
                        placeholder="Commission, dealer contact and negotiated terms. Administrator only."
                      />
                    </label>
                    <button disabled={busy} className="primary">
                      Save offer <Plus size={18} />
                    </button>
                    {editOffer && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setEditOffer(null)}
                      >
                        Cancel edit
                      </button>
                    )}
                  </form>
                  <h3>Dealer offers</h3>
                  {admin.offers.length === 0 && (
                    <p>No dealer offers entered yet.</p>
                  )}
                  {offerList.slice(0, limit).map((o) => (
                    <div className="record" key={o.id}>
                      <strong>{o.dealer}</strong>
                      <span className="pill">
                        {o.private ? "Private" : "Public"} ·{" "}
                        {o.active ? "Active" : "Inactive"}
                      </span>
                      <p>
                        {o.product_id} ·{" "}
                        {o.price
                          ? `${o.currency} ${o.price}`
                          : "Price on request"}
                      </p>
                      <a href={o.url} target="_blank" rel="noreferrer">
                        Review dealer link <ExternalLink size={13} />
                      </a>
                      <p>{o.notes}</p>
                      <button
                        disabled={busy}
                        className="secondary"
                        onClick={() => {
                          setEditOffer(o);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Edit offer
                      </button>
                      <button
                        disabled={busy}
                        className="secondary"
                        onClick={() =>
                          run(async () => {
                            await api("admin/offer-state", {
                              id: o.id,
                              active: !o.active,
                            });
                            setAdmin(await api("admin"));
                            await refresh();
                          })
                        }
                      >
                        {o.active ? "Deactivate" : "Activate"}
                      </button>
                      {o.private && (
                        <>
                          <h4>Private access</h4>
                          {o.recipients.map((i) => (
                            <div className="grant" key={i}>
                              <span>{i}</span>
                              <button
                                onClick={() =>
                                  run(async () => {
                                    await api("admin/grant", {
                                      id: o.id,
                                      identity: i,
                                      remove: true,
                                    });
                                    setAdmin(await api("admin"));
                                    await refresh();
                                  })
                                }
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          <form
                            className="inline-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const identity = new FormData(e.target).get(
                                "identity",
                              );
                              run(async () => {
                                await api("admin/grant", {
                                  id: o.id,
                                  identity,
                                  remove: false,
                                });
                                e.target.reset();
                                setAdmin(await api("admin"));
                                setNotice(
                                  "Access granted. No invitation email was sent.",
                                );
                              });
                            }}
                          >
                            <input
                              name="identity"
                              aria-label="Recipient email or wallet"
                              placeholder="Recipient email or 0x wallet"
                              required
                            />
                            <button className="secondary">Grant access</button>
                          </form>
                        </>
                      )}
                    </div>
                  ))}
                </>
              )}
              {page === "quotes" && user.canQuotes && (
                <>
                  <h3>Quote requests</h3>
                  {admin.quotes.length === 0 && <p>No quote requests yet.</p>}
                  {quoteList.slice(0, limit).map((q) => (
                    <div className="record" key={q.id}>
                      <strong>
                        {q.item_name || q.name} × {q.quantity}
                      </strong>
                      <p className="identity">{q.identity}</p>
                      <p>{q.details}</p>
                      <SupplierBriefButton quote={q} {...{ api, run }} />
                      <small>
                        Brief excludes customer identity, free-text
                        requirements, referral details and private terms. Review
                        before sharing.
                      </small>
                      {q.offer_snapshot && (
                        <p>
                          Private offer reference: {q.offer_snapshot.dealer} ·{" "}
                          {q.offer_snapshot.currency}{" "}
                          {q.offer_snapshot.price ?? "Price on request"}
                        </p>
                      )}
                      {q.proposal && (
                        <p>
                          Quote version {q.proposal.version} ·{" "}
                          {new Intl.NumberFormat("en", {
                            style: "currency",
                            currency: q.proposal.currency,
                          }).format(Number(q.proposal.total_minor) / 100)}{" "}
                          ·{" "}
                          {q.proposal.accepted_at
                            ? "Accepted by customer"
                            : "Awaiting customer acceptance"}
                        </p>
                      )}
                      {!q.proposal?.accepted_at && q.status !== "closed" && (
                        <details className="admin-editor">
                          <summary>
                            {q.proposal ? "Revise quote" : "Prepare a quote"}
                          </summary>
                          <form
                            className="admin-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = Object.fromEntries(
                                new FormData(e.currentTarget),
                              );
                              run(async () => {
                                await api("admin/proposal", {
                                  ...f,
                                  expires_at: new Date(
                                    f.expires_at,
                                  ).toISOString(),
                                  id: q.id,
                                });
                                setAdmin(await api("admin"));
                                setNotice(
                                  "Quote issued. The customer can review and accept it in Mercado.",
                                );
                              });
                            }}
                          >
                            <label>
                              Unit price
                              <input
                                name="unit_price"
                                type="number"
                                min="0"
                                step="0.01"
                                required
                              />
                            </label>
                            <label>
                              Currency
                              <select name="currency">
                                {["USD", "EUR", "GBP", "MXN", "CAD", "AUD"].map(
                                  (c) => (
                                    <option key={c}>{c}</option>
                                  ),
                                )}
                              </select>
                            </label>
                            <label>
                              Tax total
                              <input
                                name="tax"
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue="0"
                                required
                              />
                            </label>
                            <label>
                              Delivery total
                              <input
                                name="shipping"
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue="0"
                                required
                              />
                            </label>
                            <label>
                              Valid until
                              <input
                                name="expires_at"
                                type="datetime-local"
                                required
                              />
                            </label>
                            <label className="span2">
                              Delivery and purchase terms
                              <textarea
                                name="terms"
                                minLength={10}
                                maxLength={3000}
                                required
                                placeholder="Destination, lead time, condition, warranty and purchase terms"
                              />
                            </label>
                            <p className="span2">
                              Total is calculated from unit price × {q.quantity}
                              , tax and delivery. No payment is collected when
                              the customer accepts.
                            </p>
                            <button className="primary" disabled={busy}>
                              Issue quote
                            </button>
                          </form>
                        </details>
                      )}

                      {q.notification_status && (
                        <p>
                          Referral email:{" "}
                          {q.notification_status === "accepted"
                            ? "Accepted by email provider"
                            : q.notification_status.replaceAll("_", " ")}
                        </p>
                      )}
                      {q.notification_status === "pending" && (
                        <button
                          className="secondary"
                          onClick={() =>
                            run(async () => {
                              await api("admin/notification-retry", {
                                id: q.id,
                              });
                              setAdmin(await api("admin"));
                            })
                          }
                        >
                          Retry referral email
                        </button>
                      )}
                      {q.notification_status === "needs_review" && (
                        <small>
                          Check the email provider delivery log before any
                          manual resend.
                        </small>
                      )}

                      <small>
                        Referral: {q.referral || "Direct"} ·{" "}
                        {new Date(q.created_at).toLocaleString()}
                      </small>
                      <label>
                        Status
                        <select
                          value={q.status}
                          onChange={(e) =>
                            run(async () => {
                              await api("admin/quote", {
                                id: q.id,
                                status: e.target.value,
                              });
                              setAdmin(await api("admin"));
                            })
                          }
                        >
                          {["new", "reviewing", "quoted", "closed"].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
                </>
              )}
            </>
          </>
        </>
      )}
      {allowed &&
        (page === "quotes"
          ? quoteList.length
          : page === "offers"
            ? offerList.length
            : 0) > limit && (
          <button className="secondary" onClick={() => setLimit((n) => n + 20)}>
            Show 20 more
          </button>
        )}
    </section>
  );
}
