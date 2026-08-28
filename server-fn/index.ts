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

// Health check — always responds, even when DB is not reachable
app.get(["/api", "/api/health"], (_req: Request, res: Response) => {
  const hasDatabaseUrl = !!(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL);
  const hasJwtSecret   = !!process.env.JWT_SECRET;
  res.status(200).json({
    status : "ok",
    service: "clinical-ledger-api",
    env    : { db: hasDatabaseUrl, jwt: hasJwtSecret },
    ts     : new Date().toISOString(),
  });
});

// tRPC routes
app.use("/api/trpc", trpcMiddleware);
app.use("/trpc",     trpcMiddleware);

// ── JSON error handler ────────────────────────────────────────────────────────
// 4-arg signature is required for Express to recognise this as an error handler.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const e = err as { status?: number; message?: string; code?: string } | null;
  console.error("[API Error]", e?.message ?? err);
  if (res.headersSent) return;
  res.status(e?.status ?? 500).json({
    error: {
      message: e?.message ?? "Internal server error",
      code   : e?.code    ?? "INTERNAL_SERVER_ERROR",
    },
  });
});

// ── Vercel entry point ────────────────────────────────────────────────────────
// Vercel calls the default export as (req, res) — Express apps implement this
// interface directly, so exporting `app` is the correct pattern.
//
// We wrap it so that any synchronous top-level throw is caught and returned as
// JSON instead of making Vercel emit its generic "A server error" HTML page.
const handler = async (req: Request, res: Response) => {
  try {
    await new Promise<void>((resolve, reject) => {
      app(req, res, (err?: unknown) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    const e = err as { status?: number; message?: string } | null;
    console.error("[Handler crash]", e?.message ?? err);
    if (!res.headersSent) {
      res.status(e?.status ?? 500).json({
        error: { message: e?.message ?? "Internal server error" },
      });
    }
  }
};

export default handler;
