# Product management

Catalog-authorized users (owners, administrators, dealer managers and catalog managers) can unpublish or restore listings from the product page or Products workspace. Vendor, support and offer-management roles do not gain publishing rights. Server checks protect both mutations and history.

The Products workspace provides name/ID/vendor search, Published/Hidden filters, collection and vendor columns, edit and preview links, and bulk unpublishing of up to 100 selected published listings. Hidden previews require catalog access; public links show an unavailable message with alternatives.

Visibility changes offer Undo. An Undo reverses only visibility, preserving other product fields. Requests compare the expected visibility and reject the entire batch if any selected product is missing or its visibility has changed. Editors retain their selected product and receive its saved revision after a save. Existing edit-conflict protection remains in place.

Visibility changes and product saves record the actor, action and timestamp in the existing audit store, atomically with the database change. The editor displays the latest 100 recorded actions for its product. Historical product saves remain visible; earlier events do not contain field-level before/after comparisons.

Unpublishing is reversible and does not delete the product or its image. A hidden record can be found using the Hidden filter and published again.
