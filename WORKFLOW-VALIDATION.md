# Workflow validation — 16 September 2026

The referral popout now emphasizes the store link and member code. Collection/product links and code replacement are collapsed by default. Product searches respect the selected collection, clear stale selections, and explain empty results. Existing referral codes remain valid after renewal.

## Checks completed

- 31 unit tests: catalog validation, CSV handling, permissions, governance boundaries, wallet selection/signatures, pricing proposals, notification rules and retry behavior.
- Server rendering: six collection pages, 1,726 product pages, admin access restrictions, and signed-out/member referral panels.
- API integration with the real schema in a separate local PostgreSQL cluster: email-code replay protection, SIWE signature/domain/replay checks, account links, referral renewal and attribution, quantities, private offers and revocation, vendor permissions, image upload validation, and referral email recovery.
- Additional integration checks: owner-only workflow rules; vendor submission ownership, revisions and review feedback; no email after rejected writes; quote and vendor notification deduplication; supplier-brief privacy; proposal version/ownership checks; accepted-proposal protection; hidden product creation and stale-edit rejection.
- Production build and whitespace checks.

The database adapter in the isolated harness translated Neon queries to local PostgreSQL, including transactions and raw result parsing. External network calls were blocked; email responses were simulated. Production customer records and notification settings were not changed.

## Remaining interactive validation

Computer control could not open Mercado because the browser could not verify its administrator-enforced security policy. No alternate browser or automation method was used to bypass that block. The updated browser regression script was not run in this session.

After browser access is restored, check:

1. Sign in by email and each supported wallet; dismiss/reopen dialogs and check keyboard focus.
2. Copy store/code/collection/product links; follow a link and verify quote attribution. Check empty searches and code replacement.
3. Submit a test quote with quantity, review its supplier brief, issue a proposal, and check customer acceptance.
4. Submit vendor details and a product revision; review feedback and reopen the proposal in the product editor.
5. Edit and duplicate a product; check hidden drafts, image changes and stale-edit recovery.
6. Enable a notification rule only with an approved test recipient; confirm actual receipt and provider logs before relying on email delivery.

Payment and delivery remain future workflows. This validation does not certify email inbox delivery, physical wallet-browser compatibility, or live end-to-end UI behavior.
