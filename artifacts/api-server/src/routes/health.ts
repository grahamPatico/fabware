import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Diagnostic: lists every registered route so we can see what the deployed
// bundle actually mounted. Remove once the serverless wiring is stable.
router.get("/routes", (req, res) => {
  const app = req.app as unknown as Record<string, unknown>;
  const routes: string[] = [];
  const walk = (stack: unknown[], prefix = ""): void => {
    for (const l of stack as Array<Record<string, unknown>>) {
      if (l.route) {
        const r = l.route as { path: string; methods?: Record<string, boolean>; stack?: Array<{ method?: string }> };
        const methods = r.methods
          ? Object.keys(r.methods).join(",").toUpperCase()
          : (r.stack ?? []).map((s) => s.method?.toUpperCase() ?? "*").join(",");
        routes.push(`${methods} ${prefix}${r.path}`);
      } else if (l.name === "router" && (l.handle as { stack?: unknown[] })?.stack) {
        walk((l.handle as { stack: unknown[] }).stack, prefix);
      }
    }
  };
  // Express 5: app.router exists. Fallback to _router (v4) and app itself.
  const candidates = [
    (app.router as { stack?: unknown[] } | undefined)?.stack,
    (app._router as { stack?: unknown[] } | undefined)?.stack,
    (app.stack as unknown[] | undefined),
  ].filter(Boolean) as unknown[][];
  const keys = Object.keys(app).slice(0, 40);
  for (const s of candidates) walk(s);
  res.json({
    routes,
    debug: {
      appKeys: keys,
      hasRouter: !!app.router,
      has_router: !!app._router,
      routerKeys: app.router ? Object.keys(app.router as Record<string, unknown>) : [],
    },
  });
});

export default router;
