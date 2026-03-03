const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const CONFIG = {
  sitemapUrl: "https://static.northridge4x4.com/sitemaps/google.xml",
  baseUrl: "https://www.northridge4x4.com",
  concurrency: 8,
  timeoutMs: 30000,
  outputDir: path.join(__dirname, "output"),
  outputJson: path.join(__dirname, "output", "parts.json"),
  outputCsv: path.join(__dirname, "output", "parts.csv"),
  retryCount: 2,
  retryDelayMs: 1500,
};

if (process.env.CONCURRENCY) {
  const parsed = Number.parseInt(process.env.CONCURRENCY, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    CONFIG.concurrency = parsed;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url) {
  const response = await axios.get(url, {
    timeout: CONFIG.timeoutMs,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; PartsScraper/1.0; +https://www.northridge4x4.com)",
      Accept: "text/html,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  return response.data;
}

function extractPartUrlsFromSitemap(xmlText) {
  const matches = [...xmlText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const partUrls = matches.filter((url) => {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname === "www.northridge4x4.com" &&
        parsed.pathname.startsWith("/part/")
      );
    } catch {
      return false;
    }
  });
  return [...new Set(partUrls)];
}

function cleanText(value) {
  if (!value) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function parseJsonLdProduct($) {
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const script of scripts) {
    const raw = $(script).contents().text();
    if (!raw || !raw.trim()) continue;
    try {
      const data = JSON.parse(raw);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        if (item && item["@type"] === "Product") {
          return item;
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }
  return null;
}

function getMeta($, key, attr = "property") {
  const value = $(`meta[${attr}="${key}"]`).attr("content");
  return cleanText(value);
}

function parsePartPage(url, html) {
  const $ = cheerio.load(html);
  const jsonLd = parseJsonLdProduct($);

  const row = {
    url,
    canonical_url: $('link[rel="canonical"]').attr("href") || "",
    title: cleanText($("title").text()),
    name: getMeta($, "og:title", "property") || cleanText(jsonLd?.name),
    brand: getMeta($, "product:brand", "property") || cleanText(jsonLd?.brand?.name),
    mfr_part_no: getMeta($, "product:mfr_part_no", "property"),
    retailer_item_id: getMeta($, "product:retailer_item_id", "property"),
    price: getMeta($, "product:price:amount", "property"),
    currency: getMeta($, "product:price:currency", "property"),
    availability: getMeta($, "product:availability", "property"),
    condition: getMeta($, "product:condition", "property"),
    category: getMeta($, "product:category", "property"),
    retailer_category: getMeta($, "product:retailer_category", "property"),
    shipping_weight_value: getMeta($, "product:shipping_weight:value", "property"),
    shipping_weight_units: getMeta($, "product:shipping_weight:units", "property"),
    og_description: getMeta($, "og:description", "property"),
    meta_description: getMeta($, "description", "name"),
    meta_keywords: getMeta($, "keywords", "name"),
    image: getMeta($, "og:image", "property") || cleanText(jsonLd?.image),
    sku: cleanText(jsonLd?.sku),
    gtin: cleanText(jsonLd?.gtin),
    mpn: cleanText(jsonLd?.mpn),
    jsonld_description: cleanText(jsonLd?.description),
    scraped_at_utc: new Date().toISOString(),
  };

  return row;
}

function csvEscape(value) {
  const str = value == null ? "" : String(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n");
}

async function fetchWithRetry(url) {
  let lastError;
  for (let i = 0; i <= CONFIG.retryCount; i += 1) {
    try {
      return await fetchText(url);
    } catch (error) {
      lastError = error;
      if (i < CONFIG.retryCount) {
        await sleep(CONFIG.retryDelayMs * (i + 1));
      }
    }
  }
  throw lastError;
}

async function runPool(items, worker, concurrency) {
  const queue = [...items];
  const runners = new Array(concurrency).fill(0).map(async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function main() {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  console.log(`Fetching sitemap: ${CONFIG.sitemapUrl}`);
  const sitemapXml = await fetchWithRetry(CONFIG.sitemapUrl);
  const partUrls = extractPartUrlsFromSitemap(sitemapXml);
  const limit = process.env.LIMIT ? Number.parseInt(process.env.LIMIT, 10) : null;
  const targetUrls =
    Number.isFinite(limit) && limit > 0 ? partUrls.slice(0, limit) : partUrls;

  console.log(`Found ${partUrls.length} part URLs.`);
  if (targetUrls.length === 0) {
    throw new Error("No /part/ URLs found in sitemap.");
  }
  if (targetUrls.length !== partUrls.length) {
    console.log(`LIMIT enabled: scraping first ${targetUrls.length} URLs.`);
  }

  const results = [];
  const failures = [];
  let completed = 0;

  await runPool(
    targetUrls,
    async (url) => {
      try {
        const html = await fetchWithRetry(url);
        const row = parsePartPage(url, html);
        results.push(row);
      } catch (error) {
        failures.push({
          url,
          error: error && error.message ? error.message : String(error),
        });
      } finally {
        completed += 1;
        if (completed % 100 === 0 || completed === targetUrls.length) {
          console.log(`Progress: ${completed}/${targetUrls.length}`);
        }
      }
    },
    CONFIG.concurrency
  );

  fs.writeFileSync(CONFIG.outputJson, JSON.stringify(results, null, 2), "utf-8");
  fs.writeFileSync(CONFIG.outputCsv, toCsv(results), "utf-8");

  if (failures.length > 0) {
    const failurePath = path.join(CONFIG.outputDir, "failures.json");
    fs.writeFileSync(failurePath, JSON.stringify(failures, null, 2), "utf-8");
    console.log(`Saved ${failures.length} failures to ${failurePath}`);
  }

  console.log(`Saved ${results.length} rows to:`);
  console.log(`- ${CONFIG.outputJson}`);
  console.log(`- ${CONFIG.outputCsv}`);
}

main().catch((error) => {
  console.error("Scrape failed:", error.message || error);
  process.exit(1);
});
