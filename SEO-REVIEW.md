# SEO review — 28 September 2026

## Findings and changes

- Every initial HTML response had a generic title and home canonical. Public pages now deliver route-specific title, description, canonical, Open Graph and Twitter card metadata before JavaScript runs. SPA navigation updates the same metadata.
- The initial application root was empty. Public responses now include a readable product/collection heading, description and crawlable catalog links before React loads.
- The static sitemap could retain hidden products and miss new vendor listings. `/sitemap.xml` now reads active, non-deleted listings and active collections, with product update dates. Referral and preview parameters are omitted.
- Missing products previously returned a successful shell. They now return HTTP 404 and noindex; account/admin and preview URLs are noindex. Data failures return 503, not a misleading 404.
- Website, collection, product and breadcrumb structured data describe real page content. No offers, reviews, ratings or inventory are invented. Supplier reference prices are not represented as Mercado checkout offers. This deliberately does not promise eligibility for price-rich results.
- The existing M favicon is supplemented by 32px PNG, ICO and 180px Apple touch icons. A 1200×630 branded hardware card is used for general sharing; product pages use their available public product photography.
- Existing analytics, authentication, legacy domain redirects and public catalog behavior are preserved. SEO rendering never queries private deals, accounts or vendor ownership fields.

## Validation

44 unit tests; Vite production build; direct handler checks against the live database (read-only) for home, collection, product, private page, removed product and sitemap. Review social image visually. After deploy, check HTTP responses, metadata, image MIME types and sitemap on the canonical host.

## Follow-up

Search Console access and search-performance data were not supplied, so indexing coverage, rankings and real-user Core Web Vitals were not assessed. Submit the current sitemap in the verified Search Console property and inspect representative product URLs. Existing social shares may keep cached previews until the sharing platform refreshes them.

The live sitemap currently fits a single file (maximum 50,000 URLs); split into a sitemap index before reaching that size. SEO page responses are deliberately not shared-cached so hidden/deleted product details cannot linger in cached metadata.

Reference: [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [Google product snippets](https://developers.google.com/search/docs/appearance/structured-data/product-snippet).
