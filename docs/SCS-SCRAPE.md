# Refreshing the SendCutSend rules catalog

Fabware's `scsRules.ts` encodes SCS's public materials catalog (material names, thicknesses, powder-coat availability, bend capability) so the AI designer can validate parts at design time. That catalog drifts — SCS adds materials and stocks new thicknesses. This doc is how we keep ours in sync.

## Rules

1. **Never run the scraper in CI or on a schedule.** Partner scraping that hammers their server will get our IP blocked and burns goodwill. Refresh manually, at most once a quarter.
2. **Double-check `robots.txt` before every run.** If `Disallow: /materials/*` appears, stop and email SCS's partnerships team for a direct feed instead.
3. **Diff the output. Commit the diff.** The scraper writes to `artifacts/api-server/data/scs-catalog.json`. Open a PR with the new JSON and the derived edits to `scsRules.ts`. Never auto-apply.
4. **Keep the delay.** The script waits 1.5 s between requests. Don't lower it.
5. **Identify yourself.** The `User-Agent` string in `scrape-scs.ts` names Fabware and includes a contact email. Don't strip it.

## How to run

```bash
cd /Users/grahampatterson/fabware
mkdir -p artifacts/api-server/data
pnpm --filter @workspace/scripts exec tsx src/scrape-scs.ts \
    > artifacts/api-server/data/scs-catalog.json
```

Review the output, open `artifacts/api-server/src/lib/scsRules.ts`, and hand-merge changes into `SCS_MATERIALS`. The scraper deliberately does not write directly to `scsRules.ts` — every catalog edit gets a human in the loop.

## What the scraper does

1. Fetches a hardcoded seed list of `/materials/*` pages (aluminum, steel, stainless, copper, brass, plastics, composites).
2. Parses each page for decimal and fractional inch thicknesses in the body text.
3. Greps for the words "bend" and "powder coat" to set a best-guess bend/powder flag.
4. Writes a single JSON blob — material → `{ name, thicknesses, canBend, canPowderCoat }`.

It's a crude signal, not a source of truth. Treat its output as a checklist of things to verify manually on SCS's site.

## What the scraper *doesn't* do

- Pricing tiers — those change too often and are only visible mid-quote.
- Min feature sizes per material — not published on the material overview pages; need to read each material's detail PDF.
- Powder-coat color list — separate `/finishing/powder-coat` page; add a second scraper if we ever need it.

## Long-term plan

The manual refresh works for now. When we're bigger, request an API or CSV feed from SCS's partnerships team. Scraping is a stopgap, not the endgame.
