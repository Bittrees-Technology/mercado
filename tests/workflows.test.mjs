import { test } from "node:test";
import assert from "node:assert/strict";
import {
  supplierBrief,
  submissionInput,
  workflowRule,
  workflowInsert,
  deliverWorkflow,
} from "../lib/workflows.mjs";
test("supplier forwarding is an explicit allowlist without customer, referral or private-deal data", () => {
  const q = {
    id: "ref",
    item_id: "miner",
    item_name: "Bitaxe Gamma",
    name: "Miners",
    quantity: 4,
    identity: "private@example.com",
    details: "Email me at private@example.com",
    referral: "secret",
    offer_snapshot: { price: 1 },
  };
  const b = supplierBrief(q);
  assert.equal(b.quantity, 4);
  assert.equal(b.product, "Bitaxe Gamma");
  assert.ok(!JSON.stringify(b).includes("private"));
  assert.deepEqual(Object.keys(b), [
    "request_reference",
    "product_id",
    "product",
    "collection",
    "quantity",
    "request",
  ]);
});
test("vendor proposals allow missing price evidence but cannot set authority or publication fields", () => {
  const b = {
    product_id: "asic",
    name: "Miner",
    description: "Hardware",
    source_name: "Vendor",
    source_url: "https://vendor.example/miner",
    currency: "USD",
    price: "",
    active: true,
    identity: "owner@example.com",
    model_group: "hack",
  };
  const p = submissionInput(b);
  assert.equal(p.price, undefined);
  assert.equal(p.active, undefined);
  assert.equal(p.identity, undefined);
  assert.equal(p.model_group, undefined);
  assert.throws(() => submissionInput({ ...b, price: "2.345" }));
  assert.throws(() => submissionInput({ ...b, price_checked: "2026-02-30" }));
  assert.throws(() =>
    submissionInput({ ...b, source_url: "javascript:alert(1)" }),
  );
});
test("workflow routing requires a known event and one recipient", () => {
  assert.deepEqual(
    workflowRule({
      kind: "quote_received",
      recipient: "Ops@example.com",
      enabled: true,
    }),
    { kind: "quote_received", recipient: "ops@example.com", enabled: true },
  );
  for (const recipient of [
    "",
    "a@b.com,c@d.com",
    "A <a@b.com>",
    "a@b.com\nBcc: x@y.com",
  ])
    assert.throws(() =>
      workflowRule({ kind: "quote_received", recipient, enabled: true }),
    );
  assert.throws(() =>
    workflowRule({ kind: "secret", recipient: "a@b.com", enabled: true }),
  );
});
test("workflow creation is gated on approved rules and the successful submission mutation", () => {
  let captured;
  const db = (strings, ...values) => {
    captured = { sql: strings.join("?"), values };
    return captured;
  };
  workflowInsert(db, {
    key: "product/id/2",
    kind: "product_submitted",
    summary: "Review",
    path: "/admin/submissions",
    submissionId: "id",
    revision: 2,
    identity: "vendor",
    mutation: "unique",
  });
  assert.match(captured.sql, /r.enabled/);
  assert.match(captured.sql, /mutation_id=/);
  assert.match(captured.sql, /ON CONFLICT\(event_key\) DO NOTHING/);
  assert.ok(captured.values.includes("unique"));
});
test("workflow delivery reuses immutable payload and idempotency key, with bounded recovery", async () => {
  const prev = process.env.RESEND_API_KEY,
    oldFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "mock";
  const queries = [];
  const payload = {
    from: "test@example.com",
    to: ["ops@example.com"],
    subject: "test",
    text: "fixed",
  };
  const db = async (strings, ...values) => {
    const q = strings.join("?");
    queries.push({ q, values });
    return q.includes("RETURNING *")
      ? [{ id: "stable-id", payload, attempts: 1 }]
      : [];
  };
  try {
    globalThis.fetch = async (url, opts) => {
      assert.equal(
        opts.headers["Idempotency-Key"],
        "mercado-workflow/stable-id",
      );
      assert.deepEqual(JSON.parse(opts.body), payload);
      return { ok: true, json: async () => ({ id: "provider" }) };
    };
    assert.equal((await deliverWorkflow(db, "event")).status, "accepted");
    assert.match(queries[0].q, /23 hours/);
    globalThis.fetch = async () => {
      throw Error("timeout");
    };
    assert.equal((await deliverWorkflow(db, "event")).status, "pending");
    assert.match(queries.at(-1).q, /5 minutes/);
  } finally {
    globalThis.fetch = oldFetch;
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
  }
});
