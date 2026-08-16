# Fabware

AI harness for hardware. Describe the part you want — Fabware designs it, validates it against real manufacturing rules, exports a production-ready DXF for [SendCutSend](https://sendcutsend.com), and fills out the rest of your bill of materials from McMaster-Carr.

Chat left, design right. A "Lovable for hardware."

## Status

Early. Inherits a working prototype (chat → DSL → DXF → SCS handoff) and adds McMaster-Carr assembly parts. No auth yet — run locally.

See [`docs/PLAN.md`](docs/PLAN.md) for scope and roadmap.

## Monorepo layout

```
lib/
  api-spec/          OpenAPI source of truth (orval generates the rest)
  api-zod/           Generated Zod schemas
  api-client-react/  Generated React Query hooks
  db/                Drizzle schema (Postgres)
  integrations-anthropic-ai/
artifacts/
  api-server/        Express API
  hardwareai/        Vite + React + shadcn/ui workspace (chat + canvas)
  mockup-sandbox/    Scratch
docs/
  PLAN.md
```

## Getting started

Requires `pnpm`, Node 20+, and a Postgres database.

```bash
pnpm install
export DATABASE_URL=postgres://...
export ANTHROPIC_API_KEY=...
pnpm -r --filter @workspace/db run migrate     # if migrations are set up
pnpm -r run build
```

Dev:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/hardwareai run dev
```

## Partners

- **[SendCutSend](https://sendcutsend.com)** — laser / waterjet / CNC flat-stock (DXF export, rule validation in `scsRules.ts`). The rules engine syncs SCS's official published catalog + specs feeds daily (`convex/scsSync.ts`), so min hole size, min part size, stock status and per-SKU bending limits come from SCS itself rather than a hand-maintained snapshot.
- **[McMaster-Carr](https://www.mcmaster.com)** — off-the-shelf fasteners, bearings, extrusion, etc. (part-number → deep-link, no scraping)
- **[step.parts](https://www.step.parts)** — purchased hardware resolves against the step.parts catalog (real STEP/GLB geometry per part)

## License

TBD.
