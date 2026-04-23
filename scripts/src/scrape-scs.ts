// SendCutSend capability scraper.
//
// Fetches SCS's public material-catalog pages and turns them into structured
// JSON that Fabware's scsRules.ts can be refreshed against. This runs
// manually, not in CI — scraping a partner's site continuously is sketchy
// and will get our IP blocked. Run this at most once per quarter and review
// the diff before committing the new catalog.
//
// ToS check: as of 2026-04-23 SCS's robots.txt allows the /materials/* paths.
// Double-check before running. If they add a Disallow rule, stop and ask SCS
// for a direct catalog feed instead.
//
// Usage:
//   pnpm --filter @workspace/scripts exec tsx src/scrape-scs.ts \
//       > ../artifacts/api-server/data/scs-catalog.json

interface ScrapedMaterial {
  slug: string;
  url: string;
  name: string;
  thicknessesIn: number[];
  canBend: boolean | null;
  canPowderCoat: boolean | null;
  raw?: { title?: string; headings?: string[] };
}

const BASE = "https://sendcutsend.com";

// Seed list — refresh manually by pulling /materials sitemap entries.
const MATERIAL_SLUGS = [
  "materials/aluminum",
  "materials/steel",
  "materials/stainless-steel",
  "materials/copper",
  "materials/brass",
  "materials/plastics",
  "materials/composites",
];

const UA = "FabwareCatalogRefresh/0.1 (+https://fabware.dev; graham@ocutrap.com)";

function politeDelay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(path: string): Promise<string> {
  const url = `${BASE}/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html" },
  });
  if (!res.ok) {
    throw new Error(`${url} → ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

// Extract thickness tokens like 0.024" / 0.036" / 1/8" from the body text.
function parseThicknesses(html: string): number[] {
  const found = new Set<number>();
  const decimal = html.matchAll(/(\d+\.\d{2,4})\s*(?:"|in\b|inch)/gi);
  for (const m of decimal) {
    const v = Number(m[1]);
    if (v > 0 && v <= 0.5) found.add(v);
  }
  const fraction = html.matchAll(/\b(\d{1,2})\/(\d{1,2})\s*(?:"|in\b|inch)/gi);
  for (const m of fraction) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 0 && b > 0 && a / b <= 0.5) found.add(a / b);
  }
  return Array.from(found).sort((a, b) => a - b);
}

function parseCapabilities(html: string): { canBend: boolean | null; canPowderCoat: boolean | null } {
  const lower = html.toLowerCase();
  const canBend = /bend/.test(lower) && !/cannot\s+be\s+bent|no\s+bending/.test(lower);
  const canPowderCoat =
    /powder\s*coat/.test(lower) && !/cannot\s+be\s+powder|no\s+powder/.test(lower);
  return { canBend, canPowderCoat };
}

function parseTitle(html: string): string | undefined {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].trim() : undefined;
}

async function scrapeMaterial(slug: string): Promise<ScrapedMaterial> {
  const url = `${BASE}/${slug}`;
  try {
    const html = await fetchPage(slug);
    const thicknesses = parseThicknesses(html);
    const caps = parseCapabilities(html);
    const title = parseTitle(html);
    return {
      slug,
      url,
      name: title?.replace(/\s*\|.*$/, "").trim() ?? slug,
      thicknessesIn: thicknesses,
      canBend: caps.canBend,
      canPowderCoat: caps.canPowderCoat,
      raw: { title },
    };
  } catch (err) {
    return {
      slug,
      url,
      name: slug,
      thicknessesIn: [],
      canBend: null,
      canPowderCoat: null,
      raw: { title: `ERROR: ${(err as Error).message}` },
    };
  }
}

async function main(): Promise<void> {
  const out: ScrapedMaterial[] = [];
  for (const slug of MATERIAL_SLUGS) {
    const m = await scrapeMaterial(slug);
    out.push(m);
    await politeDelay(1500); // 1.5s between requests — under SCS's published rate limits
  }
  process.stdout.write(JSON.stringify({ scrapedAt: new Date().toISOString(), materials: out }, null, 2));
  process.stdout.write("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
