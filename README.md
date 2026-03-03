# Northridge4x4 Parts Scraper

Scrapes all part pages from `https://www.northridge4x4.com/` by reading the sitemap and extracting URLs under `/part/`.

For a full app spec and future update guide, see [APP_REFERENCE.md](./APP_REFERENCE.md).

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

## Output

Files are written to `output/`:
- `parts.json` (full structured records)
- `parts.csv` (flat table)
- `failures.json` (only if any URLs fail)
- `shopify_sync_results.json`
- `shopify_sync_failures.json`

## Notes

- Script filters out non-product rows (for example `/reviews` URLs).
- Upsert behavior is by SKU: existing SKU updates, missing SKU creates a draft product.
- Products are synced as `draft` by default for safety.
- Vehicle fitment is captured from page sections/keywords and added to Shopify description + fitment metafield.
- Uses `robots.txt`-allowed sitemap URLs.
- Full scrapes may take significant time.
