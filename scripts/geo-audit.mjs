// GEO/SEO audit of power-car.ru via TypeSafe AI's "Jev" evaluation model (Vercel AI Gateway).
// Usage: node scripts/geo-audit.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { experimental_evaluate as evaluate } from "ai";
import { createGateway } from "@ai-sdk/gateway";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// load .env.local (not using dotenv dep to keep this dependency-free beyond ai/gateway)
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });
const jev = gateway.evaluationModel("typesafe-ai/jev");

const SITE = "https://power-car.ru";
const MAX_CHARS = 5000;
const CONCURRENCY = 8;
const PRICE_INPUT_PER_TOKEN = 0.000000042; // from gateway /config catalog, output is $0

function getUrls() {
  const xml = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  return locs.slice(0, 200);
}

function extractPage(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  doc.querySelectorAll("nav, header, footer, script, style, noscript, .site-header, .site-footer, .site-nav, #header, #footer, #nav").forEach((el) => el.remove());
  const title =
    doc.querySelector("title")?.textContent?.trim() ||
    doc.querySelector("h1")?.textContent?.trim() ||
    "";
  const main = doc.querySelector("main") || doc.body;
  let text = (main?.textContent || "").replace(/\s+/g, " ").trim();
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
  return { title, text };
}

const QUESTIONS = {
  directAnswer: {
    type: "boolean",
    instructions:
      "The state is a webpage (title + main text, Russian). Does the page give a direct, self-contained answer in its first 1-3 paragraphs that an AI assistant (ChatGPT, Claude) could quote verbatim to answer a user's question, without needing to read further? True only if a concrete, complete answer appears near the top.",
  },
  concreteFacts: {
    type: "boolean",
    instructions:
      "The state is a webpage (title + main text, Russian). Does the page contain concrete, checkable facts: specific numbers, prices, dates, model/brand names, percentages, named people or companies? False if the page is vague, generic marketing language with no specifics.",
  },
  citeLikelihood: {
    type: "score",
    instructions:
      "The state is a webpage (title + main text, Russian) from a car-import business site. How likely is an AI assistant (ChatGPT, Claude, Perplexity) to cite or quote this page when answering a relevant user question on this topic, given how self-contained, factual, and well-structured the answer is?",
    criteria: [
      "Never — no clear question this page answers, or answer is buried/absent",
      "Unlikely — topic is relevant but answer is vague, scattered, or requires interpretation",
      "Likely — clear topic and a real answer, though not perfectly quotable",
      "Very likely — a specific question is answered directly, concisely, with facts, near the top",
    ],
  },
  pageType: {
    type: "choice",
    instructions: "The state is a webpage (title + main text, Russian). Classify its primary type.",
    criteria: {
      article: "Blog/informational article explaining a topic (how-to, rules, comparisons)",
      landing: "Sales/landing page for a product category or service, meant to drive a conversion",
      about: "Company/about-us/contacts page",
      list: "A catalog, index, or listing of many items (cars, articles) without deep unique content of its own",
      other: "Doesn't fit the above (tool/calculator, homepage, utility page)",
    },
  },
  mainFix: {
    type: "choice",
    instructions:
      "The state is a webpage (title + main text, Russian) from a car-import business site, being audited for AI-search (GEO) citability. What is the single highest-impact fix to make this page more likely to be cited by an AI assistant?",
    criteria: {
      add_direct_answer: "Add a direct, quotable answer to the page's core question near the top",
      add_facts: "Add concrete facts, numbers, prices, or named specifics — page is currently too vague",
      add_faq_block: "Add an explicit Q&A / FAQ block covering the likely user questions",
      fix_title: "Rework the title/H1 to match the actual question users ask, not just company framing",
      none: "Page is already in solid shape for AI citability, no major fix needed",
    },
  },
};

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function auditOne(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const { title, text } = extractPage(html);
  if (!text) throw new Error("empty text after extraction");
  const result = await evaluate({
    model: jev,
    state: { url, title, text },
    questions: QUESTIONS,
  });
  return { url, title, result };
}

async function main() {
  const urls = getUrls();
  console.log(`Auditing ${urls.length} pages via typesafe-ai/jev...`);
  const rows = [];
  let totalInputTokens = 0;
  let failed = 0;
  let idx = 0;

  async function worker() {
    while (idx < urls.length) {
      const url = urls[idx++];
      try {
        const { title, result } = await auditOne(url);
        const a = result.answers;
        totalInputTokens += result.usage?.inputTokens || 0;
        rows.push({
          url,
          title,
          pageType: a.pageType.choice,
          directAnswer: a.directAnswer.probability >= 0.5,
          concreteFacts: a.concreteFacts.probability >= 0.5,
          citeLikelihood: a.citeLikelihood.score,
          mainFix: a.mainFix.choice,
        });
        process.stdout.write(`\r${rows.length + failed}/${urls.length}`);
      } catch (e) {
        failed++;
        console.error(`\nFAIL ${url}: ${e.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`\nDone. ${rows.length} ok, ${failed} failed.`);

  // CSV
  const header = ["url", "title", "pageType", "directAnswer", "concreteFacts", "citeLikelihood", "mainFix"];
  const csv = [header.join(",")]
    .concat(rows.map((r) => header.map((h) => csvEscape(r[h])).join(",")))
    .join("\n");
  fs.writeFileSync(path.join(ROOT, "audit.csv"), csv, "utf8");

  // Aggregates
  const sorted = [...rows].sort((a, b) => a.citeLikelihood - b.citeLikelihood);
  const worst10 = sorted.slice(0, 10);
  const best5 = [...rows].sort((a, b) => b.citeLikelihood - a.citeLikelihood).slice(0, 5);
  const avgScore = rows.reduce((s, r) => s + r.citeLikelihood, 0) / rows.length;

  const byType = {};
  for (const r of rows) {
    byType[r.pageType] ??= { count: 0, sum: 0 };
    byType[r.pageType].count++;
    byType[r.pageType].sum += r.citeLikelihood;
  }

  const fixLabels = {
    add_direct_answer: "добавить прямой ответ",
    add_facts: "добавить факты и цифры",
    add_faq_block: "добавить блок вопрос-ответ",
    fix_title: "поправить заголовок",
    none: "ничего",
  };
  const typeLabels = { article: "статья", landing: "лендинг", about: "о нас", list: "список", other: "другое" };

  const cost = totalInputTokens * PRICE_INPUT_PER_TOKEN;

  let md = `# GEO/SEO-аудит power-car.ru\n\n`;
  md += `Модель: typesafe-ai/jev (Vercel AI Gateway). Страниц проверено: ${rows.length} из ${urls.length} (ошибок: ${failed}).\n\n`;
  md += `**Общий балл сайта (цитируемость AI-ассистентами, 0-3): ${avgScore.toFixed(2)}**\n\n`;

  md += `## Сводка по типам страниц\n\n`;
  md += `| Тип | Страниц | Средний балл |\n|---|---|---|\n`;
  for (const [type, v] of Object.entries(byType).sort((a, b) => b[1].sum / b[1].count - a[1].sum / a[1].count)) {
    md += `| ${typeLabels[type] || type} | ${v.count} | ${(v.sum / v.count).toFixed(2)} |\n`;
  }

  md += `\n## 10 худших страниц\n\n`;
  md += `| URL | Тип | Балл | Правка |\n|---|---|---|---|\n`;
  for (const r of worst10) {
    md += `| [${r.title || r.url}](${r.url}) | ${typeLabels[r.pageType] || r.pageType} | ${r.citeLikelihood.toFixed(2)} | ${fixLabels[r.mainFix] || r.mainFix} |\n`;
  }

  md += `\n## 5 лучших страниц\n\n`;
  md += `| URL | Тип | Балл |\n|---|---|---|\n`;
  for (const r of best5) {
    md += `| [${r.title || r.url}](${r.url}) | ${typeLabels[r.pageType] || r.pageType} | ${r.citeLikelihood.toFixed(2)} |\n`;
  }

  md += `\n## Стоимость\n\nВходных токенов: ${totalInputTokens}. Цена: $${PRICE_INPUT_PER_TOKEN}/токен (выход бесплатный). Итого: $${cost.toFixed(4)}.\n`;

  fs.writeFileSync(path.join(ROOT, "audit.md"), md, "utf8");
  console.log(`\naudit.csv + audit.md written. Avg score ${avgScore.toFixed(2)}. Cost ~$${cost.toFixed(4)} (${totalInputTokens} input tokens).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
