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
  const app = req.app;
  const routes: string[] = [];
  const walk = (stack: unknown[]): void => {
    for (const layer of stack as Array<{
      route?: { path: string; methods: Record<string, boolean> };
      name?: string;
      handle?: { stack?: unknown[] };
    }>) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).join(",").toUpperCase();
        routes.push(`${methods} ${layer.route.path}`);
      } else if (layer.name === "router" && layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  // Express 5 stores the main router stack at app.router.stack
  const mainRouter = (app as unknown as { router?: { stack?: unknown[] }; _router?: { stack?: unknown[] } });
  const stack = mainRouter.router?.stack ?? mainRouter._router?.stack ?? [];
  walk(stack);
  res.json({ routes });
});

export default router;
