import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Echo what Express sees so we can debug URL rewriting in serverless.
router.get("/echo", (req, res) => {
  res.json({
    url: req.url,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    path: req.path,
    method: req.method,
    params: req.params,
    query: req.query,
  });
});
router.get("/echo/*any", (req, res) => {
  res.json({ url: req.url, originalUrl: req.originalUrl, baseUrl: req.baseUrl, path: req.path });
});

// Diagnostic: lists every registered route so we can see what the deployed
// bundle actually mounted. Remove once the serverless wiring is stable.
router.get("/routes", (req, res) => {
  const app = req.app as unknown as Record<string, unknown>;
  const stack = (app.router as { stack?: Array<Record<string, unknown>> } | undefined)?.stack ?? [];
  const result: Array<{ mount: string; routes: string[] }> = [];
  for (const l of stack) {
    const handle = l.handle as { stack?: Array<Record<string, unknown>> } | undefined;
    if (!handle?.stack) continue;
    const routes: string[] = [];
    for (const sub of handle.stack) {
      const subHandle = sub.handle as { stack?: Array<Record<string, unknown>> } | undefined;
      if (sub.route) {
        const r = sub.route as { path: string; stack?: Array<{ method?: string }> };
        const methods = (r.stack ?? []).map((s) => s.method?.toUpperCase() ?? "?").join(",");
        routes.push(`${methods} ${r.path}`);
      } else if (subHandle?.stack) {
        // Nested sub-router
        for (const leaf of subHandle.stack) {
          if (leaf.route) {
            const r = leaf.route as { path: string; stack?: Array<{ method?: string }> };
            const methods = (r.stack ?? []).map((s) => s.method?.toUpperCase() ?? "?").join(",");
            routes.push(`${methods} ${r.path}`);
          }
        }
      }
    }
    result.push({ mount: String(l.regexp ?? l.name), routes });
  }
  res.json(result);
});

export default router;
