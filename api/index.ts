import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "../server/_core/oauth";
import { registerStorageProxy } from "../server/_core/storageProxy";
import { createContext } from "../server/_core/context";
import { appRouter } from "../server/routers";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

registerStorageProxy(app);
registerOAuthRoutes(app);

const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext,
});

// Health check endpoint for Vercel
app.get(["/api", "/api/health"], (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "clinical-ledger-api",
    timestamp: new Date().toISOString(),
    db: !!(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL),
  });
});

// tRPC routes
app.use("/api/trpc", trpcMiddleware);
app.use("/trpc", trpcMiddleware);

// JSON error handler — must have 4 params for Express to recognize it as an error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[API Error]", err?.message || err);
  if (!res.headersSent) {
    res.status(err?.status || 500).json({
      error: {
        message: err?.message || "Internal server error",
        code: err?.code || "INTERNAL_SERVER_ERROR",
      },
    });
  }
});

// Vercel expects the Express app as the default export
export default app;
