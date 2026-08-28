import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createContext } from "../server/_core/context";
import { appRouter } from "../server/routers";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Normalize URL for Vercel serverless rewrites
app.use((req: Request, _res: Response, next: NextFunction) => {
  const matchedPath = req.headers["x-matched-path"] as string | undefined;
  if (matchedPath && matchedPath.startsWith("/api/trpc")) {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    req.url = matchedPath + query;
  }
  next();
});

const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext,
});

// Health check endpoints
app.get(["/api", "/api/health", "/health", "/api/index"], (_req: Request, res: Response) => {
  const hasDatabaseUrl = !!(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL);
  const hasJwtSecret = !!process.env.JWT_SECRET;
  res.status(200).json({
    status: "ok",
    service: "clinical-ledger-api",
    env: { db: hasDatabaseUrl, jwt: hasJwtSecret },
    ts: new Date().toISOString(),
  });
});

// tRPC API routes on all possible mount points
app.use("/api/trpc", trpcMiddleware);
app.use("/trpc", trpcMiddleware);
app.use("/api", trpcMiddleware);

// JSON error handler middleware
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const e = err as { status?: number; message?: string; code?: string } | null;
  console.error("[API Error]", e?.message ?? err);
  if (!res.headersSent) {
    res.status(e?.status ?? 500).json({
      error: {
        message: e?.message ?? "Internal server error",
        code: e?.code ?? "INTERNAL_SERVER_ERROR",
      },
    });
  }
});

// Fallback 404 JSON response (prevents serverless hang / HTML 500 error)
app.use((req: Request, res: Response) => {
  if (!res.headersSent) {
    res.status(404).json({
      error: {
        message: `Cannot ${req.method} ${req.originalUrl || req.url}`,
        code: "NOT_FOUND",
      },
    });
  }
});

// Vercel serverless function entry point
const handler = async (req: Request, res: Response) => {
  return new Promise<void>((resolve) => {
    res.on("finish", () => resolve());
    res.on("close", () => resolve());

    try {
      app(req, res, (err?: unknown) => {
        if (err) {
          const e = err as { status?: number; message?: string; code?: string } | null;
          console.error("[Unhandled Express error]", e?.message ?? err);
          if (!res.headersSent) {
            res.status(e?.status ?? 500).json({
              error: {
                message: e?.message ?? "Internal server error",
                code: e?.code ?? "INTERNAL_SERVER_ERROR",
              },
            });
          }
        } else if (!res.headersSent) {
          res.status(404).json({
            error: {
              message: `Unhandled route: ${req.method} ${req.url}`,
              code: "NOT_FOUND",
            },
          });
        }
        resolve();
      });
    } catch (err) {
      const e = err as { status?: number; message?: string } | null;
      console.error("[Handler crash]", e?.message ?? err);
      if (!res.headersSent) {
        res.status(e?.status ?? 500).json({
          error: { message: e?.message ?? "Internal server error", code: "INTERNAL_SERVER_ERROR" },
        });
      }
      resolve();
    }
  });
};

export default handler;
