# Fabware

AI harness for hardware. Describe the part you want — Fabware designs it, validates it against real manufacturing rules, exports a production-ready DXF for [SendCutSend](https://sendcutsend.com), and fills out the rest of your bill of materials from McMaster-Carr.

Chat left, design right. A "Lovable for hardware."

## Status

Live at https://fabware-drab.vercel.app. The studio is open: no sign-in, and projects are scoped to an anonymous per-browser key (`localStorage` `fabware.owner`). That key keeps project lists separate; it is not authentication, so anyone holding a project URL can open and edit it.

See [`docs/PLAN.md`](docs/PLAN.md) for scope and roadmap.

## Layout

```
artifacts/
  hardwareai/        The app: Vite + React + shadcn/ui + react-three-fiber, Convex backend
    src/             Landing, studio (project list), workspace (chat + 3D + BOM), export
    convex/          Schema, design agent, validators, DXF/PDF/OBJ export, SCS rule sync
  mockup-sandbox/    Scratch
docs/                Plan, ADRs, conventions
```

## How a design turn runs

1. The browser calls `agentRuns.start`: it stores the user's message, marks the project `agentRun.status = "running"`, and schedules `projectChat.runTurn`.
2. `runTurn` loops: call Claude with the tools in `convex/assemblyDesigner.ts`, apply each tool call, send the results back along with the validator's current findings, repeat until the model stops calling tools (or hits the step / time limit).
3. Every action and the closing summary are written to `messages` as they happen and `projects.agentRun.step` tracks the current step, so the workspace follows along through reactive queries. Stop sets `cancelRequested`; the loop halts before its next model call.

Models and pricing live in `convex/lib/models.ts`. A daily spend cap (`FABWARE_DAILY_USD_CAP`, default $25) refuses new turns once the day's model spend passes it.

## Getting started

Requires `pnpm` and Node 20+.

```bash
pnpm install
cd artifacts/hardwareai
npx convex dev                                  # your own dev deployment
npx convex env set ANTHROPIC_API_KEY <key>
VITE_CONVEX_URL=<deployment url> pnpm dev       # http://localhost:5173
```

Checks: `pnpm test` (vitest), `npx tsc -p tsconfig.json --noEmit` (app), `npx tsc -p convex/tsconfig.json --noEmit` (backend).

Deploy: `npx convex deploy` from `artifacts/hardwareai`, then push `main` (Vercel builds the frontend). Deploy the backend first: the frontend calls functions that must already exist.

## Partners

- **[SendCutSend](https://sendcutsend.com)** — laser / waterjet / CNC flat-stock (DXF export, rule validation in `scsRules.ts`). The rules engine syncs SCS's official published catalog + specs feeds daily (`convex/scsSync.ts`), so min hole size, min part size, stock status and per-SKU bending limits come from SCS itself rather than a hand-maintained snapshot.
- **[McMaster-Carr](https://www.mcmaster.com)** — off-the-shelf fasteners, bearings, extrusion, etc. (part-number → deep-link, no scraping)
- **[step.parts](https://www.step.parts)** — purchased hardware resolves against the step.parts catalog (real STEP/GLB geometry per part)

## License

TBD.
