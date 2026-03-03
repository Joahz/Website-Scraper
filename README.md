# Northridge4x4 Parts Scraper

Scrapes all part pages from `https://www.northridge4x4.com/` by reading the sitemap and extracting URLs under `/part/`.

## Instructions

### 1) Install dependencies

```powershell
npm install
```

### 2) Scrape parts

```powershell
npm run scrape
```

### 3) Set Shopify credentials

Create a Shopify custom app and copy:
- Store domain (example: `your-store.myshopify.com`)
- Admin API access token (`shpat_...`)

Required Admin API scopes:
- `write_products`
- `read_products`
- `write_inventory` (optional, only if you want inventory quantity updates)

### 4) Dry-run Shopify sync first (safe)

```powershell
$env:SHOPIFY_SHOP_DOMAIN='your-store.myshopify.com'
$env:SHOPIFY_ACCESS_TOKEN='shpat_xxx'
$env:SHOPIFY_API_VERSION='2025-10'
$env:DRY_RUN='true'
$env:MAX_ITEMS='25'
npm run shopify_sync
```

### 5) Real upload to Shopify

```powershell
$env:SHOPIFY_SHOP_DOMAIN='your-store.myshopify.com'
$env:SHOPIFY_ACCESS_TOKEN='shpat_xxx'
$env:SHOPIFY_API_VERSION='2025-10'
$env:DRY_RUN='false'
$env:SYNC_CONCURRENCY='4'
# Optional for inventory updates:
# $env:SHOPIFY_LOCATION_ID='123456789'
npm run shopify_sync
```

## Setup

```powershell
npm install
```

## Run

```powershell
npm run scrape
```

## Output

Files are written to `output/`:

- `parts.json` (full structured records)
- `parts.csv` (flat table)
- `failures.json` (only if any URLs fail)

## Notes

- Uses `robots.txt`-allowed sitemap URLs.
- Current sitemap has tens of thousands of parts; full runs may take significant time.

## Shopify Sync

Use `shopify_sync.js` to push scraped parts from `output/parts.json` to your Shopify store.

### 1) Create a custom app in Shopify

Grant Admin API scopes:
- `write_products`
- `read_products`
- `write_inventory` (optional, only if you want quantity updates)

Then copy the Admin API access token and your store domain (for example `your-store.myshopify.com`).

### 2) Dry-run first (no writes)

```powershell
$env:SHOPIFY_SHOP_DOMAIN='your-store.myshopify.com'
$env:SHOPIFY_ACCESS_TOKEN='shpat_xxx'
$env:SHOPIFY_API_VERSION='2025-10'
$env:DRY_RUN='true'
$env:MAX_ITEMS='25'
npm run shopify_sync
```

### 3) Real sync

```powershell
$env:SHOPIFY_SHOP_DOMAIN='your-store.myshopify.com'
$env:SHOPIFY_ACCESS_TOKEN='shpat_xxx'
$env:SHOPIFY_API_VERSION='2025-10'
$env:DRY_RUN='false'
$env:SYNC_CONCURRENCY='4'
# Optional for inventory updates:
# $env:SHOPIFY_LOCATION_ID='123456789'
npm run shopify_sync
```

### Notes

- Script filters out non-product rows (for example `/reviews` URLs).
- Upsert behavior is by SKU: existing SKU updates, missing SKU creates a draft product.
- Output files:
  - `output/shopify_sync_results.json`
  - `output/shopify_sync_failures.json`
