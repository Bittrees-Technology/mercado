// Opt-in integration tests against the dedicated Marcada schema. No email is sent.
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import handler from "../api/index.mjs";
import { hash, token } from "../lib/security.mjs";
const originalFetch = globalThis.fetch;
process.env.REFERRAL_NOTIFY_EMAIL = "ops@example.com";
process.env.RESEND_API_KEY = "test-not-a-real-key";
process.env.MAIL_FROM = "Mercado <test@example.com>";
let notificationCalls = [];
let emailFailure = true;
const sql = neon(process.env.DATABASE_URL),
  origin = process.env.APP_ORIGIN,
  tag = randomUUID(),
  customer = `customer-${tag}@example.com`,
  support = `support-${tag}@example.com`,
  dealer = `dealer-${tag}@example.com`,
  admin = `admin-${tag}@example.com`,
  owner = `owner-${tag}@example.com`;
process.env.ADMIN_EMAIL = owner;
const cookies = {},
  identities = [customer, support, dealer, admin, owner];
let offerId, quoteId, wallet, mediaId, itemQuoteId, privateQuoteId;
const testItem = "test-" + tag;
async function request(path, body, who, custom = {}) {
  let status = 200,
    data,
    headers = {};
  const res = {
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
    },
    status(n) {
      status = n;
      return this;
    },
    json(d) {
      data = d;
      return this;
    },
    end(value) {
      if (value) data = value;
      return this;
    },
  };
  await handler(
    {
      url: "/api/" + path,
      method: body === undefined ? "GET" : "POST",
      body,
      headers: {
        origin,
        "x-forwarded-for": tag + ":" + (body?.request_key || "default"),
        ...(who ? { cookie: cookies[who] } : {}),
        ...custom,
      },
    },
    res,
  );
  return { status, data, headers };
}
try {
  for (const i of identities) {
    const t = token();
    cookies[i] = "__Host-mercado=" + t;
    await sql`INSERT INTO marcada.users(identity,referral) VALUES(${i},${token().slice(0, 16)})`;
    await sql`INSERT INTO marcada.sessions(hash,identity,expires_at) VALUES(${hash(t)},${i},now()+interval '1 hour')`;
  }
  for (const [i, role] of [
    [support, "support"],
    [dealer, "dealer_manager"],
    [admin, "admin"],
  ])
    await sql`INSERT INTO marcada.roles(identity,role) VALUES(${i},${role})`;
  assert.equal((await request("admin")).status, 401);
  assert.equal((await request("admin", undefined, customer)).status, 403);
  assert.equal(
    (await request("admin/role", { identity: customer, role: "admin" }, admin))
      .status,
    403,
  );
  assert.equal((await request("admin/offer", {}, support)).status, 403);
  assert.equal(
    (
      await request(
        "admin/notifications",
        { recipient: "ops@example.com", enabled: true },
        support,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "admin/notifications",
        { recipient: "bad", enabled: true },
        owner,
      )
    ).status,
    400,
  );
  assert.equal((await request("admin/quote", {}, dealer)).status, 403);
  const o = await request(
    "admin/offer",
    {
      product: "bitaxe",
      dealer: "Integration test " + tag,
      url: "https://example.com/offer?ref=test",
      price: 123,
      currency: "USD",
      private: true,
      notes: "CONFIDENTIAL-" + tag,
    },
    owner,
  );
  assert.equal(o.status, 200, JSON.stringify(o.data));
  offerId = o.data.id;
  for (const who of [undefined, customer, support]) {
    const c = await request("catalog", undefined, who);
    assert.equal(c.status, 200);
    assert.equal(
      c.data.offers.some((o) => o.id === offerId),
      false,
    );
    assert.equal(
      (await request("go?id=" + offerId, undefined, who)).status,
      404,
    );
  }
  assert.equal(
    (
      await request(
        "admin/grant",
        { id: offerId, identity: customer, remove: false },
        owner,
      )
    ).status,
    200,
  );
  const privateRequest = {
    product: "bitaxe",
    offer_id: offerId,
    quantity: 4,
    details: "Private purchase request",
    request_key: randomUUID(),
  };
  const pq = await request("quotes", privateRequest, customer);
  assert.equal(pq.status, 201, JSON.stringify(pq.data));
  privateQuoteId = pq.data.id;
  const [privateSaved] =
    await sql`SELECT offer_id,offer_snapshot FROM marcada.quotes WHERE id=${privateQuoteId}`;
  assert.equal(privateSaved.offer_id, offerId);
  assert.equal(privateSaved.offer_snapshot.price, 123);
  assert.equal(privateSaved.offer_snapshot.url, undefined);
  assert.equal(
    (
      await request(
        "quotes",
        { ...privateRequest, request_key: randomUUID() },
        support,
      )
    ).status,
    404,
  );
  let activity = await request("notifications", undefined, customer);
  const privateNote = activity.data.notifications.find(
    (n) => n.type === "private_offer",
  );
  assert.ok(privateNote);
  assert.equal(
    (await request("notifications?id=" + privateNote.id, undefined, support))
      .status,
    404,
  );
  await request(
    "admin/grant",
    { id: offerId, identity: customer, remove: false },
    owner,
  );
  activity = await request("notifications", undefined, customer);
  assert.equal(
    activity.data.notifications.filter((n) => n.type === "private_offer")
      .length,
    1,
  );
  const c = await request("catalog", undefined, customer);
  assert.ok(c.data.offers.some((o) => o.id === offerId));
  assert.equal(JSON.stringify(c.data).includes("CONFIDENTIAL"), false);
  assert.equal(JSON.stringify(c.data).includes("example.com/offer"), false);
  assert.equal(
    (await request("go?id=" + offerId, undefined, customer)).status,
    302,
  );
  await request(
    "admin/grant",
    { id: offerId, identity: customer, remove: true },
    owner,
  );
  assert.equal(
    (await request("go?id=" + offerId, undefined, customer)).status,
    404,
  );
  assert.equal(
    (await request("notifications?id=" + privateNote.id, undefined, customer))
      .status,
    404,
  );
  assert.equal(
    (
      await request(
        "quotes",
        { ...privateRequest, request_key: randomUUID() },
        customer,
      )
    ).status,
    404,
  );
  const [ref] =
    await sql`SELECT referral FROM marcada.users WHERE identity=${support}`;
  assert.equal((await request("referrals/new", {})).status, 401);
  assert.equal(
    (
      await request("referrals/new", {}, support, {
        origin: "https://untrusted.example",
      })
    ).status,
    403,
  );
  const renewed = await request("referrals/new", {}, support);
  assert.equal(renewed.status, 201);
  assert.match(renewed.data.referral, /^[a-f0-9]{16}$/);
  assert.notEqual(renewed.data.referral, ref.referral);
  assert.equal(
    (await request("me", undefined, support)).data.user.referral,
    renewed.data.referral,
  );
  assert.equal(
    (
      await sql`SELECT identity FROM marcada.referral_codes WHERE code=${ref.referral}`
    )[0].identity,
    support,
  );
  globalThis.fetch = async (url, options) => {
    if (String(url) !== "https://api.resend.com/emails")
      return originalFetch(url, options);
    notificationCalls.push(options);
    return new Response(
      JSON.stringify(
        emailFailure ? { error: "simulated" } : { id: "test-email-id" },
      ),
      { status: emailFailure ? 503 : 200 },
    );
  };
  const q = await request(
    "quotes",
    {
      product: "bitaxe",
      quantity: 2,
      details: "Integration test",
      request_key: tag,
      referral: "  " + ref.referral.toUpperCase() + "  ",
    },
    customer,
  );
  assert.equal(q.status, 201, JSON.stringify(q.data));
  quoteId = q.data.id;
  const [saved] =
    await sql`SELECT referral, quantity FROM marcada.quotes WHERE id=${quoteId}`;
  assert.equal(saved.referral, ref.referral);
  assert.equal(saved.quantity, 2);
  let [notice] =
    await sql`SELECT * FROM marcada.referral_notifications WHERE quote_id=${quoteId}`;
  assert.equal(notice.status, "pending");
  assert.equal(notice.payload.to[0], "ops@example.com");
  assert.ok(notice.payload.text.includes(customer));
  assert.ok(notice.payload.text.includes(ref.referral));
  assert.ok(notice.payload.text.includes("Quantity: 2"));
  assert.equal(
    (await request("admin/notification-retry", { id: quoteId }, dealer)).status,
    403,
  );
  emailFailure = false;
  assert.equal(
    (await request("admin/notification-retry", { id: quoteId }, support)).data
      .status,
    "accepted",
  );
  await request("admin/notification-retry", { id: quoteId }, support);
  assert.equal(notificationCalls.length, 2);
  assert.equal(
    notificationCalls[0].headers["Idempotency-Key"],
    notificationCalls[1].headers["Idempotency-Key"],
  );
  assert.equal(notificationCalls[0].body, notificationCalls[1].body);
  await sql`UPDATE marcada.referral_notifications SET status='pending',first_attempt_at=now()-interval '25 hours' WHERE quote_id=${quoteId}`;
  await request("admin/notification-retry", { id: quoteId }, support);
  [notice] =
    await sql`SELECT * FROM marcada.referral_notifications WHERE quote_id=${quoteId}`;
  assert.equal(notice.status, "needs_review");
  assert.equal(notificationCalls.length, 2);
  const replay = await request(
    "quotes",
    {
      product: "bitaxe",
      quantity: 2,
      details: "Integration test",
      request_key: tag,
      referral: ref.referral,
    },
    customer,
  );
  assert.equal(replay.status, 200);
  assert.equal(replay.data.id, quoteId);
  assert.equal(
    (
      await request(
        "quotes",
        {
          product: "bitaxe",
          quantity: 3,
          details: "Integration test",
          request_key: tag,
          referral: ref.referral,
        },
        customer,
      )
    ).status,
    409,
  );
  assert.equal(notificationCalls.length, 2);
  const referralNotes = (
    await request("notifications", undefined, support)
  ).data.notifications.filter((n) => n.type === "referral_activity");
  assert.equal(referralNotes.length, 1);
  assert.equal(JSON.stringify(referralNotes).includes(customer), false);
  assert.equal(
    JSON.stringify(referralNotes).includes("Integration test"),
    false,
  );
  const parallelKey = randomUUID();
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      request(
        "quotes",
        {
          product: "bitaxe",
          quantity: 1,
          details: "Concurrent quote",
          request_key: parallelKey,
        },
        customer,
      ),
    ),
  );
  assert.ok(
    concurrent.every((r) => [200, 201].includes(r.status)),
    JSON.stringify(concurrent),
  );
  assert.equal(concurrent[0].data.id, concurrent[1].data.id);
  await sql`DELETE FROM marcada.quotes WHERE identity=${customer} AND request_key=${parallelKey}`;
  globalThis.fetch = originalFetch;
  const proposal = {
    id: quoteId,
    unit_price: "100.25",
    tax: "10.00",
    shipping: "20.00",
    currency: "EUR",
    terms: "Delivery to Portugal in 10 days, new equipment, 12-month warranty.",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  };
  assert.equal((await request("admin/proposal", proposal, dealer)).status, 403);
  let issued = await request("admin/proposal", proposal, support);
  assert.equal(issued.status, 200, JSON.stringify(issued.data));
  assert.equal(issued.data.version, 1);
  let mine = (await request("me", undefined, customer)).data.quotes.find(
    (q) => q.id === quoteId,
  );
  assert.equal(Number(mine.proposal.total_minor), 23050);
  assert.equal(
    (
      await request(
        "quote-accept",
        { id: quoteId, version: 1, confirm: true },
        dealer,
      )
    ).status,
    409,
  );
  issued = await request(
    "admin/proposal",
    { ...proposal, unit_price: "101.25" },
    support,
  );
  assert.equal(issued.data.version, 2);
  assert.equal(
    (
      await request(
        "quote-accept",
        { id: quoteId, version: 1, confirm: true },
        customer,
      )
    ).status,
    409,
  );
  await sql`UPDATE marcada.quote_proposals SET expires_at=now()-interval '1 minute' WHERE quote_id=${quoteId} AND version=2`;
  assert.equal(
    (
      await request(
        "quote-accept",
        { id: quoteId, version: 2, confirm: true },
        customer,
      )
    ).status,
    409,
  );
  issued = await request("admin/proposal", proposal, support);
  assert.equal(issued.data.version, 3);
  const accepted = await request(
    "quote-accept",
    { id: quoteId, version: 3, confirm: true },
    customer,
  );
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.equal(
    (
      await request(
        "quote-accept",
        { id: quoteId, version: 3, confirm: true },
        customer,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request("admin/proposal", proposal, support)).status,
    409,
  );
  mine = (await request("me", undefined, customer)).data.quotes.find(
    (q) => q.id === quoteId,
  );
  assert.ok(mine.proposal.accepted_at);
  for (const code of ["typo", ref.referral + "extra", "0000000000000000"]) {
    const rejected = await request(
      "quotes",
      {
        product: "bitaxe",
        quantity: 1,
        details: "Referral negative test",
        referral: code,
      },
      customer,
    );
    assert.equal(rejected.status, 400);
    assert.ok(rejected.data.error.toLowerCase().includes("referral"));
  }
  const [self] =
    await sql`SELECT referral FROM marcada.users WHERE identity=${customer}`;
  assert.equal((await request("referrals/new", {}, customer)).status, 201);
  assert.equal(
    (
      await request(
        "quotes",
        {
          product: "bitaxe",
          quantity: 1,
          details: "Self referral",
          referral: self.referral,
        },
        customer,
      )
    ).status,
    400,
  );

  assert.equal(
    (await request("admin", undefined, dealer)).data.quotes.length,
    0,
  );
  assert.equal(
    (await request("admin", undefined, support)).data.offers.length,
    0,
  );
  assert.equal(
    (
      await request(
        "admin/offer-state",
        { id: offerId, active: false },
        owner,
        { origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  const challenge = token(),
    code = "12345678";
  await sql`INSERT INTO marcada.email_challenges(hash,identity,code_hash,expires_at) VALUES(${hash(challenge)},${customer},${hash(challenge + ":" + code)},now()+interval '1 minute')`;
  assert.equal(
    (await request("auth/verify-email", { challenge, code: "00000000" }))
      .status,
    401,
  );
  const ok = await request("auth/verify-email", { challenge, code });
  assert.equal(ok.status, 200);
  assert.match(ok.headers["set-cookie"], /HttpOnly; Secure; SameSite=Lax/);
  assert.equal(
    (await request("auth/verify-email", { challenge, code })).status,
    401,
  );
  const account = privateKeyToAccount(generatePrivateKey());
  wallet = account.address.toLowerCase();
  const n = await request("auth/nonce", {});
  const nonceCookie = n.headers["set-cookie"].split(";")[0];
  const message = createSiweMessage({
    address: account.address,
    chainId: 1,
    domain: new URL(origin).host,
    uri: origin,
    nonce: n.data.nonce,
    version: "1",
    issuedAt: new Date(),
  });
  const signature = await account.signMessage({ message });
  const args = { message, signature };
  assert.equal(
    (await request("auth/wallet", args, undefined, { cookie: nonceCookie }))
      .status,
    200,
  );
  assert.equal(
    (await request("auth/wallet", args, undefined, { cookie: nonceCookie }))
      .status,
    401,
  );
  const n2 = await request("auth/nonce", {});
  const wrong = createSiweMessage({
    address: account.address,
    chainId: 1,
    domain: "evil.example",
    uri: origin,
    nonce: n2.data.nonce,
    version: "1",
    issuedAt: new Date(),
  });
  assert.equal(
    (
      await request(
        "auth/wallet",
        {
          message: wrong,
          signature: await account.signMessage({ message: wrong }),
        },
        undefined,
        { cookie: n2.headers["set-cookie"].split(";")[0] },
      )
    ).status,
    401,
  );
  await sql`DELETE FROM marcada.auth_tokens WHERE hash=${hash(n2.data.nonce)}`;
  assert.equal((await request("admin/item", {}, support)).status, 403);
  assert.equal((await request("admin/image", {}, customer)).status, 403);
  process.env.IPFS_API_URL='https://ipfs-test.example';
  process.env.IPFS_API_BEARER_TOKEN='test-only';
  process.env.IPFS_GATEWAY_BASE_URL='https://read-test.example';
  const imageBytes=await (await import('sharp')).default({create:{width:16,height:16,channels:3,background:'#abc'}}).png().toBuffer();
  const image='data:image/png;base64,'+imageBytes.toString('base64');
  const beforeImages=globalThis.fetch;let pinnedBytes;
  globalThis.fetch=async(url,options)=>{
    if(String(url).startsWith('https://ipfs-test.example/')){pinnedBytes=await options.body.get('file').arrayBuffer();return new Response(JSON.stringify({Hash:'bafybeiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}));}
    if(String(url).startsWith('https://read-test.example/'))return new Response(pinnedBytes);
    return beforeImages(url,options);
  };
  const upload=await request('admin/image',{image},dealer);
  assert.equal(upload.status,201,JSON.stringify(upload.data));
  assert.ok(upload.data.url.startsWith('https://read-test.example/ipfs/'));
  assert.equal((await request('images',{purpose:'product',image},customer)).status,403);
  assert.equal((await request('images',{purpose:'profile',image})).status,401);
  const avatar=await request('images',{purpose:'profile',image},customer);
  assert.equal(avatar.status,201,JSON.stringify(avatar.data));
  assert.equal((await request('profile/image',{upload_id:avatar.data.id},support)).status,404);
  assert.equal((await request('profile/image',{upload_id:upload.data.id},dealer)).status,404);
  assert.equal((await request('profile/image',{upload_id:avatar.data.id},customer)).status,200);
  assert.equal((await request('me',undefined,customer)).data.user.avatar_url,avatar.data.url);
  assert.equal((await request('profile/image',{upload_id:null},customer)).status,200);
  assert.equal((await request('me',undefined,customer)).data.user.avatar_url,null);
  await request('admin/role',{identity:customer,role:'vendor'},owner);
  assert.equal((await request('images',{purpose:'product',image},customer)).status,201);
  assert.equal((await request('admin/image',{image},customer)).status,403);
  await request('admin/role',{identity:customer,role:'customer'},owner);
  globalThis.fetch=beforeImages;
  const product = {
    id: testItem,
    product_id: "bitaxe",
    name: "Test product",
    hashrate: "1.2 TH/s (standard)",
    description: "Integration test product",
    price: 19.95,
    currency: "USD",
    price_kind: "asking",
    price_checked: new Date().toISOString().slice(0, 10),
    image_url: upload.data.url,
    active: true,
  };
  assert.equal(
    (await request("admin/item", { ...product, create_only: true }, dealer))
      .status,
    200,
  );
  assert.equal(
    (
      await request(
        "admin/item",
        { ...product, price: 999, create_only: true },
        dealer,
      )
    ).status,
    409,
  );
  let catalog = await request("catalog");
  assert.equal(
    Number(catalog.data.items.find((i) => i.id === testItem).price),
    19.95,
  );
  assert.equal(
    (
      await request(
        "admin/item",
        { ...product, price: 29.95, image_url: "/products/bitaxe-gt.png" },
        dealer,
      )
    ).status,
    200,
  );
  catalog = await request("catalog");
  assert.equal(
    catalog.data.items.find((i) => i.id === testItem).image_url,
    "/products/bitaxe-gt.png",
  );
  const iq = await request(
    "quotes",
    {
      product: "bitaxe",
      item_id: testItem,
      quantity: 1,
      details: "Selected item test",
    },
    customer,
  );
  assert.equal(iq.status, 201);
  itemQuoteId = iq.data.id;
  const accountView = await request("me", undefined, customer);
  assert.equal(
    accountView.data.quotes.find((q) => q.id === itemQuoteId).item_name,
    "Test product",
  );
  assert.equal(
    (
      await request(
        "quotes",
        {
          product: "servers",
          item_id: testItem,
          quantity: 1,
          details: "Mismatched category",
        },
        customer,
      )
    ).status,
    400,
  );
  assert.equal(
    (await sql`SELECT hashrate FROM marcada.items WHERE id=${testItem}`)[0]
      .hashrate,
    product.hashrate,
  );
  await request("admin/item", { ...product, active: false }, dealer);
  catalog = await request("catalog");
  assert.equal(
    catalog.data.items.some((i) => i.id === testItem),
    false,
  );
  assert.equal(catalog.data.commerce.checkout, false);
  assert.equal((await request("checkout", {}, customer)).status, 403);
  const linkNonce = await request("auth/link-nonce", {}, customer);
  assert.equal(linkNonce.status, 200);
  const linkCookie = linkNonce.headers["set-cookie"].split(";")[0];
  const linkMessage = createSiweMessage({
    address: account.address,
    chainId: 1,
    domain: new URL(origin).host,
    uri: origin,
    nonce: linkNonce.data.nonce,
    statement: linkNonce.data.statement,
    version: "1",
    issuedAt: new Date(),
  });
  const linkArgs = {
    message: linkMessage,
    signature: await account.signMessage({ message: linkMessage }),
  };
  assert.equal(
    (
      await request("auth/link-wallet", linkArgs, support, {
        cookie: cookies[support] + "; " + linkCookie,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("auth/link-wallet", linkArgs, customer, {
        cookie: cookies[customer] + "; " + linkCookie,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("auth/link-wallet", linkArgs, customer, {
        cookie: cookies[customer] + "; " + linkCookie,
      })
    ).status,
    401,
  );
  let labels = [{ label: "Partner" }],
    admins = [];
  globalThis.fetch = async (url, options) =>
    String(url) === "https://gov.bittrees.org/api/community"
      ? new Response(JSON.stringify({ roles: { [wallet]: labels } }))
      : String(url) === "https://hub.snapshot.org/graphql"
        ? new Response(
            JSON.stringify({
              data: { space: { id: "gov.bittrees.eth", admins } },
            }),
          )
        : originalFetch(url, options);
  assert.equal(
    (await request("me", undefined, customer)).data.user.role,
    "owner",
  );
  labels = [];
  assert.equal(
    (await request("me", undefined, customer)).data.user.role,
    "customer",
  );
  assert.equal((await request("admin", undefined, customer)).status, 403);
  admins = [wallet];
  assert.equal(
    (await request("me", undefined, customer)).data.user.role,
    "admin",
  );
  assert.equal(
    (await request("admin/role", { identity: dealer, role: "admin" }, owner))
      .status,
    400,
  );
  await request("auth/unlink-wallet", {}, customer);
  assert.equal(
    (await request("me", undefined, customer)).data.user.role,
    "customer",
  );
  await request("admin/role", { identity: customer, role: "vendor" }, owner);
  await request("admin/role", { identity: support, role: "vendor" }, owner);
  const vendorData = {
    name: "Fixture supplier",
    website: "https://example.com",
    contact_email: "vendor@example.com",
    feed_format: "csv",
    feed_url: "https://example.com/catalog.csv",
    status: "submitted",
    notes: "Fixture",
  };
  assert.equal(
    (await request("admin/vendor", vendorData, customer)).status,
    200,
  );
  assert.equal(
    (await request("admin/vendor", vendorData, support)).status,
    200,
  );
  let vendorView = (await request("admin", undefined, customer)).data;
  assert.deepEqual(
    vendorView.vendors.map((v) => v.identity),
    [customer],
  );
  assert.equal(vendorView.items.length, 0);
  assert.equal(vendorView.offers.length, 0);
  assert.equal(vendorView.quotes.length, 0);
  assert.equal(vendorView.roles.length, 0);
  for (const route of [
    "admin/item",
    "admin/image",
    "admin/offer",
    "admin/quote",
    "admin/role",
    "admin/grant",
  ])
    assert.equal((await request(route, {}, customer)).status, 403);
  assert.equal(
    (
      await request(
        "admin/vendor",
        { ...vendorData, identity: support },
        customer,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "admin/vendor",
        { ...vendorData, status: "approved" },
        customer,
      )
    ).status,
    403,
  );
  await request(
    "admin/role",
    { identity: dealer, role: "vendor_manager" },
    owner,
  );
  assert.equal(
    (
      await request(
        "admin/vendor",
        { ...vendorData, identity: customer, status: "approved" },
        dealer,
      )
    ).status,
    200,
  );
  assert.equal((await request("admin/item", product, dealer)).status, 403);
  assert.equal(
    (
      await request(
        "admin/role",
        { identity: customer, role: "catalog_manager" },
        owner,
      )
    ).status,
    200,
  );
  assert.equal((await request("admin/item", product, customer)).status, 200);
  assert.equal((await request("admin/offer", {}, customer)).status, 403);
  assert.equal(
    (await request("admin/vendor", vendorData, customer)).status,
    403,
  );
  await request("admin/role", { identity: customer, role: "customer" }, owner);
  assert.equal((await request("admin", undefined, customer)).status, 403);
  for (const code of [ref.referral, renewed.data.referral]) {
    const result = await request(
      "quotes",
      {
        product: "asic",
        item_id: "bitshopper-23685",
        quantity: 3,
        details: "Catalog-wide referral check",
        referral: code,
        request_key: randomUUID(),
      },
      customer,
    );
    assert.equal(result.status, 201, JSON.stringify(result.data));
    const [saved] =
      await sql`SELECT referral,item_id FROM marcada.quotes WHERE id=${result.data.id}`;
    assert.equal(saved.referral, code);
    assert.equal(saved.item_id, "bitshopper-23685");
    await sql`DELETE FROM marcada.quotes WHERE id=${result.data.id}`;
  }
  globalThis.fetch = originalFetch;
  console.log(
    "PASS: role boundaries, private offers and revocation, CSRF, quote/referral persistence and notification failure/retry/expiry, email code replay, secure cookies, SIWE signature/replay/domain checks.",
  );
} finally {
  globalThis.fetch = originalFetch;
  await sql`DELETE FROM marcada.identity_links WHERE email=${customer} OR email=${support}`;
  if (itemQuoteId)
    await sql`DELETE FROM marcada.quotes WHERE id=${itemQuoteId}`;
  await sql`DELETE FROM marcada.items WHERE id=${testItem}`;
  if (mediaId) await sql`DELETE FROM marcada.media WHERE id=${mediaId}`;
  if (privateQuoteId)
    await sql`DELETE FROM marcada.quotes WHERE id=${privateQuoteId}`;
  if (offerId) await sql`DELETE FROM marcada.offers WHERE id=${offerId}`;
  if (quoteId) await sql`DELETE FROM marcada.quotes WHERE id=${quoteId}`;

  for (const identity of identities)
    await sql`DELETE FROM marcada.account_notifications WHERE recipient=${identity}`;
  for (const i of [...identities, wallet].filter(Boolean)) {
    await sql`DELETE FROM marcada.vendor_integrations WHERE identity=${i}`;
    await sql`DELETE FROM marcada.sessions WHERE identity=${i}`;
    await sql`DELETE FROM marcada.email_challenges WHERE identity=${i}`;
    await sql`DELETE FROM marcada.roles WHERE identity=${i}`;
    await sql`DELETE FROM marcada.audit WHERE actor=${i}`;
    await sql`DELETE FROM marcada.users WHERE identity=${i}`;
  }
}
