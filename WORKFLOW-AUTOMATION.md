# Mercado workflow automation

Mercado separates supplier reference listings, customer quote requests and staff-issued proposals. A catalog listing is not confirmed inventory, an accepted proposal is not a payment, and referral activity is not an earned commission. These distinctions guide notification routing and the handoffs between customers, merchants, vendors and referrers.

## Five ranked automation examples

| Rank | Example using the current catalog | Trigger and handoff | Status |
|---|---|---|---|
| 1 | A customer requests six Bitaxe Gamma units, or two PiKVM devices | Send an operations alert with the quote reference, collection/product reference and quantity. Staff review the request and download a supplier RFQ brief. | Implemented; owner enables the new rule. |
| 2 | A vendor proposes a NerdQAxe revision, corrects an ASIC price or supplies a new product image | Save the proposed changes in a review queue and alert catalog operations. The vendor can revise the same submission and read reviewer feedback. Staff open the proposal in the product editor to publish it. | Implemented; vendor and product submission rules are separately configurable. |
| 3 | Staff issue a delivered-price proposal for Raspberry Pi AI HATs or a configured server | Email an opted-in customer a minimal update linking to the authenticated quote. Preserve exact proposal version and expiry; suppress superseded reminders. | Recommended next. Account updates and proposal acceptance already exist; customer email subscriptions and dispatch are not implemented. |
| 4 | A member refers a buyer for an Avalon miner | Send the opted-in referrer a minimal activity or milestone update without customer identity, quantity, requirements or private price. Show conversion milestones only when Mercado actually records them. | Existing account referral notifications remain available. Optional referrer email subscriptions and sales/commission milestones are future work. |
| 5 | An ASIC quote remains unassigned, or a server/AI accelerator reference price becomes stale | Send staff one actionable digest grouping overdue requests and listings needing price review, with owners and next steps. Use configurable thresholds and suppress closed or recently reviewed records. | Recommended next. No new reminder schedule or digest dispatch is active. |

This ranking prioritizes handoffs that can shorten quote response time without assuming that Mercado already has inventory, checkout or confirmed reseller agreements. Proposed operating targets are same-business-day triage for new RFQs and a clear reviewer response on supplier submissions; they are process goals, not published delivery commitments.

## New email routing

Owners configure three independent rules under **Admin → Notifications**: new quote requests, vendor submissions, and product submissions/revisions. Each accepts one operations mailbox. All new rules start disabled and require a configured verified sender before activation. Saving settings does not send test mail or replay old records.

The new quote alert includes identifiers and quantity; the other alerts include a review prompt. All link to authenticated staff queues. They omit customer identities, free-text requirements, referral mappings, supplier contact details and private terms. The existing referred-quote email is separate and can include more sensitive details for its configured operations recipient. Enabling both quote rules produces both types of alert for a referred quote; choose recipients and coverage deliberately.

Creation and outbox insertion share a database transaction. Submission revision events are bound to the successful row mutation, so failed ownership or stale-revision updates cannot queue an alert. Provider calls happen after persistence; delivery failure cannot discard the business record. Identical vendor integration content is deduplicated; a changed submission creates a new event.

Recipients and message bodies are captured when queued. Later rule changes apply to future events; disabling a rule does not cancel already queued mail. Delivery uses a stable provider idempotency key, a database claim, a five-minute retry delay and a maximum of five attempts. Automatic sends stop at 23 hours after the first attempt, within [Resend's documented 24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys). Provider acceptance is displayed separately from confirmed delivery; inbox delivery, bounce webhooks and automatic uncertain-send resolution are not implemented.

The existing daily maintenance endpoint now recovers up to five workflow messages per run in addition to existing referral retries. Owners can retry due messages from Notifications. This is immediate dispatch with daily recovery, not a newly scheduled frequent worker. A record marked `needs_review` requires checking provider logs before further action. No customer, supplier or referrer emails were sent while testing this change.

## Data forwarding

Quote staff can choose **Download supplier RFQ brief** on a quote. The authenticated server returns a JSON document containing only request reference, product ID/name, collection, quantity and a standard request for configuration, stock, lead time, unit price, currency, tax, shipping and warranty. The export is audited.

The brief excludes customer account identifiers, free-text form content, referral codes, proposal values and private-offer snapshots. Staff can review the file and add only necessary specifications before sharing it with an appropriate supplier. It does not send an email, post to a vendor endpoint or create an order. The email rules automate forwarding minimal event summaries to chosen operations mailboxes; external vendor forwarding remains a reviewed handoff.

For a later CRM or vendor webhook integration, define the recipient, approved fields, account permissions, signed requests, event IDs, retries and retention before enabling automatic external transmission. A supplier webpage or public catalog feed alone does not authorize sending customer information to that supplier.

## Merchant funnel

1. Triage new requests in Quotes, confirm quantity and requirements, and select the relevant vendor offering.
2. Export the RFQ brief and request actual stock and delivered pricing through an approved supplier channel.
3. Create a versioned Mercado proposal; the customer reviews and accepts the current terms in their account.
4. Record payment and delivery only once those future commerce integrations provide real evidence.

New alerts reduce missed handoffs, while the existing quote states remain the source of truth. The next useful additions are assigned staff ownership, due dates and a measured response-time dashboard rather than more email on every edit.

## Vendor funnel and individual submissions

**Vendors → Product submissions** links business onboarding with individual product work. Vendors can submit a new listing or select an existing public product and propose a correction. Only their own submissions are returned to vendor accounts; only the owner of a submission can revise it. Selecting an existing public product grants no editing right over that product.

Name, collection, description, supplier and product URL are required. Price, check date, image URL and miner hash rate can remain missing until verified. Unknown dates are never filled with today's date by the submission workflow. Authority, visibility, identity and comparison-group fields cannot be supplied through this endpoint.

Catalog staff can inspect proposed fields, request changes with feedback, or mark a submission reviewed. **Open in product editor** loads the proposal over the existing product, if any. Staff must verify the result, complete required fields and save explicitly. Recording a review alone does not publish a product. Reviewing a newer revision requires reloading; a stale review is rejected.

Review feedback is visible in the vendor's submission queue. Vendor email feedback notifications are not enabled in this release. Vendors with hundreds of products can continue registering a public CSV/JSON feed for staff review; automatic remote feed fetching remains disabled.

## Product management shortcuts

Authorized catalog staff see **Edit this product** on an individual public product page. The link opens that exact item in Products. The editor also offers **View product** and **Duplicate as new offer**, supporting another supplier's listing without overwriting the original.

New entries and duplicates start hidden. A product ID can be generated when left blank. Price-check dates for new entries require actual evidence rather than an automatic current date. New-product saves reject an existing ID. Individual edits carry the database's exact timestamp as an optimistic version; if another editor changes the item, the save fails without replacing their work. Reload the product, compare the changes and resubmit.

The existing CSV importer keeps its explicit create/update policy. It does not gain optimistic per-row version checks from the individual editor. Vendor submissions do not grant direct publishing, image upload, role administration or private-deal access.

## Validation

Unit checks cover forwarding allowlists, proposal-field restrictions, recipient validation, queue gates and delivery idempotency/recovery with a mocked provider. A database transaction exercises submission ownership, revision conflicts and outbox insertion, then intentionally rolls back every fixture. Desktop Chromium and mobile WebKit checks cover direct product editing, timestamp submission, disabled rules, vendor revisions and responsive layout. Existing catalog and authorization checks remain in the test suite.
