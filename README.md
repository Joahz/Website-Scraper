# Parts To Shopify (Beginner Guide)

This project does 2 things:

1. Scrapes parts from Northridge4x4.
2. Uploads those parts to your Shopify store as draft products.

For technical details, see [APP_REFERENCE.md](./APP_REFERENCE.md).

## What It Does In Plain English

- Reads all Northridge part pages.
- Pulls product info: title, brand, SKU, price, image, description.
- Pulls vehicle compatibility from the `THIS PART FITS` section.
- Sends products to Shopify:
  - If SKU already exists: updates it.
  - If SKU does not exist: creates it as a draft.

## One-Time Setup

### 1) Install Node packages

```powershell
npm install
```

### 2) Create Shopify custom app and token

In Shopify Admin, create a custom app and enable these Admin API scopes:
- `read_products`
- `write_products`
- `write_inventory` (optional)

Copy the Admin API token (`shpat_...`).

Important:
Use your **myshopify domain**, not the public website URL.

- Correct format: `your-store.myshopify.com`
- For your store, it should look like: `shiftautoandoffroad.myshopify.com`

## Run It (Safe Workflow)

### Step A: Scrape parts

```powershell
npm run scrape
```

### Step B: Dry-run Shopify sync (no real changes)

```powershell
$env:SHOPIFY_SHOP_DOMAIN='shiftautoandoffroad.myshopify.com'
$env:SHOPIFY_ACCESS_TOKEN='shpat_xxx'
$env:SHOPIFY_API_VERSION='2025-10'
$env:DRY_RUN='true'
$env:MAX_ITEMS='25'
npm run shopify_sync
```

This checks what would be created/updated without changing Shopify.

### Step C: Real sync

```powershell
$env:SHOPIFY_SHOP_DOMAIN='shiftautoandoffroad.myshopify.com'
$env:SHOPIFY_ACCESS_TOKEN='shpat_xxx'
$env:SHOPIFY_API_VERSION='2025-10'
$env:DRY_RUN='false'
$env:SYNC_CONCURRENCY='4'
# Optional for inventory quantity updates:
# $env:SHOPIFY_LOCATION_ID='123456789'
npm run shopify_sync
```

## Where Results Are Saved

In `output/`:
- `parts.json`: scraped part data
- `parts.csv`: spreadsheet-style part data
- `failures.json`: pages that failed scraping
- `shopify_sync_results.json`: what was created/updated
- `shopify_sync_failures.json`: Shopify sync errors

## What Shopify Products Will Look Like

Each product includes:
- Title, vendor, type, price, SKU, image
- Description
- `Vehicle Fitment` section in the description
- Fitment metafields:
  - `fitment.vehicle_compatibility` (text)
  - `fitment.vehicle_compatibility_structured` (JSON)

Products are created as `draft` for safety.

## If Something Goes Wrong

- `Missing SHOPIFY_SHOP_DOMAIN`: set the env var and use `*.myshopify.com`.
- `Missing SHOPIFY_ACCESS_TOKEN`: set your `shpat_...` token.
- `401/403` errors: token/scopes are wrong.
- `429` errors: Shopify rate-limiting; retry with lower `SYNC_CONCURRENCY`.

## Quick Command Summary

```powershell
npm install
npm run scrape
$env:SHOPIFY_SHOP_DOMAIN='shiftautoandoffroad.myshopify.com'
$env:SHOPIFY_ACCESS_TOKEN='shpat_xxx'
$env:SHOPIFY_API_VERSION='2025-10'
$env:DRY_RUN='true'
npm run shopify_sync
```
