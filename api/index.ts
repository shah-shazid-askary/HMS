import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";

// Fallback handler for when the full app fails to initialize
const fallback = express();
fallback.use((_req: Request, res: Response) => {
  res.status(503).json({ error: { message: "Service unavailable — check environment variables (DATABASE_URL, JWT_SECRET)", code: "SERVICE_UNAVAILABLE" } });
});

async function buildApp() {
  const { createExpressMiddleware } = await import("@trpc/server/adapters/express");
  const { registerOAuthRoutes } = await import("../server/_core/oauth");
  const { registerStorageProxy } = await import("../server/_core/storageProxy");
  const { createContext } = await import("../server/_core/context");
  const { appRouter } = await import("../server/routers");

  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  const trpcMiddleware = createExpressMiddleware({ router: appRouter, createContext });

  // Health check endpoint for Vercel
  app.get(["/api", "/api/health"], (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      service: "clinical-ledger-api",
      timestamp: new Date().toISOString(),
      db: !!(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL),
    });
  });

  // Support both /api/trpc and /trpc
  app.use("/api/trpc", trpcMiddleware);
  app.use("/trpc", trpcMiddleware);

  // JSON error handler — must be 4-param signature
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[API Error]", err);
    if (!res.headersSent) {
      res.status(err?.status || 500).json({
        error: {
          message: err?.message || "Internal server error",
          code: err?.code || "INTERNAL_SERVER_ERROR",
        },
      });
    }
  });

  return app;
}

// Build once and reuse across invocations
let appPromise: Promise<express.Express> | null = null;

export default async function handler(req: Request, res: Response) {
  if (!appPromise) {
    appPromise = buildApp().catch((err) => {
      console.error("[Startup Error]", err);
      appPromise = null; // allow retry next invocation
      throw err;
    });
  }

  try {
    const app = await appPromise;
    app(req, res);
  } catch (err: any) {
    console.error("[Handler Error]", err);
    if (!res.headersSent) {
      res.status(503).json({
        error: {
          message: "Service failed to start: " + (err?.message || "Unknown error"),
          code: "SERVICE_UNAVAILABLE",
        },
      });
    }
  }
}
