const fs = require("fs");
const path = require("path");
const axios = require("axios");

const CONFIG = {
  inputJson: path.join(__dirname, "output", "parts.json"),
  apiVersion: process.env.SHOPIFY_API_VERSION || "2025-10",
  shopDomain: process.env.SHOPIFY_SHOP_DOMAIN || "",
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN || "",
  locationId: process.env.SHOPIFY_LOCATION_ID || "",
  dryRun: String(process.env.DRY_RUN || "true").toLowerCase() === "true",
  maxItems: Number.parseInt(process.env.MAX_ITEMS || "0", 10),
  concurrency: Number.parseInt(process.env.SYNC_CONCURRENCY || "4", 10),
};

if (!Number.isFinite(CONFIG.concurrency) || CONFIG.concurrency < 1) {
  CONFIG.concurrency = 4;
}

function requireConfig() {
  if (!CONFIG.shopDomain) {
    throw new Error("Missing SHOPIFY_SHOP_DOMAIN (example: your-store.myshopify.com)");
  }
  if (!CONFIG.accessToken) {
    throw new Error("Missing SHOPIFY_ACCESS_TOKEN");
  }
}

function loadRows() {
  const text = fs.readFileSync(CONFIG.inputJson, "utf-8");
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) {
    throw new Error("parts.json must be an array.");
  }
  return rows;
}

function clean(value) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function toHandle(name, sku, mfrPartNo) {
  const base = clean(name) || clean(sku) || clean(mfrPartNo) || "part";
  return base
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 255);
}

function parsePrice(value) {
  const n = Number.parseFloat(String(value || ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}

function dedupeNonEmpty(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const normalized = clean(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function parseFitmentVehicles(row) {
  const merged = [];
  const sectionFits = clean(row.fitment_this_part_fits)
    .split("|")
    .map((v) => clean(v));
  const vehicles = clean(row.fitment_vehicles)
    .split("|")
    .map((v) => clean(v));
  const textParts = clean(row.fitment_text)
    .split("|")
    .map((v) => clean(v));
  merged.push(...sectionFits, ...vehicles, ...textParts);
  return dedupeNonEmpty(merged).slice(0, 100);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildBodyHtml(baseBody, fitmentVehicles) {
  const safeBase = clean(baseBody);
  if (fitmentVehicles.length === 0) return safeBase;
  const items = fitmentVehicles
    .slice(0, 40)
    .map((vehicle) => `<li>${escapeHtml(vehicle)}</li>`)
    .join("");
  const fitmentSection = `<h3>Vehicle Fitment</h3><ul>${items}</ul>`;
  return safeBase ? `${safeBase}<br/><br/>${fitmentSection}` : fitmentSection;
}

function isLikelyProductRow(row) {
  const url = clean(row.url).toLowerCase();
  const hasPrice = parsePrice(row.price) !== null;
  const hasSku = clean(row.sku) || clean(row.mfr_part_no);
  const hasName = clean(row.name) && !clean(row.name).includes("Northridge4x4.com - Jeep 4x4 Parts");
  if (!url.includes("/part/")) return false;
  if (url.endsWith("/reviews")) return false;
  return Boolean(hasPrice && hasSku && hasName);
}

function mapToShopify(row) {
  const sku = clean(row.sku) || clean(row.mfr_part_no);
  const title = clean(row.name) || clean(row.title);
  const vendor = clean(row.brand) || "Unknown";
  const fitmentVehicles = parseFitmentVehicles(row);
  const baseBody = clean(row.jsonld_description) || clean(row.meta_description) || clean(row.og_description);
  const bodyHtml = buildBodyHtml(baseBody, fitmentVehicles);
  const productType = clean(row.category) || clean(row.retailer_category) || "Parts";
  const price = parsePrice(row.price) || "0.00";
  const handle = toHandle(title, sku, row.mfr_part_no);
  const tags = [
    clean(row.category),
    clean(row.retailer_category),
    clean(row.condition),
    clean(row.availability),
    fitmentVehicles.length > 0 ? "fitment-available" : "",
  ]
    .filter(Boolean)
    .join(", ");

  const metafields = [
    { namespace: "source", key: "source_url", type: "single_line_text_field", value: clean(row.url) },
    { namespace: "source", key: "mfr_part_no", type: "single_line_text_field", value: clean(row.mfr_part_no) || sku },
  ];

  if (fitmentVehicles.length > 0) {
    metafields.push({
      namespace: "fitment",
      key: "vehicle_compatibility",
      type: "multi_line_text_field",
      value: fitmentVehicles.join("\n").slice(0, 65000),
    });
  }

  return {
    sku,
    product: {
      title,
      body_html: bodyHtml,
      vendor,
      product_type: productType,
      handle,
      tags,
      status: "draft",
      images: clean(row.image).startsWith("http") ? [{ src: clean(row.image) }] : [],
      variants: [
        {
          sku,
          price,
          taxable: true,
          inventory_management: "shopify",
          inventory_policy: clean(row.availability).toLowerCase() === "in stock" ? "deny" : "continue",
          weight: Number.parseFloat(row.shipping_weight_value) || undefined,
          weight_unit: clean(row.shipping_weight_units).toLowerCase() === "lb" ? "lb" : undefined,
          barcode: clean(row.gtin) || undefined,
        },
      ],
      metafields,
    },
  };
}

function getClient() {
  return axios.create({
    baseURL: `https://${CONFIG.shopDomain}/admin/api/${CONFIG.apiVersion}`,
    timeout: 30000,
    headers: {
      "X-Shopify-Access-Token": CONFIG.accessToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

async function findVariantBySku(client, sku) {
  const query = `sku:${sku}`;
  const resp = await client.get("/variants.json", { params: { limit: 1, fields: "id,product_id,sku,inventory_item_id", sku, query } });
  const variant = Array.isArray(resp.data?.variants) ? resp.data.variants[0] : null;
  return variant || null;
}

async function createProduct(client, payload) {
  const resp = await client.post("/products.json", { product: payload.product });
  return resp.data?.product || null;
}

async function updateProductAndVariant(client, existingVariant, payload) {
  const { product } = payload;
  await client.put(`/products/${existingVariant.product_id}.json`, {
    product: {
      id: existingVariant.product_id,
      title: product.title,
      body_html: product.body_html,
      vendor: product.vendor,
      product_type: product.product_type,
      handle: product.handle,
      tags: product.tags,
      status: product.status,
      metafields: product.metafields,
    },
  });

  const variantPatch = {
    id: existingVariant.id,
    price: product.variants[0].price,
    sku: product.variants[0].sku,
    inventory_management: "shopify",
    inventory_policy: product.variants[0].inventory_policy,
    barcode: product.variants[0].barcode,
  };

  if (product.variants[0].weight) {
    variantPatch.weight = product.variants[0].weight;
  }
  if (product.variants[0].weight_unit) {
    variantPatch.weight_unit = product.variants[0].weight_unit;
  }

  await client.put(`/variants/${existingVariant.id}.json`, { variant: variantPatch });

  if (product.images.length > 0) {
    await client.post(`/products/${existingVariant.product_id}/images.json`, {
      image: product.images[0],
    });
  }

  return { id: existingVariant.product_id, updated: true };
}

async function setInventory(client, inventoryItemId, quantity) {
  if (!CONFIG.locationId) return;
  await client.post("/inventory_levels/set.json", {
    location_id: Number.parseInt(CONFIG.locationId, 10),
    inventory_item_id: inventoryItemId,
    available: quantity,
  });
}

async function runPool(items, worker, concurrency) {
  const queue = [...items];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      await worker(next);
    }
  });
  await Promise.all(workers);
}

async function syncRow(client, payload) {
  const existing = await findVariantBySku(client, payload.sku);

  if (CONFIG.dryRun) {
    return {
      sku: payload.sku,
      action: existing ? "would_update" : "would_create",
    };
  }

  if (!existing) {
    const created = await createProduct(client, payload);
    const createdVariant = created?.variants?.[0];
    if (createdVariant?.inventory_item_id) {
      const qty = clean(payload.product.tags).includes("in stock") ? 1 : 0;
      await setInventory(client, createdVariant.inventory_item_id, qty);
    }
    return {
      sku: payload.sku,
      action: "created",
      product_id: created?.id || null,
    };
  }

  const updated = await updateProductAndVariant(client, existing, payload);
  if (existing.inventory_item_id) {
    const qty = clean(payload.product.tags).includes("in stock") ? 1 : 0;
    await setInventory(client, existing.inventory_item_id, qty);
  }
  return {
    sku: payload.sku,
    action: "updated",
    product_id: updated.id,
  };
}

async function main() {
  requireConfig();
  const client = getClient();
  const rows = loadRows();
  const filtered = rows.filter(isLikelyProductRow);
  const deduped = [];
  const seen = new Set();

  for (const row of filtered) {
    const sku = clean(row.sku) || clean(row.mfr_part_no);
    if (!sku || seen.has(sku)) continue;
    seen.add(sku);
    deduped.push(row);
  }

  const sliced = CONFIG.maxItems > 0 ? deduped.slice(0, CONFIG.maxItems) : deduped;
  const payloads = sliced.map(mapToShopify);

  console.log(`Loaded ${rows.length} rows from ${CONFIG.inputJson}`);
  console.log(`Product-like rows: ${filtered.length}`);
  console.log(`Unique SKUs to sync: ${payloads.length}`);
  console.log(`Dry run: ${CONFIG.dryRun}`);

  const results = [];
  const failures = [];

  await runPool(
    payloads,
    async (payload) => {
      try {
        const result = await syncRow(client, payload);
        results.push(result);
        if (results.length % 25 === 0) {
          console.log(`Progress: ${results.length}/${payloads.length}`);
        }
      } catch (error) {
        failures.push({
          sku: payload.sku,
          error: error.response?.data || error.message || String(error),
        });
      }
    },
    CONFIG.concurrency
  );

  const outputDir = path.join(__dirname, "output");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "shopify_sync_results.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(outputDir, "shopify_sync_failures.json"), JSON.stringify(failures, null, 2));

  const created = results.filter((r) => r.action === "created").length;
  const updated = results.filter((r) => r.action === "updated").length;
  const wouldCreate = results.filter((r) => r.action === "would_create").length;
  const wouldUpdate = results.filter((r) => r.action === "would_update").length;

  console.log("Sync complete:");
  console.log(`- created: ${created}`);
  console.log(`- updated: ${updated}`);
  console.log(`- would_create: ${wouldCreate}`);
  console.log(`- would_update: ${wouldUpdate}`);
  console.log(`- failures: ${failures.length}`);
  console.log(`- results file: ${path.join(outputDir, "shopify_sync_results.json")}`);
  console.log(`- failures file: ${path.join(outputDir, "shopify_sync_failures.json")}`);
}

main().catch((error) => {
  console.error("Shopify sync failed:", error.message || error);
  process.exit(1);
});
