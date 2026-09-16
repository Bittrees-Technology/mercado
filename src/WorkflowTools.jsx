import React from "react";
const titles = {
  quote_received: "New quote requests",
  vendor_submitted: "Vendor submissions",
  product_submitted: "Product submissions and revisions",
};
export function WorkflowRules({ admin, api, run, setAdmin, setNotice, busy }) {
  return (
    <section>
      <h2>Workflow email routing</h2>
      <p>
        Choose an internal operations recipient for each event. These alerts
        forward a request reference and staff link. Customer identities,
        free-text requirements, private terms and referral details stay in
        Mercado.
      </p>
      {(admin.workflowRules || []).map((r) => (
        <form
          className="admin-form record"
          key={r.kind + r.updated_at}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              await api("admin/workflow-rule", {
                kind: r.kind,
                recipient: f.get("recipient"),
                enabled: f.get("enabled") === "on",
              });
              setAdmin(await api("admin"));
              setNotice(
                "Workflow saved. Applies to future events only; no test email sent.",
              );
            });
          }}
        >
          <h3 className="span2">{titles[r.kind]}</h3>
          <label>
            Operations email
            <input type="email" name="recipient" defaultValue={r.recipient} />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="enabled" defaultChecked={r.enabled} />
            Enable future alerts
          </label>
          <p className="span2">
            {r.kind === "quote_received"
              ? "Includes quote reference, product/collection reference and quantity. Opens the quote queue."
              : "Includes a review prompt and a link to the appropriate staff queue."}
          </p>
          <button className="primary" disabled={busy}>
            Save this rule
          </button>
        </form>
      ))}
      <h3>Recent email attempts</h3>
      <p>
        Accepted means the email provider accepted the message, not confirmed
        inbox delivery. Pending messages receive bounded retries through
        maintenance. Queued messages retain their original recipient even if a
        rule changes.
      </p>
      {!(admin.workflowDeliveries || []).length && (
        <p>No workflow messages queued yet.</p>
      )}
      {(admin.workflowDeliveries || []).map((d) => (
        <article className="record" key={d.event_key}>
          <strong>{titles[d.kind]}</strong>
          <p>
            {d.status} · {d.attempts} attempts · {d.recipients?.join(", ")}
          </p>
          <small>{new Date(d.created_at).toLocaleString()}</small>
          {["pending", "sending"].includes(d.status) && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api("admin/workflow-retry", { event_key: d.event_key });
                  setAdmin(await api("admin"));
                })
              }
            >
              Retry when due
            </button>
          )}
          {d.status === "needs_review" && (
            <p>
              Check provider logs before taking further action. Automatic
              delivery has stopped.
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
export function SupplierBriefButton({ quote, api, run }) {
  return (
    <button
      className="secondary"
      onClick={() =>
        run(async () => {
          const { brief } = await api("admin/supplier-brief", { id: quote.id });
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(brief, null, 2)], {
              type: "application/json",
            }),
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = "mercado-rfq-" + quote.id + ".json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        })
      }
    >
      Download supplier RFQ brief
    </button>
  );
}
