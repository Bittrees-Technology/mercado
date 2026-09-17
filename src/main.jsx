import {ProfileImage} from "./ImageUpload.jsx";
import { useAppearance } from "./useAppearance.jsx";
import { useAccountNavigation } from "./useAccountNavigation.jsx";
import { ReferralPanel } from "./ReferralPanel.jsx";
import { NotificationPage } from "./NotificationPage.jsx";
import { WalletPicker } from "./WalletPicker.jsx";
import { signWalletMessage, walletError } from "../lib/wallets.mjs";
import { AdminPages } from "./AdminPages.jsx";
import { EquipmentPage, ProductManager, equipmentLink } from "./Equipment.jsx";
import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  User,
  Plus,
  Minus,
  X,
  Copy,
  Check,
  ShieldCheck,
  Wallet,
  Cpu,
  Server,
  Zap,
  SlidersHorizontal,
  LogOut,
  Lock,
  ExternalLink,
  Package,
  Mail,
  Sun,
  Moon,
} from "lucide-react";
import { createSiweMessage } from "viem/siwe";
import "./style.css";
async function api(path, body) {
  const r = await fetch(
    "/api/" + path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const d = await r.json();
  if (!r.ok) throw Object.assign(Error(d.error || "Please try again"), { status: r.status });
  return d;
}
const categories = [
  "All equipment",
  "Mining",
  "AI & compute",
  "Servers",
  "Accessories",
];
const icons = {
  Mining: Cpu,
  "AI & compute": Zap,
  Servers: Server,
  Accessories: Package,
};
function Hardware({ kind = "bitaxe", large = false }) {
  return (
    <div
      aria-hidden="true"
      className={"hardware " + kind + (large ? " large" : "")}
    >
      <div className="board">
        {kind === "bitaxe" || kind === "asic" ? (
          <>
            <div className="pins" />
            <div className="fan">
              <i />
              <i />
              <i />
              <i />
              <i />
              <span />
            </div>
            <div className="screen">
              <b>₿</b>
              <small>BITAXE</small>
            </div>
            <div className="chips">
              <i />
              <i />
              <i />
            </div>
          </>
        ) : kind === "servers" ? (
          <>
            {[1, 2, 3].map((i) => (
              <div className="rack" key={i}>
                <b />
                <b />
                <span />
                <i />
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="chip">
              <Cpu size={large ? 100 : 65} strokeWidth={1} />
            </div>
            <div className="pins" />
          </>
        )}
      </div>
    </div>
  );
}
function App() {
  const { route, navigate } = useAccountNavigation();
  const initialRoute = useRef(true);
  const accountRequest = useRef(0);
  const [accountLoading, setAccountLoading] = useState(true);
  const quoteAttempt = useRef(null);
  const [signingProvider, setSigningProvider] = useState(null);
  const [products, setProducts] = useState([]),
    [offers, setOffers] = useState([]),
    [items, setItems] = useState([]),
    [pendingQuote, setPendingQuote] = useState(null),
    [user, setUser] = useState(null),
    [quotes, setQuotes] = useState([]),
    [category, setCategory] = useState("All equipment"),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [admin, setAdmin] = useState(null),
    [editOffer, setEditOffer] = useState(null),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [challenge, setChallenge] = useState("");
  const {theme,changeTheme,saving:themeSaving,themeError} = useAppearance(user,setUser,api);
  const initial = new URL(location.href);
  const [referral, setReferral] = useState(() => {
    if (initial.searchParams.has("ref"))
      return initial.searchParams.get("ref") || "";
    try {
      return sessionStorage.getItem("mercado-referral") || "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      if (referral) sessionStorage.setItem("mercado-referral", referral);
      else sessionStorage.removeItem("mercado-referral");
    } catch {
      /* Storage may be disabled. The current page still works. */
    }
  }, [referral]);
  const [selected, setSelected] = useState(
    initial.searchParams.get("product") || "",
  );
  async function loadAccount() {
    const request = ++accountRequest.current;
    setAccountLoading(true);
    try {
      if (location.pathname.startsWith("/admin")) {
        try {
          const data = await api("admin");
          if (request !== accountRequest.current) return;
          setUser(data.user); setAdmin(data);
          if (modal === "account") {
            const account = await api("me");
            if (request === accountRequest.current) setQuotes(account.quotes);
          }
          return;
        } catch (e) { if (e.status !== 403) throw e; }
      }
      const m = await api("me");
      if (request !== accountRequest.current) return;
      setUser(m.user); setQuotes(m.quotes);
    } catch (e) {
      if (request !== accountRequest.current) return;
      setAdmin(null);
      if (e.status === 401) { setUser(null); setQuotes([]); }
      else setError(e.message);
    } finally {
      if (request === accountRequest.current) setAccountLoading(false);
    }
  }
  async function refresh() {
    await Promise.all([
      api("catalog").then((c) => {
        setProducts(c.products); setOffers(c.offers); setItems(c.items || []);
      }).finally(() => setLoading(false)),
      loadAccount(),
    ]);
  }
  useEffect(() => {
    if (initialRoute.current) { initialRoute.current = false; return; }
    setAdmin(null); setModal(null); setError(""); setNotice("");
    loadAccount();
    return () => { accountRequest.current++; };
  }, [route]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function key(e) {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = [
          ...document.querySelectorAll(
            ".modal button,.modal a,.modal input,.modal textarea,.modal select",
          ),
        ].filter((n) => !n.disabled && n.offsetParent !== null);
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [modal]);
  useEffect(() => {
    refresh().catch((e) => {
      setError(e.message);
      setLoading(false);
    });
  }, []);
  async function run(fn) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(walletError(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!signingProvider?.on || !user?.identity.startsWith("0x")) return;
    const identity = user.identity.toLowerCase();
    const changed = (accounts) => {
      if (!accounts?.some((a) => a.toLowerCase() === identity)) {
        accountRequest.current++;
        setAccountLoading(false);
        setUser(null);
        setAdmin(null);
        setQuotes([]);
        setSigningProvider(null);
        api("auth/logout", {})
          .then(() =>
            setNotice(
              "Wallet account changed. Sign in with the account you want to use.",
            ),
          )
          .catch(() =>
            setError(
              "Wallet changed while offline. Reconnect and sign in again before continuing.",
            ),
          );
      }
    };
    const disconnected = () => changed([]);
    signingProvider.on("accountsChanged", changed);
    signingProvider.on("disconnect", disconnected);
    return () => {
      signingProvider.removeListener?.("accountsChanged", changed);
      signingProvider.removeListener?.("disconnect", disconnected);
    };
  }, [signingProvider, user?.identity]);
  async function openAdmin() {
    navigate("/admin");
  }
  function close() {
    setModal(null);
    setError("");
    setNotice("");
  }
  function open(value) {
    if (value === "account" && user) {
      const identity = user.identity, request = accountRequest.current;
      api("me").then((m) => {
        if (request === accountRequest.current && m.user?.identity === identity) { setUser(m.user); setQuotes(m.quotes); }
      }).catch((e) => setError(e.message));
    }
    if (value?.type === "quote") quoteAttempt.current = null;
    setModal(value);
    setError("");
    setNotice("");
  }
  async function share(product = "", item = "") {
    await run(async () => {
      if (!user) {
        open("login");
        setNotice("Sign in to create your referral links.");
        return;
      }
      const url = new URL("https://mercado.bittrees.org");
      url.searchParams.set("ref", user.referral);
      if (product)
        url.pathname = "/equipment/" + product + (item ? "/" + item : "");
      await navigator.clipboard.writeText(url.href);
      setNotice("Referral link copied.");
    });
  }
  async function wallet(provider) {
    await run(async () => {
      const [address] = await provider.request({
        method: "eth_requestAccounts",
      });
      if (!address) throw Error("No wallet account selected.");
      const n = await api("auth/nonce", {});
      const message = createSiweMessage({
        address,
        chainId: 1,
        domain: n.domain,
        uri: n.uri,
        version: "1",
        nonce: n.nonce,
        statement: "Sign in to Mercado by Bittrees.",
        issuedAt: new Date(),
      });
      const signature = await signWalletMessage(provider, address, message);
      await api("auth/wallet", { message, signature });
      setSigningProvider(provider);
      await refresh();
      close();
    });
  }
  async function linkWallet(provider) {
    await run(async () => {
      const [address] = await provider.request({
        method: "eth_requestAccounts",
      });
      if (!address) throw Error("No wallet account selected.");
      const n = await api("auth/link-nonce", {});
      const message = createSiweMessage({
        address,
        chainId: 1,
        domain: n.domain,
        uri: n.uri,
        version: "1",
        nonce: n.nonce,
        statement: n.statement,
        issuedAt: new Date(),
      });
      const signature = await signWalletMessage(provider, address, message);
      await api("auth/link-wallet", { message, signature });
      await refresh();
      setNotice(
        "Wallet linked. Governance access is checked on every request.",
      );
    });
  }
  const isEquipment = location.pathname !== "/";
  function quoteOffer(o) {
    requestQuote(
      products.find((p) => p.id === o.product_id),
      items.find((i) => i.id === o.item_id),
      1,
      o,
    );
  }
  function requestQuote(domain, item, quantity = 1, offer = null) {
    quoteAttempt.current = null;
    const quote = {
      type: "quote",
      product: domain,
      item: item || null,
      quantity,
      offer,
    };
    if (!user) {
      setPendingQuote(quote);
      open("login");
      setNotice("Sign in to submit and track your quote.");
    } else open(quote);
  }
  useEffect(() => {
    if (user && pendingQuote) {
      setModal(pendingQuote);
      setPendingQuote(null);
    }
  }, [user, pendingQuote]);
  useEffect(() => {
    if (!isEquipment) return;
    const parts = location.pathname.split("/");
    const domain = products.find((p) => p.id === parts[2]);
    const item = items.find((p) => p.id === parts[3]);
    if (domain) {
      document.title = (item?.name || domain.name) + " | Mercado";
      document
        .querySelector('link[rel="canonical"]')
        ?.setAttribute(
          "href",
          "https://mercado.bittrees.org" + location.pathname,
        );
    }
  }, [items, products]);
  const featured = products.find((p) => p.id === "bitaxe");
  const shown = products.filter(
    (p) =>
      (category === "All equipment" || p.category === category) &&
      (p.name + " " + p.description)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="topline">
        <span>A BITTREES TECHNOLOGY MARKETPLACE</span>
        <a href={isEquipment ? "/#catalog" : "#catalog"}>
          US, Mexico & European sourcing <ArrowUpRight size={13} />
        </a>
      </div>
      <header>
        <a className="brand" href="/" aria-label="Mercado home">
          <span className="brandmark">m</span>mercado
        </a>
        <nav>
          <a href={isEquipment ? "/#catalog" : "#catalog"}>Equipment</a>
          <button onClick={() => open("referrals")}>Referrals</button>
          <button onClick={() => open("deals")}>
            Private deals <Lock size={12} />
          </button>
        </nav>
        <div className="header-account-actions">
        <button className="theme-toggle" disabled={themeSaving} onClick={() => changeTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
          {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button
          className="account"
          onClick={() => open(user ? "account" : "login")}
        >
          {user?.avatar_url ? <img className="account-avatar" src={user.avatar_url} alt="" /> : <User size={17} />}
          <span>{user ? "My account" : "Sign in"}</span>
        </button>
      </div>
      </header>
      {themeError && <p className="appearance-error" role="alert">{themeError}</p>}
      <main>
        {accountLoading && !user && (location.pathname.startsWith("/admin") || location.pathname.startsWith("/account/notifications")) ? (
          <section className="equipment-page" role="status">Loading your workspace…</section>
        ) : location.pathname.startsWith("/account/notifications") ? (
          <NotificationPage user={user} api={api} open={open} />
        ) : location.pathname.startsWith("/admin") ? (
          <AdminPages key={route}
            {...{
              navigate,
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
            }}
          />
        ) : !isEquipment ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <i /> MINING · AI · NETWORKING
                </div>
                <h1>
                  Hardware for
                  <br />
                  <em>mining & compute.</em>
                </h1>
                <p>
                  Compare real products and supplier prices. Request a quote
                  coordinated through our Nevada and Portugal hubs.
                </p>
                <a
                  className="primary"
                  href={isEquipment ? "/#catalog" : "#catalog"}
                >
                  Explore equipment <ArrowUpRight size={18} />
                </a>
                <div className="hero-caption">
                  <span>01 / MINING & COMPUTE</span>
                  <span>BY BITTREES ↗</span>
                </div>
              </div>
              <div className="hero-art">
                <div className="art-top">
                  <span>
                    BITAXE HARDWARE.
                    <br />
                    OPEN-SOURCE DESIGN.
                  </span>
                  <span className="pill">BITAXE COLLECTION</span>
                </div>
                <Hardware large />
                <div className="art-bottom">
                  <div>
                    <span className="tiny">OPEN-SOURCE MINING</span>
                    <h2>Meet Bitaxe.</h2>
                    <p>Your own piece of the Bitcoin network.</p>
                  </div>
                  <button
                    className="circle"
                    aria-label="Explore Bitaxe"
                    onClick={() => {
                      location.href = equipmentLink("bitaxe", referral);
                    }}
                  >
                    <ArrowUpRight />
                  </button>
                </div>
                <span className="illustration-note">
                  Hardware illustration · model varies by offer
                </span>
              </div>
            </section>
            <div className="value-strip">
              <span>
                <Cpu size={17} /> Mining to AI compute
              </span>
              <span>
                <ShieldCheck size={17} /> Dealer offers, clearly disclosed
              </span>
              <span>
                <Lock size={17} /> Private deals by invitation
              </span>
              <button onClick={() => open("referrals")}>
                <ArrowUpRight size={17} /> Share what you find
              </button>
            </div>
            <section id="catalog" className="catalog">
              <div className="section-top">
                <div>
                  <div className="eyebrow">EQUIPMENT COLLECTIONS</div>
                  <h2>Explore equipment.</h2>
                </div>
                <label className="search">
                  <Search size={18} />
                  <input
                    aria-label="Search equipment"
                    placeholder="Find a collection"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="category-row">
                <div className="categories">
                  {categories.map((c) => (
                    <button
                      key={c}
                      className={category === c ? "active" : ""}
                      onClick={() => {
                        setCategory(c);
                        setSelected("");
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <span className="count">{shown.length} collections</span>
              </div>
              {error && !modal && (
                <p role="alert" className="error">
                  {error} <button onClick={() => run(refresh)}>Retry</button>
                </p>
              )}
              {notice && !modal && (
                <p role="status" className="notice">
                  {notice}
                </p>
              )}
              {loading ? (
                <p>Loading equipment…</p>
              ) : shown.length === 0 ? (
                <div className="empty">
                  No matching equipment. Try another search.
                </div>
              ) : (
                <div className="product-grid">
                  {shown.map((p, i) => {
                    const Icon = icons[p.category];
                    const matching = offers.filter(
                      (o) => o.product_id === p.id,
                    );
                    return (
                      <article
                        key={p.id}
                        className={
                          "product " + (selected === p.id ? "selected" : "")
                        }
                      >
                        <button
                          className={"product-art tint-" + i}
                          onClick={() => {
                            setSelected(p.id);
                            location.href = equipmentLink(p.id, referral);
                          }}
                          aria-label={"View " + p.name}
                        >
                          <span className="product-tag">
                            {p.id === "bitaxe"
                              ? "START HERE"
                              : p.category.toUpperCase()}
                          </span>
                          <Hardware kind={p.id} />
                          <span className="art-arrow">
                            <ArrowUpRight size={20} />
                          </span>
                        </button>
                        <div className="product-info">
                          <div className="product-title">
                            <h3>
                              <a href={equipmentLink(p.id, referral)}>
                                {p.name}
                              </a>
                            </h3>
                            <button
                              className="icon"
                              title="Copy product referral link"
                              aria-label={"Share " + p.name}
                              onClick={() => share(p.id)}
                            >
                              <Copy size={16} />
                            </button>
                          </div>
                          <p>{p.description}</p>
                          <div className="product-bottom">
                            <span>
                              {
                                items.filter((i) => i.product_id === p.id)
                                  .length
                              }{" "}
                              products
                            </span>
                            <button
                              onClick={() => {
                                location.href = equipmentLink(p.id, referral);
                              }}
                            >
                              View products <ArrowRight size={15} />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="referral-banner">
              <div className="referral-art">↗</div>
              <div>
                <div className="eyebrow">REFERRALS</div>
                <h2>
                  Share a product.
                  <br />
                  Keep your referral.
                </h2>
                <p>
                  Share a product or the whole store with your own referral
                  link.
                </p>
              </div>
              <button
                className="primary light"
                onClick={() => open("referrals")}
              >
                Create your link <ArrowUpRight size={18} />
              </button>
            </section>
            <section className="sourcing">
              <div>
                <span className="eyebrow">SOMETHING SPECIFIC IN MIND?</span>
                <h2>Let’s find your hardware.</h2>
              </div>
              <p>
                A particular miner, a GPU workstation or a rack of servers. Tell
                us what you need and we’ll review your request.
              </p>
              <button
                className="text-link"
                onClick={() => {
                  if (!user) {
                    open("login");
                    setNotice(
                      "Sign in to request and track an equipment quote.",
                    );
                  } else
                    open({ type: "quote", product: featured || products[0] });
                }}
              >
                Request a quote <ArrowUpRight size={19} />
              </button>
            </section>
          </>
        ) : (
          <EquipmentPage
            canEdit={user?.canProducts}
            collections={products}
            items={items}
            loading={loading}
            referral={referral}
            onQuote={requestQuote}
            onShare={share}
            offers={offers}
            renderOffer={(o) => (
              <Offer key={o.id} offer={o} onQuote={() => quoteOffer(o)} />
            )}
          />
        )}
      </main>
      <footer>
        <a className="brand" href="/">
          mercado
        </a>
        <span>Mining, compute and networking equipment.</span>
        <div>
          <a href="https://bittrees.org">Bittrees ↗</a>
          <button onClick={() => open("privacy")}>Privacy & terms</button>
          {user?.staff && <button onClick={openAdmin}>Manage store</button>}
        </div>
        <small>
          © {new Date().getFullYear()} Bittrees Technology. Dealer links may
          earn us a commission.
        </small>
      </footer>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <section
            className={"modal " + (modal === "admin" ? "wide" : "")}
            role="dialog"
            aria-modal="true"
            aria-label={modal === "referrals" ? "Share Mercado" : "Mercado account and equipment"}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
          >
            <button
              autoFocus
              className="close icon"
              onClick={close}
              aria-label="Close"
            >
              <X />
            </button>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="notice">
                {notice}
              </p>
            )}
            {modal === "login" && (
              <>
                <div className="eyebrow">WELCOME TO MERCADO</div>
                <h2>Sign in to Mercado.</h2>
                <p>
                  Sign in to request quotes, create referral links and access
                  deals shared with you.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      if (challenge) {
                        await api("auth/verify-email", {
                          challenge,
                          code: new FormData(e.target).get("code"),
                        });
                        await refresh();
                        close();
                      } else {
                        const r = await api("auth/email", { email });
                        setChallenge(r.challenge);
                        setNotice(r.message);
                      }
                    });
                  }}
                >
                  <label>
                    Email address
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setChallenge("");
                      }}
                      autoComplete="email"
                    />
                  </label>
                  {challenge && (
                    <label>
                      8-digit verification code
                      <input
                        name="code"
                        pattern="[0-9]{8}"
                        maxLength={8}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                      />
                    </label>
                  )}
                  <button disabled={busy} className="primary">
                    {busy
                      ? "Please wait…"
                      : challenge
                        ? "Verify & sign in"
                        : "Email me a code"}{" "}
                    <Mail size={17} />
                  </button>
                </form>
                <div className="divider">or use your wallet</div>
                <WalletPicker busy={busy} onChoose={wallet} />
              </>
            )}
            {modal === "link-wallet" && user?.identity.includes("@") && (
              <>
                <h2>Link your wallet</h2>
                <WalletPicker link busy={busy} onChoose={linkWallet} />
              </>
            )}
            {modal === "account" && (
              <div className="account-panel">
                <h2>Your account</h2>
                <div className="account-summary">
                  <p className="identity">{user?.identity}</p>
                  <span className="account-role">{user?.role === "admin" ? "Administrator" : user?.role?.replaceAll("_", " ")}</span>
                </div>
                <details className="account-photo-settings">
                  <summary>Profile picture</summary>
                  <ProfileImage user={user} setUser={setUser} api={api} />
                </details>
                <label className="account-appearance">Appearance
                  <select value={theme} disabled={themeSaving} onChange={(e) => changeTheme(e.target.value)}>
                    <option value="dark">Dark</option><option value="light">Light</option>
                  </select>
                </label>
                {(themeSaving || themeError) && <small role="status">{themeSaving ? "Saving…" : "Appearance could not be saved. Please try again."}</small>}
                <div className="account-wallet">
                  {user?.governanceStatus === "unavailable" && (
                    <p role="status">
                      Governance is temporarily unavailable. Shared privileges
                      remain disabled until verification succeeds.
                    </p>
                  )}
                  {user?.identity.includes("@") &&
                    (user.linkedWallet ? (
                      <>
                        <p className="identity">
                          <span className="account-field-label">Connected wallet</span>{user.linkedWallet}
                        </p>
                        <button
                          className="secondary"
                          onClick={() =>
                            run(async () => {
                              await api("auth/unlink-wallet", {});
                              await refresh();
                              setNotice(
                                "Wallet unlinked. Email access no longer inherits its governance role.",
                              );
                            })
                          }
                        >
                          Unlink wallet
                        </button>
                      </>
                    ) : (
                      <button
                        className="secondary"
                        onClick={() => open("link-wallet")}
                        disabled={busy}
                      >
                        Connect wallet
                      </button>
                    ))}

                </div>
                <nav className="account-actions" aria-label="Account pages">
                <button className="secondary" onClick={() => open("referrals")}>
                  Referral links <ArrowUpRight size={16} />
                </button>
                {user?.staff && (
                  <button className="primary" onClick={openAdmin}>
                    {user.vendor ? "Vendor workspace" : "Store workspace"}
                  </button>
                )}
                <a className="secondary" href="/account/notifications">
                  Notifications
                </a>
                </nav>
                <section className="account-quotes">
                <h3>Quote requests</h3>
                {quotes.length ? (
                  quotes.map((q) => (
                    <div className="record" key={q.id}>
                      <strong>
                        {q.item_name || q.name} × {q.quantity}
                      </strong>
                      <span className="pill">{q.status}</span>
                      <p>{q.details}</p>
                      {q.proposal && (
                        <div className="quote-proposal">
                          <strong>
                            Quote version {q.proposal.version}:{" "}
                            {new Intl.NumberFormat("en", {
                              style: "currency",
                              currency: q.proposal.currency,
                            }).format(Number(q.proposal.total_minor) / 100)}
                          </strong>
                          <p>
                            {q.proposal.quantity} units · Tax{" "}
                            {new Intl.NumberFormat("en", {
                              style: "currency",
                              currency: q.proposal.currency,
                            }).format(Number(q.proposal.tax_minor) / 100)}{" "}
                            · Delivery{" "}
                            {new Intl.NumberFormat("en", {
                              style: "currency",
                              currency: q.proposal.currency,
                            }).format(Number(q.proposal.shipping_minor) / 100)}
                          </p>
                          <p style={{ whiteSpace: "pre-wrap" }}>
                            {q.proposal.terms}
                          </p>
                          <small>
                            Valid until{" "}
                            {new Date(q.proposal.expires_at).toLocaleString()}
                          </small>
                          {q.proposal.accepted_at ? (
                            <p>Accepted. No payment has been taken.</p>
                          ) : q.status === "quoted" &&
                            new Date(q.proposal.expires_at) > new Date() ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                run(async () => {
                                  await api("quote-accept", {
                                    id: q.id,
                                    version: q.proposal.version,
                                    confirm: true,
                                  });
                                  await refresh();
                                  setNotice(
                                    "Quote accepted. Mercado will coordinate payment and delivery separately.",
                                  );
                                });
                              }}
                            >
                              <label>
                                <input type="checkbox" required /> I accept this
                                quote version and its stated terms.
                              </label>
                              <button className="primary" disabled={busy}>
                                Accept quote · no payment now
                              </button>
                            </form>
                          ) : (
                            <p>
                              This quote is no longer available for acceptance.
                            </p>
                          )}
                        </div>
                      )}

                      <small>
                        {new Date(q.created_at).toLocaleDateString()}
                      </small>
                    </div>
                  ))
                ) : (
                  <p>No quote requests yet.</p>
                )}
                </section>
                <button
                  className="text-link account-signout"
                  onClick={() =>
                    run(async () => {
                      accountRequest.current++;
                      await api("auth/logout", {});
                      setUser(null);
                      await refresh();
                      close();
                    })
                  }
                >
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            )}
            {modal === "referrals" && (
              <ReferralPanel
                user={user}
                products={products}
                items={items}
                busy={busy}
                share={share}
                signIn={() => open("login")}
                copyCode={() => run(async () => {
                  await navigator.clipboard.writeText(user.referral);
                  setNotice("Referral code copied.");
                })}
                renew={(code) => run(async () => {
                  const result = await api("referrals/new", code === undefined ? {} : { code });
                  setUser((current) => ({ ...current, referral: result.referral }));
                  setNotice("New code ready. Your previous codes and links still work.");
                })}
              />
            )}
            {modal === "deals" && (
              <>
                <div className="eyebrow">BY INVITATION</div>
                <h2>Your private offers.</h2>
                <p>
                  Sign in with the email or wallet your dealer offer was shared
                  with.
                </p>
                {!user ? (
                  <button className="primary" onClick={() => open("login")}>
                    Sign in <ArrowRight size={18} />
                  </button>
                ) : offers.filter((o) => o.private).length ? (
                  offers
                    .filter((o) => o.private)
                    .map((o) => (
                      <Offer
                        key={o.id}
                        offer={o}
                        onQuote={() => quoteOffer(o)}
                      />
                    ))
                ) : (
                  <div className="empty">
                    <Lock size={26} />
                    <p>
                      No private offers have been shared with this account yet.
                    </p>
                  </div>
                )}
              </>
            )}
            {modal.type === "product" && (
              <>
                <div className="eyebrow">{modal.product.category}</div>
                <h2>{modal.product.name}</h2>
                <p>{modal.product.description}</p>
                {offers
                  .filter((o) => o.product_id === modal.product.id)
                  .map((o) => (
                    <Offer key={o.id} offer={o} onQuote={() => quoteOffer(o)} />
                  ))}
                {!offers.some((o) => o.product_id === modal.product.id) && (
                  <div className="empty">
                    We’re sourcing this collection. Request a quote for current
                    pricing and availability.
                  </div>
                )}
                <button
                  className="primary"
                  onClick={() => {
                    if (!user) {
                      open("login");
                      setNotice(
                        "Sign in, then open this collection to request your quote.",
                      );
                    } else open({ type: "quote", product: modal.product });
                  }}
                >
                  Request a quote <ArrowUpRight size={18} />
                </button>
                <button
                  className="secondary"
                  onClick={() => share(modal.product.id)}
                >
                  Share collection <Copy size={16} />
                </button>
                {modal.product.category === "Mining" && (
                  <small>
                    Mining results vary. Hardware specifications, electricity
                    costs and network conditions affect outcomes. No mining
                    income is guaranteed.
                  </small>
                )}
              </>
            )}
            {modal.type === "quote" && (
              <>
                <h2>Tell us what you need.</h2>
                <p>
                  Request a purchase quote from Mercado. We will confirm the
                  quantity, supplier availability, delivery and final price in
                  your account. No payment is taken now. Your submitted details
                  and referral code may be emailed to the Mercado operations
                  team to process your request.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = Object.fromEntries(new FormData(e.target));
                    run(async () => {
                      const payload = {
                        ...f,
                        product: modal.offer?.product_id || f.product,
                        item_id: modal.offer?.item_id || f.item_id,
                        referral,
                        offer_id: modal.offer?.id || null,
                      };
                      const fingerprint = JSON.stringify(payload);
                      if (quoteAttempt.current?.fingerprint !== fingerprint)
                        quoteAttempt.current = {
                          fingerprint,
                          key: crypto.randomUUID(),
                        };
                      await api("quotes", {
                        ...payload,
                        request_key: quoteAttempt.current.key,
                      });
                      await refresh();
                      open("account");
                      setNotice(
                        "Quote request received. You can track its status here.",
                      );
                    });
                  }}
                >
                  <label>
                    Equipment
                    <select
                      name="product"
                      disabled={Boolean(modal.offer)}
                      defaultValue={modal.product.id}
                      onChange={(e) =>
                        setModal({
                          ...modal,
                          product: products.find(
                            (p) => p.id === e.target.value,
                          ),
                          item: null,
                        })
                      }
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
                      disabled={Boolean(modal.offer?.item_id)}
                      defaultValue={modal.item?.id || ""}
                      key={modal.product.id + ":" + (modal.item?.id || "")}
                    >
                      <option value="">General collection request</option>
                      {items
                        .filter((i) => i.product_id === modal.product.id)
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Member referral code (optional)
                    <input
                      name="referral"
                      value={referral}
                      onChange={(e) => setReferral(e.target.value)}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="Enter the code a member shared"
                      aria-describedby="referral-help"
                    />
                  </label>
                  <small id="referral-help">
                    A referral link fills this in automatically. You can change
                    or clear it before submitting. This attributes your quote;
                    it does not apply a discount.
                  </small>
                  <label>
                    Quantity
                    <input
                      name="quantity"
                      type="number"
                      min="1"
                      max="10000"
                      defaultValue={modal.quantity || 1}
                      step="1"
                      required
                    />
                  </label>
                  <label>
                    Requirements
                    <textarea
                      name="details"
                      required
                      maxLength={3000}
                      placeholder="Model, budget, delivery country and any compatibility requirements. If signing in with a wallet, include a contact method if you want a reply outside your account."
                    />
                  </label>
                  <button disabled={busy} className="primary">
                    Submit quote request <ArrowUpRight size={18} />
                  </button>
                </form>
              </>
            )}
            {modal === "privacy" && (
              <>
                <h2>Privacy & store terms</h2>
                <h3>Accounts and requests</h3>
                <p>
                  Mercado stores your email or wallet identity, account
                  sessions, referral code and quote requests to provide the
                  service. Dealers’ private terms are restricted to authorized
                  accounts. Contact Bittrees through bittrees.org for access or
                  deletion requests.
                </p>
                <h3>Analytics and referrals</h3>
                <p>
                  Bittrees Insights analytics runs after consent and respects
                  browser privacy signals. Referral codes in shared URLs
                  attribute quote requests; we do not store an additional
                  marketing cookie for this. Do not enter sensitive information
                  in quote requirements.
                </p>
                <h3>Buying equipment</h3>
                <p>
                  Quotes are requests, not accepted orders. Dealer checkout
                  links take you to the named dealer, whose price, stock,
                  delivery, warranty and returns terms apply. Mercado may
                  receive commission from dealer links. Confirm the final
                  product and terms with the dealer before payment.
                </p>
                <h3>Mining</h3>
                <p>
                  Mining carries equipment and operating costs. Rewards are
                  variable and are never guaranteed.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
function Offer({ offer: o, onQuote }) {
  return (
    <div className="record">
      <strong>{o.dealer}</strong>
      {o.private && (
        <span className="pill">
          <Lock size={12} /> Private offer
        </span>
      )}
      <p>
        {o.price !== null
          ? new Intl.NumberFormat("en", {
              style: "currency",
              currency: o.currency,
            }).format(o.price)
          : "Confirm price with dealer"}
      </p>
      {o.expires_at && (
        <small>
          Offer expires {new Date(o.expires_at).toLocaleDateString()}
        </small>
      )}
      {onQuote && (
        <button className="primary" onClick={onQuote}>
          Request through Mercado
        </button>
      )}
      <a
        className="secondary"
        data-insights="dealer_checkout"
        href={"/api/go?id=" + o.id}
        target="_blank"
        rel="sponsored noopener noreferrer"
      >
        Visit dealer <ArrowUpRight size={17} />
      </a>
      <small>
        We may earn a commission. Price, availability and purchase terms are
        confirmed by the dealer.
      </small>
    </div>
  );
}
// Keep host-bound authentication and consent on the canonical storefront.
if (
  location.hostname.endsWith(".vercel.app") ||
  ["marcada.bittrees.org", "marcado.bittrees.org"].includes(location.hostname)
) {
  location.replace(
    "https://mercado.bittrees.org" +
      location.pathname +
      location.search +
      location.hash,
  );
} else {
  createRoot(document.getElementById("root")).render(<App />);
}
