# Shift Auto & Offroad Shopify Sync

This tool takes off-road parts data and syncs it into Shopify.

What it does:
1. Scrapes part data from Northridge4x4.
2. Pulls vehicle compatibility from `THIS PART FITS`.
3. Creates/updates products in Shopify by SKU.

For technical details, see [APP_REFERENCE.md](./APP_REFERENCE.md).

## Fast Start (For Your Buddy)

### 1) Open in VS Code

Open this folder in VS Code.

### 2) One-time setup

Copy `.env.example` to `.env` and fill in token/domain.

Required values in `.env`:
- `SHOPIFY_SHOP_DOMAIN` (must be `*.myshopify.com`)
- `SHOPIFY_ACCESS_TOKEN` (`shpat_...`)

For this store, domain should look like:
- `shiftautoandoffroad.myshopify.com`

### 3) Install dependencies

```powershell
npm install
```

### 4) Run with one command

Dry run (safe test):
```powershell
npm run pipeline:dry
```

Real sync:
```powershell
npm run pipeline:real
```

## VS Code + OpenAI Workflow (Low Manual Work)

If your buddy uses OpenAI/Codex in VS Code, they can paste this:

```text
Open this project and run the full dry-run sync workflow:
1) Verify .env has SHOPIFY_SHOP_DOMAIN and SHOPIFY_ACCESS_TOKEN
2) Run npm install if needed
3) Run npm run pipeline:dry
4) Show me summary from output/shopify_sync_results.json and output/shopify_sync_failures.json
```

Then for real upload:

```text
Run the real Shopify sync now using current .env settings.
Use npm run pipeline:real and summarize created/updated/failed counts.
```

## Commands

- `npm run scrape` -> scrape only
- `npm run sync:dry` -> Shopify dry run only
- `npm run sync:real` -> Shopify real sync only
- `npm run pipeline:dry` -> scrape + dry run sync
- `npm run pipeline:real` -> scrape + real sync

## What Appears In Shopify

Each product is synced as draft and includes:
- title, vendor, SKU, price, image, description
- vehicle fitment section in description
- fitment metafields:
  - `fitment.vehicle_compatibility`
  - `fitment.vehicle_compatibility_structured`

## Output Files

In `output/`:
- `parts.json`
- `parts.csv`
- `failures.json`
- `shopify_sync_results.json`
- `shopify_sync_failures.json`

## Common Issues

- Wrong domain: use `*.myshopify.com`, not public site URL
- `401/403`: token or scopes are wrong
- `429`: reduce `SYNC_CONCURRENCY`
