import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "../server/_core/oauth";
import { registerStorageProxy } from "../server/_core/storageProxy";
import { createContext } from "../server/_core/context";
import { appRouter } from "../server/routers";

/**
 * Vercel Serverless Function entrypoint.
 * Static frontend files are served by Vercel from dist/public;
 * this function handles OAuth, storage proxying, and tRPC API routes.
 */
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
  res.status(200).json({ status: "ok", service: "clinical-ledger-api", timestamp: new Date().toISOString() });
});

// Support both /api/trpc and /trpc
app.use("/api/trpc", trpcMiddleware);
app.use("/trpc", trpcMiddleware);

// JSON error handler to prevent HTML/text error pages from breaking tRPC JSON parser
app.use((err: Error | any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Server Error]", err);
  if (!res.headersSent) {
    res.status(500).json({
      error: {
        message: err?.message || "Internal server error",
        code: "INTERNAL_SERVER_ERROR",
      },
    });
  }
});

export default app;
