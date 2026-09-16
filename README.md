# Mercado

Marketplace infrastructure for product discovery, dealer offers, referral attribution and quote management. Catalogs and categories are configurable; the Bittrees deployment currently focuses on mining, compute and electronics.

[Live marketplace](https://mercado.bittrees.org) · [Architecture and roadmap](PLAN.md) · [Commerce foundations](COMMERCE.md)

## Capabilities

- Product collections, pricing, source metadata, editable images and catalog filters.
- Direct product-edit links, duplicate offers and vendor revisions with catalog review.
- Configurable operations alerts and privacy-limited supplier RFQ exports.
- Reviewed model groups with vendor offers ranked by price within each currency.
- Public dealer offers and private deals with explicit access controls.
- Member referral codes and shareable links, attributed to customer quote requests.
- Optional operations email for referred quotes, with tracked delivery attempts and restricted retries.
- Email verification and Sign-In with Ethereum, with verified email–wallet linking.
- Role-based administration with searchable lists, mobile page navigation and optional Bittrees governance role resolution.
- Multiple injected wallet discovery, account-change handling and email fallback.
- Private-offer quote requests, versioned proposals, customer acceptance and private account notifications.
- Consent-controlled analytics and foundations for future payments and delivery.

Direct checkout and payouts are not enabled. Supplier reference prices and availability do not represent marketplace inventory or guaranteed fulfillment.

## Administration and vendor access

`/admin` provides separate Products, Dealer offers, Quotes, Vendors and Team access pages. Owners delegate local roles through Team access. Server-side checks apply independently of page visibility.

| Role | Access |
|---|---|
| Owner | All pages and local role delegation |
| Administrator | Products, offers, quotes and vendor integrations |
| Catalog manager | Products, images and CSV imports |
| Offer manager | Dealer offers and private recipients |
| Dealer manager | Products and offers |
| Support | Customer quotes, proposals and notification retries |
| Vendor manager | All vendor integration submissions and review statuses |
| Vendor | Own integration and individual product submissions |

Vendors register contact details and public CSV/JSON feed URLs for review. Vendor edits return submissions to draft or submitted status. Approval does not enable synchronization or publish products. Product managers review CSV data through the existing importer; automated feed fetching and credential storage are not enabled. Roles can be revoked without deleting vendor records.

## CSV import

In **Manage store → Products, pricing & photos → Import products from CSV**, download the template and upload up to 200 rows (1 MB). Review rows, complete missing fields, and follow supplier or search links to verify details. Enter the actual price-check date; it is never inferred.

Import saves only ready rows and reports each result. New rows default to hidden. Existing IDs are protected unless updates are explicitly enabled; updates replace all product fields. Unfinished rows remain in the current page only, so keep the source CSV until the import is complete. Product management permissions apply to every imported row.

See [admin and wallet UX validation](ADMIN-UX.md) and [notifications and private deals](NOTIFICATIONS.md) for recipient configuration, delivery behavior and the proposed Chirpy wallet integration.

## Stack

React and Vite frontend, Vercel server functions, PostgreSQL via Neon, Resend email and viem for wallet verification. Authorization, private deal terms and credentials remain server-side.

## Development

Use Node.js 24 or later. Copy `.env.example` to `.env.local` and configure the server credentials.

```sh
npm ci
npm run dev
npm run build
npm test
```

`npm run dev` previews the frontend. Use `vercel dev` for API-backed local flows. Apply database migrations explicitly with `npm run db:migrate`; deployments do not run migrations automatically. Catalog imports preserve existing operator edits.

For database-backed verification, run `node --env-file=.env.local tests/integration.mjs` against a dedicated test database. Tests create and remove fixture records and do not send email. `node tests/equipment-render.mjs` checks collection and product rendering.

## Deployment and operations

Deploy to Vercel with `APP_ORIGIN` set to the canonical HTTPS domain and a verified email sender. Configure recovery owners through server environment values. The Bittrees integration maps verified governance Partners to Owners and Admins to Administrators; owners can assign local dealer managers and support staff.

The existing deployment retains the internal `marcada` database schema and analytics identifier to preserve records and reporting history. Public branding, links and authentication use Mercado. Previous storefront domains redirect to the canonical domain while preserving product paths and referral parameters.

See [initial sourcing research](SOURCING-RESEARCH.md) and the [300-listing expansion](SOURCING-ROUND2.md) and the [DTV Electronics additions](SOURCING-DTV.md) for catalog evidence. Products, supplier relationships and commercial terms are deployment data, independent of the marketplace infrastructure.

Regional sourcing evidence and comparison-group administration are documented in [US, Mexico and Western Europe sourcing](SOURCING-US-MEXICO-EUROPE.md).

The [additional regional sourcing pass](SOURCING-ROUND5.md) records subsequent qualified vendors, product evidence and exclusions.

See [workflow automation](WORKFLOW-AUTOMATION.md) for routing, vendor submissions and the ranked funnel improvements.
