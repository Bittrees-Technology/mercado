import { dealerUrl, textField } from "./security.mjs";
export const workflowKinds = {
  quote_received: "New quote request",
  vendor_submitted: "Vendor review requested",
  product_submitted: "Product review requested",
};
export function workflowRule(body) {
  if (!workflowKinds[body.kind] || typeof body.enabled !== "boolean")
    throw Object.assign(Error("Choose a valid workflow."), { status: 400 });
  const recipient = String(body.recipient || "")
    .trim()
    .toLowerCase();
  if (
    ((recipient || body.enabled) &&
      !/^\S+@[^\s@,<>]+\.[^\s@,<>]+$/.test(recipient)) ||
    recipient.length > 254 ||
    /[\r\n,<>]/.test(recipient)
  )
    throw Object.assign(Error("Use one operations email address."), {
      status: 400,
    });
  return { kind: body.kind, recipient, enabled: body.enabled };
}
// Never forward free text, customer identities, referral attribution or private-deal data.
export function supplierBrief(q) {
  return {
    request_reference: q.id,
    product_id: q.item_id || null,
    product: q.item_name || q.name,
    collection: q.name,
    quantity: q.quantity,
    request:
      "Please confirm the exact configuration, current stock, lead time, unit price, currency, tax, shipping and warranty. This is an RFQ, not an order.",
  };
}
export function submissionInput(b) {
  const p = {
    product_id: textField(b.product_id, 80),
    name: textField(b.name, 160),
    description: textField(b.description, 1500),
    source_url: dealerUrl(b.source_url),
    source_name: textField(b.source_name, 100),
  };
  if (b.price !== "" && b.price != null) {
    const n = Number(b.price);
    if (
      !Number.isFinite(n) ||
      n < 0 ||
      n > 99999999.99 ||
      !/^\d+(\.\d{1,2})?$/.test(String(b.price))
    )
      throw Object.assign(Error("Enter a valid price."), { status: 400 });
    p.price = n;
  }
  if (!["USD", "EUR", "GBP", "MXN", "CAD", "AUD"].includes(b.currency))
    throw Object.assign(Error("Choose a currency."), { status: 400 });
  p.currency = b.currency;
  if (b.price_checked) {
    const d = String(b.price_checked);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
      !Number.isFinite(Date.parse(d)) ||
      new Date(d).toISOString().slice(0, 10) !== d ||
      d > new Date().toISOString().slice(0, 10)
    )
      throw Object.assign(Error("Enter the actual price-check date."), {
        status: 400,
      });
    p.price_checked = d;
  }
  if (b.image_url) p.image_url = dealerUrl(b.image_url);
  p.specifications = String(b.specifications || "").slice(0, 2000);
  p.hashrate = String(b.hashrate || "").slice(0, 200);
  return p;
}
export function workflowInsert(
  db,
  {
    key,
    kind,
    aggregate,
    summary,
    path,
    quoteId = null,
    submissionId = null,
    revision = null,
    identity = null,
    mutation = null,
  },
) {
  const from = process.env.MAIL_FROM || "";
  const origin = process.env.APP_ORIGIN || "https://mercado.bittrees.org";
  const text = [
    workflowKinds[kind],
    summary,
    "",
    `Review in Mercado: ${origin}${path}`,
    "Sign in with the appropriate staff role. This notification does not grant access or confirm an order.",
  ].join("\n");
  return db`INSERT INTO marcada.workflow_outbox(event_key,kind,payload) SELECT ${key},${kind},jsonb_build_object('from',${from}::text,'to',jsonb_build_array(r.recipient),'subject',${"Mercado: " + workflowKinds[kind]}::text,'text',${text}::text) FROM marcada.workflow_rules r WHERE r.kind=${kind} AND r.enabled AND r.recipient<>'' AND ${from}<>'' AND (${quoteId}::uuid IS NULL OR EXISTS(SELECT 1 FROM marcada.quotes WHERE id=${quoteId}::uuid)) AND (${submissionId}::uuid IS NULL OR EXISTS(SELECT 1 FROM marcada.product_submissions WHERE id=${submissionId}::uuid AND revision=${revision} AND identity=${identity} AND mutation_id=${mutation}::uuid)) ON CONFLICT(event_key) DO NOTHING`;
}
export async function deliverWorkflow(db, key) {
  if (!process.env.RESEND_API_KEY) return { status: "not_configured" };
  await db`UPDATE marcada.workflow_outbox SET status='needs_review' WHERE event_key=${key} AND status IN ('pending','sending') AND (first_attempt_at<now()-interval '23 hours' OR attempts>=5)`;
  const [r] =
    await db`UPDATE marcada.workflow_outbox SET status='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),locked_until=now()+interval '1 minute' WHERE event_key=${key} AND (status='pending' OR (status='sending' AND locked_until<now())) AND attempts<5 AND next_attempt_at<=now() RETURNING *`;
  if (!r) return { status: "not_claimed" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "mercado-workflow/" + r.id,
      },
      body: JSON.stringify(r.payload),
    });
    if (!response.ok) throw Error("provider_rejected");
    const d = await response.json();
    if (!d.id) throw Error("missing_provider_id");
    await db`UPDATE marcada.workflow_outbox SET status='accepted',provider_id=${d.id},locked_until=NULL WHERE event_key=${key}`;
    return { status: "accepted" };
  } catch {
    await db`UPDATE marcada.workflow_outbox SET status=${r.attempts >= 5 ? "needs_review" : "pending"},locked_until=NULL,next_attempt_at=now()+interval '5 minutes' WHERE event_key=${key} AND status='sending'`;
    return { status: r.attempts >= 5 ? "needs_review" : "pending" };
  }
}
export async function retryWorkflows(db) {
  const rows =
    await db`SELECT event_key FROM marcada.workflow_outbox WHERE status IN ('pending','sending') AND next_attempt_at<=now() ORDER BY created_at LIMIT 5`;
  for (const r of rows) await deliverWorkflow(db, r.event_key);
}

export function submissionWrite(
  db,
  { id, identity, itemId, proposed, mutation, revision },
) {
  return db`INSERT INTO marcada.product_submissions(id,identity,item_id,proposed,mutation_id) SELECT ${id},${identity},${itemId},${JSON.stringify(proposed)}::jsonb,${mutation} WHERE ${revision}=0 OR EXISTS(SELECT 1 FROM marcada.product_submissions WHERE id=${id} AND identity=${identity}) ON CONFLICT(id) DO UPDATE SET proposed=EXCLUDED.proposed,mutation_id=EXCLUDED.mutation_id,status='submitted',revision=marcada.product_submissions.revision+1,review_note='',updated_at=now() WHERE marcada.product_submissions.identity=${identity} AND marcada.product_submissions.revision=${revision} AND marcada.product_submissions.item_id IS NOT DISTINCT FROM ${itemId} RETURNING id,revision`;
}
