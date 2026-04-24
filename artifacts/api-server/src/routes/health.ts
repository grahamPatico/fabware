import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isDatabaseConfigured } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Public config probe — the frontend reads this on boot to decide whether
// the studio should be live or show a "backend not provisioned yet" state.
router.get("/config", (_req, res) => {
  res.json({
    databaseConfigured: isDatabaseConfigured,
    anthropicConfigured:
      !!process.env.ANTHROPIC_API_KEY ||
      !!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    version: "0.1.0",
  });
});

export default router;
