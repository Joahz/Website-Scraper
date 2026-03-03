# App Reference

## Purpose

This app automates two jobs:

1. Scrape part data from Northridge4x4 product pages.
2. Sync that data into Shopify product listings.

Primary use case: build and maintain a parts catalog in Shopify from scraped source data.

## What The App Does

### Scraper (`scrape_northridge.js`)

- Reads sitemap: `https://static.northridge4x4.com/sitemaps/google.xml`
- Filters URLs to `/part/` pages
- Fetches and parses each page
- Extracts product metadata (title, brand, SKU/MPN, price, availability, image, descriptions, weight, etc.)
- Uses `THIS PART FITS` as the primary/strict fitment source
- Uses fallback selectors/keywords only when `THIS PART FITS` is missing
- Produces structured fitment rows (`year`, `make`, `model`, `trim`) plus raw fitment strings
- Writes outputs:
  - `output/parts.json`
  - `output/parts.csv`
  - `output/failures.json` (if errors occur)

### Shopify Sync (`shopify_sync.js`)

- Loads `output/parts.json`
- Filters non-product rows (for example `/reviews`)
- Deduplicates by SKU
- Maps rows to Shopify product + variant payloads
- Adds vehicle compatibility to product content:
  - `Vehicle Fitment` section in product description
  - `fitment.vehicle_compatibility` metafield (multi-line text)
  - `fitment.vehicle_compatibility_structured` metafield (JSON)
  - `fitment-available` tag when fitment exists
- Upserts by SKU:
  - SKU exists -> update
  - SKU missing -> create (as draft)
- Writes sync logs:
  - `output/shopify_sync_results.json`
  - `output/shopify_sync_failures.json`

## Required Environment Variables

- `SHOPIFY_SHOP_DOMAIN` (example: `your-store.myshopify.com`)
- `SHOPIFY_ACCESS_TOKEN` (Admin API token)
- `SHOPIFY_API_VERSION` (default currently used: `2025-10`)
- `DRY_RUN` (`true` or `false`)

Optional:
- `MAX_ITEMS` (limit records during testing)
- `SYNC_CONCURRENCY` (default `4`)
- `SHOPIFY_LOCATION_ID` (only if inventory quantity updates are needed)

## Shopify App Scopes

- `read_products`
- `write_products`
- `write_inventory` (optional but recommended if setting quantities)

## Current Behavior And Constraints

- Sync status is set to `draft` for safety.
- Upsert key is SKU (falls back to `mfr_part_no` where needed).
- Inventory update is optional and only runs when `SHOPIFY_LOCATION_ID` is set.
- The app depends on source site structure and metadata fields staying stable.

## Update Checklist (Use This For Future Changes)

1. Confirm business rule change (what should happen differently).
2. Update mapping/filter logic in `shopify_sync.js` and/or extraction logic in `scrape_northridge.js`.
3. Run a limited dry run (`MAX_ITEMS=25`, `DRY_RUN=true`).
4. Review `output/shopify_sync_results.json` and `output/shopify_sync_failures.json`.
5. Run real sync only after dry-run results are clean.
6. Update `README.md` and this file if behavior or setup changed.
7. Commit with a clear message describing behavior change.

## Suggested Next Improvements

- Add rate-limit/retry backoff for Shopify API calls.
- Add incremental sync mode (only changed/new SKUs).
- Add category/tag normalization mapping table.
- Add test coverage for mapping and filters.
- Add scheduled execution with logging/alerts.
