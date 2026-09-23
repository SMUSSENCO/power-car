// Fetch + extract text for all sitemap pages (no external API — feeds Claude's own manual audit).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MAX_CHARS = 5000;
const CONCURRENCY = 12;

function getUrls() {
  const xml = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).slice(0, 200);
}

function extractPage(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  doc.querySelectorAll("nav, header, footer, script, style, noscript").forEach((el) => el.remove());
  const title = doc.querySelector("title")?.textContent?.trim() || doc.querySelector("h1")?.textContent?.trim() || "";
  const main = doc.querySelector("main") || doc.body;
  let text = (main?.textContent || "").replace(/\s+/g, " ").trim();
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
  return { title, text };
}

async function main() {
  const urls = getUrls();
  console.log(`Scraping ${urls.length} pages...`);
  const pages = [];
  let idx = 0;
  async function worker() {
    while (idx < urls.length) {
      const url = urls[idx++];
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const { title, text } = extractPage(html);
        pages.push({ url, title, text });
      } catch (e) {
        console.error(`FAIL ${url}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  pages.sort((a, b) => urls.indexOf(a.url) - urls.indexOf(b.url));
  fs.writeFileSync(path.join(ROOT, "scripts", "geo-audit-pages.json"), JSON.stringify(pages, null, 0));
  console.log(`Wrote ${pages.length} pages to scripts/geo-audit-pages.json`);
}

main();
