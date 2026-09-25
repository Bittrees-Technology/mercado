import { visibilityInput } from "../lib/product-visibility.mjs";
import {handleRoleFeed} from '../lib/roles-feed.mjs';
import { prepareImage, publishImage } from "../lib/ipfs.mjs";
import { customReferralCode, validReferralCode } from "../lib/referrals.mjs";
import {
  workflowRule,
  workflowInsert,
  deliverWorkflow,
  retryWorkflows,
  submissionInput,
  submissionWrite,
  supplierBrief,
} from "../lib/workflows.mjs";
import { proposalInput } from "../lib/proposals.mjs";
import {
  referralMessage,
  notificationSettings,
  deliverNotification,
  retryNotifications,
} from "../lib/notifications.mjs";
import { localRoles, permissions } from "../lib/permissions.mjs";
import { resolveGovernance } from "../lib/governance.mjs";
import { itemInput, imageUpload } from "../lib/catalog.mjs";
import { neon } from "@neondatabase/serverless";
import { randomUUID, randomInt } from "node:crypto";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { parseSiweMessage } from "viem/siwe";
import {
  hash,
  token,
  normalizeIdentity,
  isAdmin,
  dealerUrl,
  uuid,
  textField,
} from "../lib/security.mjs";
const sql = () => neon(process.env.DATABASE_URL);
const origin = () => process.env.APP_ORIGIN || "https://mercado.bittrees.org";
const cookie = (req, name) =>
  String(req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + "="))
    ?.slice(name.length + 1) || "";
const setCookie = (res, name, value, seconds) =>
  res.setHeader(
    "Set-Cookie",
    `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${seconds}`,
  );
const json = (res, status, data) => res.status(status).json(data);
async function limited(req, bucket, max) {
  const key = hash(
    `${bucket}|${req.headers["x-forwarded-for"] || "unknown"}|${Math.floor(Date.now() / 600000)}`,
  );
  const [r] =
    await sql()`INSERT INTO marcada.rate_limits(key,count,expires_at) VALUES(${key},1,now()+interval '10 minutes') ON CONFLICT(key) DO UPDATE SET count=marcada.rate_limits.count+1 RETURNING count`;
  if (r.count > max)
    throw Object.assign(Error("Please try again shortly."), { status: 429 });
}
async function user(req) {
  const key = cookie(req, "__Host-mercado");
  if (!key) return null;
  const [record] =
    await sql()`SELECT s.identity,u.referral,u.theme,u.avatar_url,u.avatar_cid,r.role,l.email,l.wallet FROM marcada.sessions s JOIN marcada.users u ON u.identity=s.identity LEFT JOIN marcada.roles r ON r.identity=s.identity LEFT JOIN marcada.identity_links l ON l.email=s.identity OR l.wallet=s.identity WHERE s.hash=${hash(key)} AND s.expires_at>now()`;
  if (!record) return null;
  const s = {
    identity: record.identity,
    referral: record.referral,
    theme: record.theme,
    avatar_url: record.avatar_url,
    avatar_cid: record.avatar_cid,
  };
  const r = { role: record.role },
    link = { email: record.email, wallet: record.wallet };
  const wallet = /^0x[a-f0-9]{40}$/.test(s.identity)
    ? s.identity
    : link?.wallet;
  const governance = await resolveGovernance(wallet);
  const recoveryOwner = isAdmin(s.identity),
    owner = recoveryOwner || governance.role === "owner";
  const role = owner
    ? "owner"
    : governance.role === "admin"
      ? "admin"
      : localRoles.includes(r?.role)
        ? r.role
        : "customer";
  return {
    ...s,
    linkedWallet: link?.wallet || null,
    linkedEmail: link?.email || null,
    governanceStatus: governance.status,
    roleSource: recoveryOwner
      ? "protected_owner"
      : governance.role
        ? "governance"
        : role === "customer"
          ? "customer"
          : "local",
    role,
    owner,
    admin: owner || role === "admin",
    staff: role !== "customer",
    ...permissions(role),
  };
}
async function session(res, identity) {
  await sql()`INSERT INTO marcada.users(identity,referral) VALUES(${identity},${token().slice(0, 16)}) ON CONFLICT(identity) DO NOTHING`;
  const value = token();
  await sql()`INSERT INTO marcada.sessions(hash,identity,expires_at) VALUES(${hash(value)},${identity},now()+interval '7 days')`;
  setCookie(res, "__Host-mercado", value, 604800);
}
async function audit(actor, action, detail) {
  await sql()`INSERT INTO marcada.audit(id,actor,action,detail) VALUES(${randomUUID()},${actor},${action},${detail})`;
}
async function sendCode(email, code) {
  if (!process.env.RESEND_API_KEY)
    throw Object.assign(Error("Email delivery is not configured."), {
      status: 503,
    });
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [email],
      subject: "Your Mercado sign-in code",
      text: `Your Mercado verification code is ${code}. It expires in 10 minutes and works once. If you did not request it, ignore this email.`,
    }),
  });
  if (!r.ok)
    throw Object.assign(Error("Email delivery is temporarily unavailable."), {
      status: 503,
    });
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  try {
    const url = new URL(req.url, origin()),
      route = url.pathname.replace(/^\/api\/?/, "");
 if(route==='roles-feed')return handleRoleFeed(req,res);
    let body = req.body || {};
    if (typeof body === "string") {
      if (
        body.length >
        (["admin/image", "images"].includes(route) ? 1500000 : 16000)
      )
        return json(res, 413, { error: "Request too large" });
      try {
        body = JSON.parse(body);
      } catch {
        return json(res, 400, { error: "Invalid JSON" });
      }
    }
    if (
      JSON.stringify(body).length >
      (["admin/image", "images"].includes(route) ? 1500000 : 16000)
    )
      return json(res, 413, { error: "Request too large" });
    if (route === "image" && req.method === "GET") {
      const id = url.searchParams.get("id");
      if (!uuid(id)) return json(res, 400, { error: "Invalid image" });
      const [m] =
        await sql()`SELECT mime,data FROM marcada.media WHERE id=${id}`;
      if (!m) return json(res, 404, { error: "Image not found" });
      res.setHeader("Content-Type", m.mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.status(200).end(Buffer.from(m.data, "base64"));
    }
    if (route === "health" && req.method === "GET") {
      await sql()`SELECT 1 FROM marcada.products LIMIT 1`;
      return json(res, 200, { ok: true });
    }
    if (route === "maintenance" && req.method === "GET") {
      if (
        !process.env.CRON_SECRET ||
        req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
      )
        return json(res, 401, { error: "Unauthorized" });
      for (const t of [
        "sessions",
        "auth_tokens",
        "email_challenges",
        "rate_limits",
      ])
        await sql().query(`DELETE FROM marcada.${t} WHERE expires_at<now()`);
      await retryNotifications(sql());
      await retryWorkflows(sql());
      return json(res, 200, { ok: true });
    }
    if (route === "catalog" && req.method === "GET") {
      const u = await user(req);
      const [products, offers, items] = await Promise.all([
        sql()`SELECT * FROM marcada.products WHERE active ORDER BY CASE WHEN id='bitaxe' THEN 0 ELSE 1 END,name`,
        sql()`SELECT o.id,o.product_id,o.item_id,o.dealer,o.price,o.currency,o.private,o.expires_at FROM marcada.offers o WHERE o.active AND (o.expires_at IS NULL OR o.expires_at>now()) AND (NOT o.private OR ${u?.canDeals || false} OR EXISTS(SELECT 1 FROM marcada.offer_grants g WHERE g.offer_id=o.id AND g.identity=${u?.identity || ""}))`,
        sql()`SELECT * FROM marcada.items WHERE active ORDER BY product_id,name`,
      ]);
      return json(res, 200, {
        products,
        offers,
        items,
        commerce: { checkout: false, delivery: false },
      });
    }
    if (route === "go" && req.method === "GET") {
      const id = url.searchParams.get("id");
      if (!uuid(id)) return json(res, 400, { error: "Invalid offer" });
      const u = await user(req);
      const [o] =
        await sql()`SELECT o.url FROM marcada.offers o WHERE o.id=${id} AND o.active AND (o.expires_at IS NULL OR o.expires_at>now()) AND (NOT o.private OR ${u?.canDeals || false} OR EXISTS(SELECT 1 FROM marcada.offer_grants g WHERE g.offer_id=o.id AND g.identity=${u?.identity || ""}))`;
      if (!o) return json(res, 404, { error: "Offer unavailable" });
      res.setHeader("Location", dealerUrl(o.url));
      return res.status(302).end();
    }
    if (req.method !== "GET" && req.headers.origin !== origin())
      return json(res, 403, { error: "Request origin rejected" });
    if (route === "auth/email" && req.method === "POST") {
      await limited(req, "email", 5);
      const identity = normalizeIdentity(body.email);
      if (!identity.includes("@"))
        return json(res, 400, { error: "Enter an email address" });
      await limited(
        { headers: { "x-forwarded-for": identity } },
        "email-identity",
        5,
      );
      const challenge = token();
      if (true) {
        const code = String(randomInt(100000000)).padStart(8, "0");
        await sql()`DELETE FROM marcada.email_challenges WHERE identity=${identity}`;
        await sql()`INSERT INTO marcada.email_challenges(hash,identity,code_hash,expires_at) VALUES(${hash(challenge)},${identity},${hash(challenge + ":" + code)},now()+interval '10 minutes')`;
        await sendCode(identity, code);
      }
      return json(res, 200, {
        challenge,
        message: "A verification code has been sent.",
      });
    }
    if (route === "auth/verify-email" && req.method === "POST") {
      await limited(req, "verify-email", 30);
      const challenge = String(body.challenge || ""),
        code = String(body.code || "");
      if (!/^[a-f0-9]{64}$/.test(challenge) || !/^[0-9]{8}$/.test(code))
        return json(res, 401, { error: "Invalid or expired code" });
      const [attempt] =
        await sql()`UPDATE marcada.email_challenges SET attempts=attempts+1 WHERE hash=${hash(challenge)} AND attempts<5 AND expires_at>now() RETURNING code_hash`;
      if (!attempt || attempt.code_hash !== hash(challenge + ":" + code))
        return json(res, 401, { error: "Invalid or expired code" });
      const [record] =
        await sql()`DELETE FROM marcada.email_challenges WHERE hash=${hash(challenge)} AND code_hash=${hash(challenge + ":" + code)} AND attempts<=5 AND expires_at>now() RETURNING identity`;
      if (!record) return json(res, 401, { error: "Invalid or expired code" });
      await session(res, record.identity);
      await audit(record.identity, "sign_in", "email_code");
      return json(res, 200, { ok: true });
    }
    if (route === "auth/consume" && req.method === "POST") {
      await limited(req, "consume", 20);
      const [t] =
        await sql()`DELETE FROM marcada.auth_tokens WHERE hash=${hash(String(body.token || ""))} AND kind='email' AND expires_at>now() RETURNING identity`;
      if (!t)
        return json(res, 401, {
          error: "This link is invalid or expired. Request a new one.",
        });
      await session(res, t.identity);
      await audit(t.identity, "sign_in", "email");
      return json(res, 200, { ok: true });
    }
    if (route === "auth/nonce" && req.method === "POST") {
      await limited(req, "nonce", 20);
      const nonce = token();
      await sql()`INSERT INTO marcada.auth_tokens(hash,identity,kind,expires_at) VALUES(${hash(nonce)},'', 'siwe',now()+interval '5 minutes')`;
      setCookie(res, "__Host-mercado-nonce", nonce, 300);
      return json(res, 200, {
        nonce,
        domain: new URL(origin()).host,
        uri: origin(),
      });
    }
    if (route === "auth/wallet" && req.method === "POST") {
      await limited(req, "wallet", 20);
      const nonce = cookie(req, "__Host-mercado-nonce");
      const message = String(body.message || "");
      if (message.length > 3000 || !nonce)
        return json(res, 401, { error: "Request a new wallet challenge" });
      const parsed = parseSiweMessage(message);
      if (
        parsed.nonce !== nonce ||
        parsed.domain !== new URL(origin()).host ||
        parsed.uri !== origin() ||
        parsed.chainId !== 1 ||
        !parsed.issuedAt ||
        Math.abs(Date.now() - parsed.issuedAt.getTime()) > 300000
      )
        return json(res, 401, { error: "Invalid wallet challenge" });
      const [challenge] =
        await sql()`SELECT 1 FROM marcada.auth_tokens WHERE hash=${hash(nonce)} AND kind='siwe' AND expires_at>now()`;
      if (!challenge)
        return json(res, 401, { error: "Wallet challenge expired" });
      const client = createPublicClient({
        chain: mainnet,
        transport: http(
          process.env.ETH_RPC_URL || "https://ethereum-rpc.publicnode.com",
        ),
      });
      if (
        !(await client.verifySiweMessage({
          message,
          signature: body.signature,
          domain: new URL(origin()).host,
          nonce,
        }))
      )
        return json(res, 401, { error: "Wallet signature rejected" });
      const identity = normalizeIdentity(parsed.address);
      const consumed =
        await sql()`DELETE FROM marcada.auth_tokens WHERE hash=${hash(nonce)} AND kind='siwe' AND expires_at>now() RETURNING hash`;
      if (!consumed.length)
        return json(res, 401, { error: "Challenge already used" });
      await session(res, identity);
      await audit(identity, "sign_in", "wallet");
      return json(res, 200, { ok: true });
    }
    if (route === "auth/logout" && req.method === "POST") {
      await sql()`DELETE FROM marcada.sessions WHERE hash=${hash(cookie(req, "__Host-mercado"))}`;
      setCookie(res, "__Host-mercado", "", 0);
      return json(res, 200, { ok: true });
    }
    const u = await user(req);
    if (!u) return json(res, 401, { error: "Sign in to continue" });
    if (route === "referrals/new" && req.method === "POST") {
      await limited(req, "referral-code", 5);
      const code =
        body.code === undefined
          ? token().slice(0, 16)
          : customReferralCode(body.code);
      const db = sql();
      if (code === u.referral) return json(res, 200, { referral: code });
      const taken =
        await db`SELECT 1 FROM marcada.users WHERE referral=${code} UNION SELECT 1 FROM marcada.referral_codes WHERE code=${code}`;
      if (taken.length)
        return json(res, 409, {
          error: "That code is already in use. Choose another.",
        });
      try {
        await db.transaction([
          db`INSERT INTO marcada.referral_codes(code,identity) SELECT referral,identity FROM marcada.users WHERE identity=${u.identity} ON CONFLICT(code) DO NOTHING`,
          db`INSERT INTO marcada.referral_codes(code,identity) VALUES(${code},${u.identity})`,
          db`UPDATE marcada.users SET referral=${code} WHERE identity=${u.identity}`,
          db`INSERT INTO marcada.audit(id,actor,action,detail) VALUES(${randomUUID()},${u.identity},'new_referral_code',${code})`,
        ]);
      } catch (error) {
        if (error.code === "23505")
          return json(res, 409, {
            error: "That code is already in use. Choose another.",
          });
        throw error;
      }
      return json(res, 201, { referral: code });
    }
    if (route === "notifications" && req.method === "GET") {
      const id = url.searchParams.get("id");
      if (id && !uuid(id))
        return json(res, 400, { error: "Invalid notification" });
      const notifications =
        await sql()`SELECT n.id,n.type,n.created_at FROM marcada.account_notifications n WHERE n.recipient=${u.identity} AND (${id}::uuid IS NULL OR n.id=${id}::uuid) AND (n.type<>'private_offer' OR EXISTS(SELECT 1 FROM marcada.offers o WHERE o.id::text=n.aggregate_id AND o.active AND (o.expires_at IS NULL OR o.expires_at>now()) AND (NOT o.private OR ${u.canDeals} OR EXISTS(SELECT 1 FROM marcada.offer_grants g WHERE g.offer_id=o.id AND g.identity=${u.identity})))) ORDER BY n.created_at DESC LIMIT 100`;
      if (id && !notifications.length)
        return json(res, 404, {
          error: "Notification unavailable for this account",
        });
      return json(res, 200, { notifications });
    }
    if (
      (route === "images" || route === "admin/image") &&
      req.method === "POST"
    ) {
      const purpose = route === "admin/image" ? "product" : body.purpose;
      if (!["product", "profile"].includes(purpose))
        return json(res, 400, { error: "Choose a product or profile image." });
      if (purpose === "product" && !u.canProducts && !u.vendor)
        return json(res, 403, { error: "Vendor or catalog access required." });
      if (route === "admin/image" && !u.canProducts)
        return json(res, 403, { error: "Product manager access required." });
      await limited(req, "image-upload:" + u.identity, 10);
      const [count] =
        await sql()`SELECT count(*)::int AS n FROM marcada.ipfs_uploads WHERE identity=${u.identity} AND created_at>now()-interval '1 day'`;
      if (count.n >= 20)
        return json(res, 429, {
          error: "Daily image upload limit reached. Try again tomorrow.",
        });
      const image = await prepareImage(body.image);
      const pinned = await publishImage(image);
      const [saved] =
        await sql()`INSERT INTO marcada.ipfs_uploads(id,identity,purpose,cid,url,mime,bytes) VALUES(${randomUUID()},${u.identity},${purpose},${pinned.cid},${pinned.url},${image.mime},${image.bytes}) ON CONFLICT(identity,purpose,cid) DO UPDATE SET url=EXCLUDED.url RETURNING id`;
      await audit(u.identity, "upload_ipfs_image", saved.id);
      return json(res, 201, { id: saved.id, ...pinned });
    }
    if (route === "profile/image" && req.method === "POST") {
      let uploaded = null;
      if (body.upload_id !== null) {
        if (!uuid(body.upload_id))
          return json(res, 400, { error: "Choose an uploaded profile image." });
        [uploaded] =
          await sql()`SELECT url,cid FROM marcada.ipfs_uploads WHERE id=${body.upload_id} AND identity=${u.identity} AND purpose='profile'`;
        if (!uploaded)
          return json(res, 404, {
            error: "Profile image not found for this account.",
          });
      }
      await sql()`UPDATE marcada.users SET avatar_url=${uploaded?.url || null},avatar_cid=${uploaded?.cid || null} WHERE identity=${u.identity}`;
      return json(res, 200, {
        avatar_url: uploaded?.url || null,
        avatar_cid: uploaded?.cid || null,
      });
    }
    if (route === "preferences" && req.method === "POST") {
      if (!["dark", "light"].includes(body.theme))
        return json(res, 400, { error: "Choose light or dark mode." });
      await sql()`UPDATE marcada.users SET theme=${body.theme},theme_updated_at=now() WHERE identity=${u.identity}`;
      return json(res, 200, { theme: body.theme });
    }
    if (route === "me" && req.method === "GET") {
      const quotes =
        await sql()`SELECT q.*,p.name,i.name AS item_name,(SELECT to_jsonb(qp)-'created_by' FROM marcada.quote_proposals qp WHERE qp.quote_id=q.id AND qp.version=q.proposal_version) AS proposal FROM marcada.quotes q JOIN marcada.products p ON p.id=q.product_id LEFT JOIN marcada.items i ON i.id=q.item_id WHERE q.identity=${u.identity} ORDER BY q.created_at DESC LIMIT 100`;
      return json(res, 200, { user: u, quotes });
    }
    if (route === "quotes" && req.method === "POST") {
      await limited(req, "quote", 10);
      const product = textField(body.product, 80),
        quantity = Number(body.quantity),
        details = textField(body.details);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000)
        return json(res, 400, { error: "Quantity must be from 1 to 10,000" });
      if (
        !(
          await sql()`SELECT 1 FROM marcada.products WHERE id=${product} AND active`
        ).length
      )
        return json(res, 400, { error: "Unknown product" });
      const itemId = body.item_id || null;
      if (
        itemId &&
        !(
          await sql()`SELECT 1 FROM marcada.items WHERE id=${itemId} AND product_id=${product} AND active`
        ).length
      )
        return json(res, 400, {
          error: "Choose an available product in this collection",
        });
      const referral = String(body.referral || "")
        .trim()
        .toLowerCase();
      if (referral && !validReferralCode(referral))
        return json(res, 400, {
          error:
            "Enter a valid member referral code (4–32 letters, numbers or hyphens), or clear the field.",
        });
      if (referral && referral === u.referral)
        return json(res, 400, {
          error: "You cannot use your own referral code.",
        });
      const [ref] = referral
        ? await sql()`SELECT referral,identity FROM marcada.users WHERE referral=${referral} UNION SELECT code AS referral,identity FROM marcada.referral_codes WHERE code=${referral}`
        : [];
      if (ref?.identity === u.identity)
        return json(res, 400, {
          error: "You cannot use your own referral code.",
        });
      if (referral && !ref)
        return json(res, 400, {
          error: "Referral code not found. Check the code or clear the field.",
        });
      const requestKey = body.request_key || randomUUID();
      if (!uuid(requestKey))
        return json(res, 400, { error: "Invalid request identifier" });
      const offerId = body.offer_id || null;
      if (offerId && !uuid(offerId))
        return json(res, 400, { error: "Invalid offer" });
      const requestHash = hash(
        JSON.stringify({
          product,
          itemId,
          quantity,
          details,
          referral,
          offerId,
        }),
      );
      const [prior] =
        await sql()`SELECT id,request_hash FROM marcada.quotes WHERE identity=${u.identity} AND request_key=${requestKey}`;
      if (prior)
        return prior.request_hash === requestHash
          ? json(res, 200, { id: prior.id, replayed: true })
          : json(res, 409, {
              error:
                "This request identifier was already used for different details.",
            });
      if (
        ref &&
        (ref.identity === u.linkedWallet || ref.identity === u.linkedEmail)
      )
        return json(res, 400, {
          error: "You cannot use a referral from your linked account.",
        });
      const id = randomUUID();
      const [label] = ref
        ? await sql()`SELECT p.name AS collection_name,i.name AS item_name FROM marcada.products p LEFT JOIN marcada.items i ON i.id=${itemId} WHERE p.id=${product}`
        : [];
      const settings = ref ? await notificationSettings(sql()) : null;
      const message =
        ref && settings.enabled
          ? referralMessage(
              {
                id,
                identity: u.identity,
                product: label.collection_name,
                item: label.item_name,
                quantity,
                details,
                referral: ref.referral,
                referrer: ref.identity,
                submitted: new Date().toISOString(),
              },
              settings.recipient,
              process.env.MAIL_FROM,
              origin(),
            )
          : null;
      const db = sql();
      const writes = [
        db`INSERT INTO marcada.quotes(id,identity,product_id,quantity,details,referral,item_id,request_key,request_hash,offer_id,offer_snapshot) SELECT ${id},${u.identity},${product},${quantity},${details},${ref?.referral || null},${itemId},${requestKey},${requestHash},${offerId}::uuid,(SELECT jsonb_build_object('dealer',o.dealer,'price',o.price,'currency',o.currency,'expires_at',o.expires_at) FROM marcada.offers o WHERE o.id=${offerId}::uuid) WHERE ${offerId}::uuid IS NULL OR EXISTS(SELECT 1 FROM marcada.offers o WHERE o.id=${offerId}::uuid AND o.product_id=${product} AND (o.item_id IS NULL OR o.item_id=${itemId}) AND o.active AND (o.expires_at IS NULL OR o.expires_at>now()) AND (NOT o.private OR ${u.canDeals} OR EXISTS(SELECT 1 FROM marcada.offer_grants g WHERE g.offer_id=o.id AND g.identity=${u.identity}))) ON CONFLICT(identity,request_key) DO NOTHING RETURNING id`,
      ];
      if (message)
        writes.push(
          db`INSERT INTO marcada.referral_notifications(quote_id,payload) SELECT ${id},${JSON.stringify(message)}::jsonb WHERE EXISTS(SELECT 1 FROM marcada.quotes WHERE id=${id})`,
        );
      if (ref)
        writes.push(
          db`INSERT INTO marcada.account_notifications(id,recipient,type,aggregate_id,event_key) SELECT ${randomUUID()},${ref.identity},'referral_activity',${id},${"referral/" + id} WHERE EXISTS(SELECT 1 FROM marcada.quotes WHERE id=${id}) ON CONFLICT(event_key) DO NOTHING`,
        );
      writes.push(
        workflowInsert(db, {
          key: "quote/" + id,
          kind: "quote_received",
          quoteId: id,
          summary: `Quote ${id} · collection ${product} · product ${itemId || "not selected"} · quantity ${quantity}. Review requirements and download the supplier request brief in Mercado.`,
          path: "/admin/quotes",
        }),
      );
      const result = await db.transaction(writes);
      if (!result[0].length) {
        const [existing] =
          await db`SELECT id,request_hash FROM marcada.quotes WHERE identity=${u.identity} AND request_key=${requestKey}`;
        if (existing)
          return existing.request_hash === requestHash
            ? json(res, 200, { id: existing.id, replayed: true })
            : json(res, 409, {
                error:
                  "This request identifier was already used for different details.",
              });
        return json(res, 404, {
          error:
            "Offer unavailable for this account or product. Refresh and request a current quote.",
        });
      }
      if (message) {
        try {
          await deliverNotification(db, id);
        } catch {
          /* Persisted quote and outbox remain recoverable. */
        }
      }
      try {
        await deliverWorkflow(db, "quote/" + id);
      } catch {}
      return json(res, 201, { id });
    }
    if (route === "quote-accept" && req.method === "POST") {
      if (
        !uuid(body.id) ||
        !Number.isInteger(body.version) ||
        body.confirm !== true
      )
        return json(res, 400, {
          error: "Confirm the quote version and terms.",
        });
      const [accepted] =
        await sql()`WITH accepted AS (UPDATE marcada.quotes q SET accepted_proposal_version=${body.version} WHERE q.id=${body.id} AND q.identity=${u.identity} AND q.status='quoted' AND q.proposal_version=${body.version} AND EXISTS(SELECT 1 FROM marcada.quote_proposals qp WHERE qp.quote_id=q.id AND qp.version=q.proposal_version AND (qp.expires_at>now() OR qp.accepted_at IS NOT NULL)) AND (q.offer_id IS NULL OR EXISTS(SELECT 1 FROM marcada.offers o WHERE o.id=q.offer_id AND o.active AND (o.expires_at IS NULL OR o.expires_at>now()) AND (NOT o.private OR ${u.canDeals} OR EXISTS(SELECT 1 FROM marcada.offer_grants g WHERE g.offer_id=o.id AND g.identity=${u.identity})))) RETURNING q.id,q.proposal_version) UPDATE marcada.quote_proposals qp SET accepted_at=coalesce(qp.accepted_at,now()) FROM accepted WHERE qp.quote_id=accepted.id AND qp.version=accepted.proposal_version RETURNING qp.version,qp.accepted_at`;
      if (!accepted)
        return json(res, 409, {
          error:
            "This quote is unavailable, expired or replaced. Refresh to review the latest version.",
        });
      return json(res, 200, { accepted });
    }
    if (route === "auth/link-nonce" && req.method === "POST") {
      if (!u.identity.includes("@"))
        return json(res, 400, {
          error: "Sign in by email before linking a wallet",
        });
      await limited(req, "link-wallet", 10);
      const nonce = token();
      await sql()`INSERT INTO marcada.auth_tokens(hash,identity,kind,expires_at) VALUES(${hash(nonce)},${u.identity},'link',now()+interval '5 minutes')`;
      setCookie(res, "__Host-mercado-link", nonce, 300);
      return json(res, 200, {
        nonce,
        domain: new URL(origin()).host,
        uri: origin(),
        statement: `Link this Ethereum wallet to Mercado email account ${u.identity}.`,
      });
    }
    if (route === "auth/link-wallet" && req.method === "POST") {
      if (!u.identity.includes("@"))
        return json(res, 400, { error: "Use your verified email account" });
      await limited(req, "link-verify", 15);
      const nonce = cookie(req, "__Host-mercado-link"),
        message = String(body.message || "");
      if (!nonce || message.length > 3000)
        return json(res, 401, { error: "Request a new linking challenge" });
      const parsed = parseSiweMessage(message);
      if (
        parsed.nonce !== nonce ||
        parsed.domain !== new URL(origin()).host ||
        parsed.uri !== origin() ||
        parsed.chainId !== 1 ||
        parsed.statement !==
          `Link this Ethereum wallet to Mercado email account ${u.identity}.` ||
        !parsed.issuedAt ||
        Math.abs(Date.now() - parsed.issuedAt.getTime()) > 300000
      )
        return json(res, 401, { error: "Invalid linking challenge" });
      const [challenge] =
        await sql()`SELECT 1 FROM marcada.auth_tokens WHERE hash=${hash(nonce)} AND identity=${u.identity} AND kind='link' AND expires_at>now()`;
      if (!challenge)
        return json(res, 401, { error: "Linking challenge expired" });
      const client = createPublicClient({
        chain: mainnet,
        transport: http(
          process.env.ETH_RPC_URL || "https://ethereum-rpc.publicnode.com",
        ),
      });
      if (
        !(await client.verifySiweMessage({
          message,
          signature: body.signature,
          domain: new URL(origin()).host,
          nonce,
        }))
      )
        return json(res, 401, { error: "Wallet signature rejected" });
      const wallet = normalizeIdentity(parsed.address);
      const consumed =
        await sql()`DELETE FROM marcada.auth_tokens WHERE hash=${hash(nonce)} AND identity=${u.identity} AND kind='link' AND expires_at>now() RETURNING hash`;
      if (!consumed.length)
        return json(res, 401, { error: "Challenge already used" });
      const inserted =
        await sql()`INSERT INTO marcada.identity_links(email,wallet) VALUES(${u.identity},${wallet}) ON CONFLICT DO NOTHING RETURNING email`;
      if (!inserted.length)
        return json(res, 409, {
          error:
            "This email or wallet is already linked. Unlink the existing connection first.",
        });
      await audit(u.identity, "link_wallet", wallet);
      return json(res, 200, { ok: true });
    }
    if (route === "auth/unlink-wallet" && req.method === "POST") {
      if (!u.identity.includes("@"))
        return json(res, 400, {
          error: "Use your verified email account to unlink",
        });
      await sql()`DELETE FROM marcada.identity_links WHERE email=${u.identity}`;
      await sql()`DELETE FROM marcada.auth_tokens WHERE identity=${u.identity} AND kind='link'`;
      await audit(u.identity, "unlink_wallet", "self");
      return json(res, 200, { ok: true });
    }
    if (!u.staff)
      return json(res, u.governanceStatus === "unavailable" ? 503 : 403, {
        error:
          u.governanceStatus === "unavailable"
            ? "Governance access is temporarily unavailable. Try again shortly."
            : "Staff access required",
      });
    if (
      (route.startsWith("admin/role") || route === "admin/notifications") &&
      !u.owner
    )
      return json(res, 403, { error: "Owner access required" });
    if (
      (route.startsWith("admin/offer") || route === "admin/grant") &&
      !u.canDeals
    )
      return json(res, 403, { error: "Dealer manager access required" });
    if (
      ["admin/quote", "admin/notification-retry", "admin/proposal"].includes(
        route,
      ) &&
      !u.canQuotes
    )
      return json(res, 403, { error: "Quote manager access required" });
    if ((route.startsWith("admin/item") || route === "admin/image") && !u.canProducts)
      return json(res, 403, { error: "Product manager access required" });
    if (route === "admin/workflow-rule" && req.method === "POST") {
      if (!u.owner) return json(res, 403, { error: "Owner access required" });
      const r = workflowRule(body);
      if (r.enabled && (!process.env.MAIL_FROM || !process.env.RESEND_API_KEY))
        return json(res, 400, {
          error:
            "Configure the verified email sender before enabling this rule.",
        });
      await sql()`UPDATE marcada.workflow_rules SET recipient=${r.recipient},enabled=${r.enabled},updated_at=now() WHERE kind=${r.kind}`;
      await audit(u.identity, "workflow_rule", r.kind);
      return json(res, 200, { ok: true });
    }
    if (route === "admin/workflow-retry" && req.method === "POST") {
      if (!u.owner) return json(res, 403, { error: "Owner access required" });
      await limited(req, "workflow-retry", 10);
      return json(
        res,
        200,
        await deliverWorkflow(sql(), textField(body.event_key, 200)),
      );
    }
    if (route === "admin/supplier-brief" && req.method === "POST") {
      if (!u.canQuotes)
        return json(res, 403, { error: "Quote manager access required" });
      if (!uuid(body.id)) return json(res, 400, { error: "Invalid quote" });
      const [q] =
        await sql()`SELECT q.id,q.item_id,q.quantity,p.name,i.name AS item_name FROM marcada.quotes q JOIN marcada.products p ON p.id=q.product_id LEFT JOIN marcada.items i ON i.id=q.item_id WHERE q.id=${body.id}`;
      if (!q) return json(res, 404, { error: "Quote not found" });
      await audit(u.identity, "export_supplier_brief", q.id);
      return json(res, 200, { brief: supplierBrief(q) });
    }
    if (route === "admin/product-submission" && req.method === "POST") {
      if (!u.vendor && !u.canProducts)
        return json(res, 403, { error: "Vendor or catalog access required" });
      await limited(req, "product-submission", 20);
      const id = body.id || randomUUID(),
        itemId = body.item_id || null,
        revision = body.revision || 0;
      if (!uuid(id) || !Number.isInteger(revision) || revision < 0)
        return json(res, 400, { error: "Invalid submission revision" });
      const proposed = submissionInput(body);
      if (
        !(
          await sql()`SELECT 1 FROM marcada.products WHERE id=${proposed.product_id} AND active`
        ).length
      )
        return json(res, 400, { error: "Unknown collection" });
      if (
        itemId &&
        !(
          await sql()`SELECT 1 FROM marcada.items WHERE id=${itemId} AND active`
        ).length
      )
        return json(res, 400, { error: "Unknown product" });
      const db = sql(),
        mutation = randomUUID(),
        key = "product/" + id + "/" + (revision + 1);
      const results = await db.transaction([
        submissionWrite(db, {
          id,
          identity: u.identity,
          itemId,
          proposed,
          mutation,
          revision,
        }),
        workflowInsert(db, {
          key,
          kind: "product_submitted",
          submissionId: id,
          revision: revision + 1,
          identity: u.identity,
          mutation,
          summary:
            "A product submission is ready for catalog review. Details remain in the authenticated review queue.",
          path: "/admin/submissions",
        }),
      ]);
      if (!results[0].length)
        return json(res, 409, {
          error:
            "Submission changed or belongs to another account. Reload before editing.",
        });
      await audit(u.identity, "submit_product", id);
      try {
        await deliverWorkflow(db, key);
      } catch {}
      return json(res, 200, results[0][0]);
    }
    if (route === "admin/product-submission-review" && req.method === "POST") {
      if (!u.canProducts)
        return json(res, 403, { error: "Catalog access required" });
      if (
        !uuid(body.id) ||
        !Number.isInteger(body.revision) ||
        !["reviewed", "changes_requested"].includes(body.status)
      )
        return json(res, 400, { error: "Invalid review" });
      const note = String(body.note || "").slice(0, 2000);
      if (body.status === "changes_requested" && !note.trim())
        return json(res, 400, {
          error: "Explain what the vendor needs to change.",
        });
      const saved =
        await sql()`UPDATE marcada.product_submissions SET status=${body.status},review_note=${note},updated_at=now() WHERE id=${body.id} AND revision=${body.revision} AND status='submitted' RETURNING id`;
      if (!saved.length)
        return json(res, 409, {
          error: "Submission changed. Reload before reviewing.",
        });
      await audit(u.identity, "review_product", body.id + ":" + body.status);
      return json(res, 200, { ok: true });
    }
    if (route === "admin/item-history" && req.method === "GET") {
      const id = url.searchParams.get("id");
      const events = await sql()`SELECT actor,action,created_at FROM marcada.audit WHERE detail=${id} AND action IN ('save_product','publish_product','unpublish_product') ORDER BY created_at DESC LIMIT 100`;
      return json(res, 200, { events });
    }
    if (route === "admin/item-visibility" && req.method === "POST") {
      const change = visibilityInput(body);
      const result = await sql()`WITH requested AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(change.items)}::jsonb) AS r(id text, active boolean)
      ), locked AS MATERIALIZED (
        SELECT i.id,i.active FROM marcada.items i JOIN requested r ON r.id=i.id FOR UPDATE OF i
      ), eligible AS (
        SELECT l.id FROM locked l JOIN requested r ON r.id=l.id WHERE l.active=r.active
      ), changed AS (
        UPDATE marcada.items i SET active=${change.active},updated_at=now()
        WHERE i.id IN (SELECT id FROM eligible) AND (SELECT count(*) FROM eligible)=${change.items.length}
        RETURNING i.id,i.active
      ), logged AS (
        INSERT INTO marcada.audit(id,actor,action,detail)
        SELECT gen_random_uuid(),${u.identity},${change.active ? 'publish_product' : 'unpublish_product'},id FROM changed
      ) SELECT * FROM changed`;
      if (result.length !== change.items.length) return json(res, 409, { error: "A product changed or is unavailable. Refresh and try again; no products were changed." });
      return json(res, 200, { items: result });
    }
    if (route === "admin/item" && req.method === "POST") {
      const p = itemInput(body);
      if (
        !(
          await sql()`SELECT 1 FROM marcada.products WHERE id=${p.product_id} AND active`
        ).length
      )
        return json(res, 400, { error: "Unknown collection" });
      const saved =
        await sql()`WITH saved AS (INSERT INTO marcada.items(id,product_id,name,description,price,currency,price_kind,price_checked,source_url,source_name,image_url,image_credit,hashrate,model_group,specifications,active,supplier_region,tax_note,configuration_note,supplier_status) VALUES(${p.id},${p.product_id},${p.name},${p.description},${p.price},${p.currency},${p.price_kind},${p.price_checked},${p.source_url},${p.source_name},${p.image_url},${p.image_credit},${p.hashrate || ""},${p.model_group || ""},${p.specifications},${p.active},${p.supplier_region},${p.tax_note},${p.configuration_note},${p.supplier_status}) ON CONFLICT(id) DO UPDATE SET product_id=EXCLUDED.product_id,name=EXCLUDED.name,description=EXCLUDED.description,price=EXCLUDED.price,currency=EXCLUDED.currency,price_kind=EXCLUDED.price_kind,price_checked=EXCLUDED.price_checked,source_url=EXCLUDED.source_url,source_name=EXCLUDED.source_name,image_url=EXCLUDED.image_url,image_credit=EXCLUDED.image_credit,hashrate=EXCLUDED.hashrate,model_group=EXCLUDED.model_group,specifications=EXCLUDED.specifications,active=EXCLUDED.active,supplier_region=EXCLUDED.supplier_region,tax_note=EXCLUDED.tax_note,configuration_note=EXCLUDED.configuration_note,supplier_status=EXCLUDED.supplier_status,updated_at=now() WHERE ${body.create_only !== true} AND (${body.expected_updated_at || null}::timestamptz IS NULL OR marcada.items.updated_at=${body.expected_updated_at || null}::timestamptz) RETURNING *,updated_at::text AS edit_version), logged AS (INSERT INTO marcada.audit(id,actor,action,detail) SELECT gen_random_uuid(),${u.identity},'save_product',id FROM saved) SELECT * FROM saved`;
      if (!saved.length)
        return json(res, 409, {
          error:
            "Product already exists or was changed by another editor. Reload before saving, or use a new ID.",
        });
      return json(res, 200, { id: p.id, item: saved[0] });
    }
    if (route === "admin/role" && req.method === "POST") {
      const identity = normalizeIdentity(body.identity);
      if (isAdmin(identity))
        return json(res, 400, { error: "Owner access is protected" });
      if (![...localRoles, "customer"].includes(body.role))
        return json(res, 400, { error: "Invalid role" });
      if (body.role === "customer")
        await sql()`DELETE FROM marcada.roles WHERE identity=${identity}`;
      else
        await sql()`INSERT INTO marcada.roles(identity,role) VALUES(${identity},${body.role}) ON CONFLICT(identity) DO UPDATE SET role=EXCLUDED.role`;
      await audit(u.identity, "set_role", identity + ":" + body.role);
      return json(res, 200, { ok: true });
    }
    if (route === "admin/vendor" && req.method === "POST") {
      if (!u.canVendors && !u.vendor)
        return json(res, 403, { error: "Vendor access required" });
      const identity = u.canVendors
        ? normalizeIdentity(body.identity)
        : u.identity;
      if (
        u.vendor &&
        body.identity &&
        normalizeIdentity(body.identity) !== u.identity
      )
        return json(res, 403, {
          error: "You can only manage your own integration",
        });
      const name = textField(body.name, 160),
        website = dealerUrl(body.website),
        contact = normalizeIdentity(body.contact_email);
      if (!contact.includes("@"))
        return json(res, 400, { error: "Use a contact email address" });
      const feed = body.feed_url ? dealerUrl(body.feed_url) : "",
        format = String(body.feed_format || "manual"),
        status = String(body.status || "draft");
      if (
        !["csv", "json", "manual"].includes(format) ||
        !["draft", "submitted", "approved", "paused"].includes(status)
      )
        return json(res, 400, {
          error: "Invalid integration format or status",
        });
      if (u.vendor && !["draft", "submitted"].includes(status))
        return json(res, 403, {
          error: "Only a vendor manager can approve or pause integrations",
        });
      if (format !== "manual" && !feed)
        return json(res, 400, {
          error: "Enter a feed URL or select manual integration",
        });
      const notes = String(body.notes || "").slice(0, 2000);
      const db = sql();
      const vendorWrites = [
        db`INSERT INTO marcada.vendor_integrations(identity,name,website,contact_email,feed_url,feed_format,notes,status) VALUES(${identity},${name},${website},${contact},${feed},${format},${notes},${status}) ON CONFLICT(identity) DO UPDATE SET name=EXCLUDED.name,website=EXCLUDED.website,contact_email=EXCLUDED.contact_email,feed_url=EXCLUDED.feed_url,feed_format=EXCLUDED.feed_format,notes=EXCLUDED.notes,status=EXCLUDED.status,updated_at=now()`,
      ];
      const eventKey =
        "vendor/" +
        hash(
          JSON.stringify([
            identity,
            name,
            website,
            contact,
            feed,
            format,
            notes,
            status,
          ]),
        );
      if (status === "submitted")
        vendorWrites.push(
          workflowInsert(db, {
            key: eventKey,
            kind: "vendor_submitted",
            summary:
              "A vendor integration is ready for review. Open the vendor queue to inspect the submitted business details and feed.",
            path: "/admin/vendors",
          }),
        );
      await db.transaction(vendorWrites);
      if (status === "submitted")
        try {
          await deliverWorkflow(db, eventKey);
        } catch {}
      await audit(u.identity, "save_vendor_integration", identity);
      return json(res, 200, { ok: true });
    }
    if (route === "admin" && req.method === "GET") {
      const pending = {
        user: u,
        workflowRules: u.owner
          ? sql()`SELECT * FROM marcada.workflow_rules ORDER BY kind`
          : [],
        workflowDeliveries: u.owner
          ? sql()`SELECT event_key,kind,status,attempts,created_at,payload->'to' AS recipients FROM marcada.workflow_outbox ORDER BY created_at DESC LIMIT 50`
          : [],
        productSubmissions: u.canProducts
          ? sql()`SELECT * FROM marcada.product_submissions ORDER BY updated_at DESC LIMIT 300`
          : u.vendor
            ? sql()`SELECT * FROM marcada.product_submissions WHERE identity=${u.identity} ORDER BY updated_at DESC LIMIT 100`
            : [],
        notificationSettings: u.owner ? notificationSettings(sql()) : null,
        items: u.canProducts
          ? sql()`SELECT *,updated_at::text AS edit_version FROM marcada.items ORDER BY product_id,name`
          : [],
        vendors: u.canVendors
          ? sql()`SELECT * FROM marcada.vendor_integrations ORDER BY name`
          : u.vendor
            ? sql()`SELECT * FROM marcada.vendor_integrations WHERE identity=${u.identity}`
            : [],
        governance: {
          source: "https://gov.bittrees.org",
          mapping:
            "Partner → Owner; Admin / Snapshot space admin → Administrator",
        },
        roles: u.owner
          ? sql()`SELECT identity,role FROM marcada.roles ORDER BY identity`
          : [],
        offers: u.canDeals
          ? sql()`SELECT o.*,COALESCE((SELECT json_agg(g.identity) FROM marcada.offer_grants g WHERE g.offer_id=o.id),'[]') AS recipients FROM marcada.offers o ORDER BY o.created_at DESC`
          : [],
        quotes: u.canQuotes
          ? sql()`SELECT q.*,p.name,i.name AS item_name,(SELECT to_jsonb(qp)-'created_by' FROM marcada.quote_proposals qp WHERE qp.quote_id=q.id AND qp.version=q.proposal_version) AS proposal,n.status AS notification_status FROM marcada.quotes q JOIN marcada.products p ON p.id=q.product_id LEFT JOIN marcada.items i ON i.id=q.item_id LEFT JOIN marcada.referral_notifications n ON n.quote_id=q.id ORDER BY q.created_at DESC LIMIT 500`
          : [],
      };
      const entries = await Promise.all(
        Object.entries(pending).map(async ([key, value]) => [key, await value]),
      );
      return json(res, 200, Object.fromEntries(entries));
    }
    if (route === "admin/offer" && req.method === "POST") {
      const id = uuid(body.id) ? body.id : randomUUID(),
        product = textField(body.product, 80),
        dealer = textField(body.dealer, 100),
        target = dealerUrl(body.url),
        notes = String(body.notes || "").slice(0, 3000),
        price =
          body.price === "" || body.price == null ? null : Number(body.price),
        currency = String(body.currency || "USD");
      if (
        (price !== null && (!Number.isFinite(price) || price < 0)) ||
        !["USD", "EUR", "GBP", "MXN", "CAD", "AUD"].includes(currency)
      )
        return json(res, 400, { error: "Invalid price or currency" });
      if (typeof body.private !== "boolean")
        return json(res, 400, { error: "Choose offer visibility" });
      const itemId = body.item_id || null;
      if (
        itemId &&
        !(
          await sql()`SELECT 1 FROM marcada.items WHERE id=${itemId} AND product_id=${product}`
        ).length
      )
        return json(res, 400, {
          error: "Product does not belong to this collection",
        });
      const expires = body.expires ? new Date(body.expires) : null;
      if (
        expires &&
        (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now())
      )
        return json(res, 400, { error: "Expiry must be in the future" });
      if (
        !(await sql()`SELECT 1 FROM marcada.products WHERE id=${product}`)
          .length
      )
        return json(res, 400, { error: "Unknown product" });
      await sql()`INSERT INTO marcada.offers(id,product_id,dealer,url,price,currency,private,notes,expires_at,item_id) VALUES(${id},${product},${dealer},${target},${price},${currency},${body.private},${notes},${expires?.toISOString() || null},${itemId}) ON CONFLICT(id) DO UPDATE SET product_id=EXCLUDED.product_id,dealer=EXCLUDED.dealer,url=EXCLUDED.url,price=EXCLUDED.price,currency=EXCLUDED.currency,private=EXCLUDED.private,notes=EXCLUDED.notes,expires_at=EXCLUDED.expires_at,item_id=EXCLUDED.item_id`;
      await audit(u.identity, "save_offer", id);
      return json(res, 200, { id });
    }
    if (route === "admin/offer-state" && req.method === "POST") {
      if (!uuid(body.id) || typeof body.active !== "boolean")
        return json(res, 400, { error: "Invalid offer" });
      await sql()`UPDATE marcada.offers SET active=${body.active} WHERE id=${body.id}`;
      await audit(u.identity, "offer_state", body.id);
      return json(res, 200, { ok: true });
    }
    if (route === "admin/grant" && req.method === "POST") {
      if (!uuid(body.id) || typeof body.remove !== "boolean")
        return json(res, 400, { error: "Invalid offer" });
      const identity = normalizeIdentity(body.identity);
      if (body.remove)
        await sql()`DELETE FROM marcada.offer_grants WHERE offer_id=${body.id} AND identity=${identity}`;
      else
        await sql()`WITH granted AS (INSERT INTO marcada.offer_grants(offer_id,identity) VALUES(${body.id},${identity}) ON CONFLICT DO NOTHING RETURNING offer_id) INSERT INTO marcada.account_notifications(id,recipient,type,aggregate_id,event_key) SELECT ${randomUUID()},${identity},'private_offer',${body.id},${"grant/" + randomUUID()} FROM granted`;
      await audit(
        u.identity,
        body.remove ? "revoke_offer" : "grant_offer",
        body.id,
      );
      return json(res, 200, { ok: true });
    }
    if (route === "admin/notifications" && req.method === "POST") {
      const recipient = String(body.recipient || "")
        .trim()
        .toLowerCase();
      if (
        typeof body.enabled !== "boolean" ||
        recipient.length > 254 ||
        (recipient && !/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(recipient)) ||
        (body.enabled && !recipient)
      )
        return json(res, 400, {
          error: "Choose an operations email before enabling notifications.",
        });
      await sql()`INSERT INTO marcada.notification_settings(id,recipient,enabled) VALUES('operations',${recipient},${body.enabled}) ON CONFLICT(id) DO UPDATE SET recipient=EXCLUDED.recipient,enabled=EXCLUDED.enabled,updated_at=now()`;
      await audit(
        u.identity,
        "notification_settings",
        body.enabled ? "enabled" : "disabled",
      );
      return json(res, 200, { ok: true });
    }
    if (route === "admin/proposal" && req.method === "POST") {
      if (!uuid(body.id)) return json(res, 400, { error: "Invalid quote" });
      const p = proposalInput(body);
      const [issued] =
        await sql()`WITH bumped AS (UPDATE marcada.quotes q SET proposal_version=proposal_version+1,status='quoted' WHERE q.id=${body.id} AND q.status<>'closed' AND q.accepted_proposal_version=0 AND NOT EXISTS(SELECT 1 FROM marcada.quote_proposals old WHERE old.quote_id=q.id AND old.version=q.proposal_version AND old.accepted_at IS NOT NULL) RETURNING q.id,q.proposal_version,q.quantity), issued AS (INSERT INTO marcada.quote_proposals(quote_id,version,unit_minor,quantity,tax_minor,shipping_minor,total_minor,currency,terms,expires_at,created_by) SELECT id,proposal_version,${p.unit},quantity,${p.tax},${p.shipping},${p.unit}::bigint*quantity+${p.tax}::bigint+${p.shipping}::bigint,${p.currency},${p.terms},${p.expires},${u.identity} FROM bumped RETURNING quote_id,version), notified AS (INSERT INTO marcada.account_notifications(id,recipient,type,aggregate_id,event_key) SELECT ${randomUUID()},q.identity,'quote_update',q.id::text,'proposal/'||q.id::text||'/'||i.version::text FROM issued i JOIN marcada.quotes q ON q.id=i.quote_id RETURNING id) SELECT version FROM issued`;
      if (!issued)
        return json(res, 409, {
          error: "Quote is closed, accepted or unavailable.",
        });
      await audit(
        u.identity,
        "issue_quote_proposal",
        body.id + ":" + issued.version,
      );
      return json(res, 200, { version: issued.version });
    }
    if (route === "admin/notification-retry" && req.method === "POST") {
      if (!uuid(body.id)) return json(res, 400, { error: "Invalid quote" });
      await limited(req, "notification-retry", 10);
      const result = await deliverNotification(sql(), body.id);
      await audit(u.identity, "retry_referral_notification", body.id);
      return json(res, 200, result);
    }
    if (route === "admin/quote" && req.method === "POST") {
      if (
        !uuid(body.id) ||
        !["new", "reviewing", "quoted", "closed"].includes(body.status)
      )
        return json(res, 400, { error: "Invalid quote status" });
      await sql()`WITH updated AS (UPDATE marcada.quotes SET status=${body.status} WHERE id=${body.id} AND status<>${body.status} RETURNING identity) INSERT INTO marcada.account_notifications(id,recipient,type,aggregate_id,event_key) SELECT ${randomUUID()},identity,'quote_update',${body.id},${"quote/" + randomUUID()} FROM updated`;
      await audit(u.identity, "quote_status", body.id);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: "Not found" });
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.status
        ? error.message
        : "Something went wrong. Please try again.",
    });
  }
}
