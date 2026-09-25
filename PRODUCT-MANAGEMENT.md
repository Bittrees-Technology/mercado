# Product management

Catalog-authorized users (owners, administrators, dealer managers and catalog managers) can unpublish or restore listings from the product page or Products workspace. Vendor, support and offer-management roles do not gain publishing rights. Server checks protect both mutations and history.

The Products workspace provides name/ID/vendor search, Published/Hidden filters, collection and vendor columns, edit and preview links, and bulk unpublishing of up to 100 selected published listings. Hidden previews require catalog access; public links show an unavailable message with alternatives.

Visibility changes offer Undo. An Undo reverses only visibility, preserving other product fields. Requests compare the expected visibility and reject the entire batch if any selected product is missing or its visibility has changed. Editors retain their selected product and receive its saved revision after a save. Existing edit-conflict protection remains in place.

Visibility changes and product saves record the actor, action and timestamp in the existing audit store, atomically with the database change. The editor displays the latest 100 recorded actions for its product. Historical product saves remain visible; earlier events do not contain field-level before/after comparisons.

Unpublishing is reversible and does not delete the product or its image. A hidden record can be found using the Hidden filter and published again.

## Approved vendor workflow

Vendor accounts complete business name, website and contact email, then request approval. Optional feed details are collapsed; feeds remain manually reviewed and are not fetched automatically. An account needs the Vendor role and an approved vendor profile for direct product management. Owners and vendor managers approve or pause profiles. Routine profile edits preserve approved/paused status; vendors cannot approve themselves or resume paused access.

Approved vendors use **My products**, without individual product submission review. They can create, publish, edit, hide, preview and delete their own listings. Publication and image rights are evaluated per request. Product ownership is stored as the account identity, never inferred from supplier names or caller-provided ownership. Vendor-created listings use the approved business name as the supplier label.

Catalog staff can assign existing listings using **Vendor account** in the product editor. Unassigned imported/sourced products remain Mercado-managed. No existing listing was automatically reassigned in this release. Vendors cannot edit, hide, delete or inspect private history for someone else's product. Bulk changes fail entirely if any target is outside their ownership. Pausing a vendor blocks subsequent direct mutations; it does not automatically unpublish existing listings.

**Delete** removes a listing from the management catalog and public marketplace after an in-page confirmation. The underlying record is retained for quote relationships and audit history and cannot be republished by normal product saves. Use Hide for a reversible, editable listing. Deletion checks the saved revision to avoid deleting a concurrently changed product.

Validation: `npm test`, production build, and `node --env-file=.env.local scripts/test-vendor-products.mjs`. The latter uses temporary transaction-local tables to test the actual SQL for owned changes, cross-vendor denial, mixed-batch rejection, paused/pending accounts, deletion, and audit entries without changing marketplace records.
