# Referral notifications and private deals

## Member referral codes

Signed-in members can use **Referrals → Request a new code** to receive a new default code immediately. Previous codes and links remain valid through `referral_codes`; existing quote attribution is unchanged. Codes apply to all active products and collections. The sharing panel supports store links, collection links and searchable individual product links. Customers can also enter any valid member code during a quote request.

`POST /api/referrals/new` requires a session and same-origin protection and is rate limited to five requests per ten-minute IP bucket. It atomically retains the previous code, records the new code, updates the member default and audits the action. Quote validation resolves both current and previous codes and rejects self-referrals, including linked email/wallet identities. Creating a code does not send a notification or grant a commission.

## Operations email

Owners can configure the approved operations mailbox and enable future notifications in **Admin → Notifications**. Saved settings take precedence over the deployment fallback `REFERRAL_NOTIFY_EMAIL`. `MAIL_FROM` and `RESEND_API_KEY` use the existing verified sender. An empty fallback leaves notification creation disabled; the settings form rejects enabling an empty or invalid mailbox. Changing the recipient affects future requests only; already queued messages retain their original recipient and content.

A successful purchase-quote submission with a valid member referral code atomically saves the quote and an email outbox record. Link visits and code entry alone do not send mail. The email contains the quote ID, timestamp, submitting account, referral code, referring account, product/collection, quantity, submitted requirements and an authenticated admin link. Only the configured operations recipient receives this message. Referrers and vendors do not automatically receive customer information, private offers or dealer notes. Historical quotes are not replayed.

Delivery is attempted immediately with a 10-second timeout. Failures do not discard the quote. Admin → Quotes displays notification state and permits authorized quote staff to retry pending messages. The existing daily maintenance job also processes up to ten pending messages per run. This is a recovery path, not a frequent delivery scheduler. Provider acceptance is not proof of inbox delivery; there is no bounce/delivery webhook yet.

Retries use the same stored body and provider idempotency key, with a database claim preventing concurrent sends. After five attempts or 23 hours from the first attempt, the record requires operator review instead of automatic resend. This stays within [Resend's 24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys). Check provider logs before resolving an uncertain delivery manually. Email payload copies are access-restricted database records and are deleted when the parent quote is deleted.

Tests replace provider calls with a mock. Do not use real customer quotes as delivery tests.

## How private offers currently work

An owner, administrator, dealer manager or offer manager creates an offer with a dealer URL, optional price, currency, expiry and staff notes, then explicitly grants access to normalized email or wallet identities. A recipient signs in as the granted identity. Grants currently match that exact identity; linking an email and wallet does not merge offer grants or account quote history.

The catalog API returns the offer's dealer, price, currency and expiry only to authorized recipients and deal staff. Internal notes and the grant list remain on the authorized administration surface. The dealer URL is resolved through `/api/go` only after the server checks access, active status and expiry again. Revocation takes effect for subsequent Mercado requests. A previously revealed external URL cannot be recalled or made confidential by Mercado; vendor-side codes and restrictions are required if the external deal itself must remain exclusive.

Opening the dealer link redirects to the dealer's website. Mercado does not transmit the customer's quote form to the vendor in that redirect. Any affiliate or deal parameters already placed in the configured dealer URL are passed to the dealer. The vendor then collects its own checkout information and controls its purchase terms. Mercado does not yet confirm external sales or calculate/pay commissions.

The Mercado purchase-quote path now binds an optional offer to the request, with a server-captured dealer/price/currency/expiry snapshot. Authorization, collection and item membership, active state and expiry are checked when creating the request. This snapshot does not include the dealer URL or internal notes.

Authorized quote staff issue a versioned proposal from Admin → Quotes, specifying unit price, currency, tax, delivery, expiry and purchase terms. The server calculates totals in integer minor units using the requested quantity. Customers review the current proposal in their account and explicitly accept its exact version. Superseded, expired, closed or inaccessible offers are rejected. Acceptance and revision serialize on the quote row; an accepted proposal cannot be silently replaced. Payment, inventory reservation and shipment booking are not performed by acceptance.

## Wallet messaging integration direction

The Chirpy thread was asked to review its actual XMTP capabilities and deployment blockers. Wallet authentication alone is not messaging consent or evidence of a reachable messaging inbox. A production integration should require an opted-in, verified wallet and an available messaging identity; use a dedicated Mercado service sender with server-side key custody and durable delivery tracking.

Prefer a minimal “Your quote has an update” notification linking to an authenticated Mercado page. Private prices, customer requirements, dealer URLs and identity mappings should stay behind Mercado authorization unless the customer explicitly chooses to share them in a conversation. Do not assume messages can be revoked after delivery.

Wallet delivery is not enabled by this email feature. No customer wallet messages or referral emails were sent during implementation.

### Chirpy review findings

The requested thread review checked Chirpy remote/live commit `16b2685e38c205b4a345924f2ec06c7fc1510655`. Its production XMTP transport supports direct messages, request/accept/block consent and reachability checks. The business notification sender/outbox API does not exist; `/api/workflow-event` is telemetry, not a messaging endpoint. Message bodies currently render as plain text, with no supported business-notification deep-link router. The token gate is not production-ready, but a direct-message pilot does not depend on that gate.

Recommended first integration: opted-in direct-message alerts, a dedicated persistent Node sender, server-verified wallet/inbox binding, and minimal messages linking to a new authenticated Mercado notification-detail route. Add safe HTTPS link rendering in Chirpy, stable event IDs, subscription-version checks, leased queue claims, bounded retries, expiration and reconciliation after uncertain sends. Unlinking, opt-out and changed inbox mappings must invalidate queued messages. Do not silently retarget a pending message to a different wallet.

Before wallet activation, choose the service host and organization/key custodian, permitted notification categories and recipients, opt-out/retention owner, and whether negotiations include dealers. Linked accounts currently remain separate access/referral principals; a canonical-member policy is needed before cross-alias rewards. Referral attribution is not a completed sale or earned commission. XMTP delivery does not establish operating-system push delivery.

Chirpy messaging must never grant an offer, accept final terms or mark payment complete. Mercado now implements identity-scoped quote request idempotency, versioned quote acceptance, and recipient-authorized account notifications. External XMTP dispatch remains follow-on work.


## Implemented workflow changes

- Quote retries use an identity-scoped request key and normalized request hash. Concurrent duplicates create one quote and one associated referral event/outbox record; reusing a key with different details returns a conflict. The browser preserves the key during a failed attempt and changes it when the submitted content changes. Refreshing the browser starts a new attempt.
- Verified linked email/wallet aliases cannot refer themselves when a new quote is submitted. Linking still does not merge authorization principals or historical records.
- `/account/notifications` lists updates for the signed-in identity. `/account/notifications/<id>` and `/api/notifications?id=<id>` authorize each request. Forwarding a link grants no access. Referral activity is generic and reveals no buyer, quantity or requirements. Private-offer notifications disappear from results when access is revoked, the offer expires or it is deactivated. Quote updates link back to the signed-in customer's account.
- Grant notifications are inserted only on a new grant transition. Quote status changes and issued proposals create customer updates atomically with the change. These are in-app records, not proof of external message delivery.
- Chirpy PR [54](https://github.com/Bittrees-Technology/chirpy/pull/54) deployed safe HTTPS message links at main `af16029783c7397e85d612a66138c95f2746acb4`. No automatic link preview or destination request occurs before clicking. This completes the link-rendering prerequisite, not the sender/worker integration.

External wallet delivery still requires a dedicated sender and persistent worker host/key custodian, explicit opt-in and verified inbox enrollment, opt-out and retention ownership, subscription-version checks and send reconciliation. No arbitrary client-supplied recipient or message should enter the future dispatcher. In-app records remain available while this is configured.

## Additional workflow routing

[Workflow automation](WORKFLOW-AUTOMATION.md) documents the new quote, vendor and product-submission rules, privacy-limited supplier RFQ exports, individual product review and five ranked follow-on examples. These rules start disabled and are separate from the existing referred-quote setting.

## Custom referral codes

Members can choose a code under Referrals → Choose a custom code. Codes are normalized to lowercase and must contain 4–32 letters, numbers or hyphens, with a letter or number at either end. Existing and historical codes cannot be claimed by another member. Official-looking names and the 16-character hexadecimal namespace used by generated codes are reserved.

Available valid codes activate immediately. There is no staff approval queue or code-creation email; creation is recorded in the audit log. Existing generated codes and previous custom codes remain attributed to their original member.

A shared `?ref=code` URL fills the quote referral field. The browser retains it in session storage, and the customer may replace or clear it before submitting. On submission, the server validates ownership, blocks self-referrals (including linked email/wallet accounts), and saves the code with the quote, product, quantity and customer identity. The referring member receives a private in-app activity notice without customer details. An enabled operations email rule sends the configured operations recipient the quote details; only owners can configure that recipient. Code creation is separate from referral-use notification.

This is quote attribution, not a click-to-sale conversion ledger, commission calculation or payout system. A new code does not establish a commercial commission agreement.

On 16 September 2026, no referral operations recipient was configured and all three general workflow email rules were disabled. Confirm current settings in Admin → Notifications before relying on email delivery.
