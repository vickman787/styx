import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";

export function healthRouter(db: DatabaseSync, productionAsset?: string) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/live", (_req, res) => res.json({ status: "ok" }));
  router.get("/ready", (_req, res) => {
    try {
      db.prepare("SELECT id FROM workspace LIMIT 1").get();
      if (productionAsset && !existsSync(productionAsset))
        throw new Error("Build missing");
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  return router;
}
