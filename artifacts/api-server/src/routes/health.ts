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
  const stack = (app.router as { stack?: Array<Record<string, unknown>> } | undefined)?.stack ?? [];
  const layers = stack.map((l) => ({
    name: l.name,
    regexp: String(l.regexp ?? ""),
    hasRoute: !!l.route,
    routePath: (l.route as { path?: string } | undefined)?.path,
    handleStackSize: ((l.handle as { stack?: unknown[] } | undefined)?.stack ?? []).length,
  }));
  res.json({ topLevelCount: stack.length, layers });
});

export default router;
