import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  name: string;
};

export type AuthenticatedUser = User;

// Safe fallback secret to ensure token generation/verification never crashes even if env var is missing
const DEFAULT_JWT_SECRET = "hms-clinical-ledger-secure-jwt-secret-2026";

export class SDKServer {
  private getSessionSecret(): Uint8Array {
    const secret = ENV.cookieSecret || process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
    return new TextEncoder().encode(secret);
  }

  private parseCookies(cookieHeader: string | undefined): Map<string, string> {
    if (!cookieHeader) {
      return new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    const entries = Object.entries(parsed).filter(
      (e): e is [string, string] => e[1] !== undefined
    );
    return new Map(entries);
  }

  /**
   * Create a signed session JWT token for a user openId
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId,
      name: options.name || "",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  /**
   * Verify and decode a session token
   */
  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; name: string } | null> {
    if (!cookieValue) {
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, name } = payload as Record<string, unknown>;

      if (!isNonEmptyString(openId)) {
        return null;
      }

      return {
        openId,
        name: typeof name === "string" ? name : "",
      };
    } catch {
      return null;
    }
  }

  /**
   * Authenticate an incoming Express HTTP request using cookie or Authorization header.
   * Resolves the user from the Supabase PostgreSQL database.
   */
  async authenticateRequest(req: Request): Promise<AuthenticatedUser | null> {
    // 1. Try Bearer Authorization header first
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      if (token) {
        const session = await this.verifySession(token);
        if (session) {
          const user = await db.getUserByOpenId(session.openId);
          if (user && user.isActive === "yes") {
            await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
            return user;
          }
        }
      }
    }

    // 2. Try session cookie
    const cookies = this.parseCookies(req.headers.cookie);
    const cookieToken = cookies.get(COOKIE_NAME);
    if (cookieToken) {
      const session = await this.verifySession(cookieToken);
      if (session) {
        const user = await db.getUserByOpenId(session.openId);
        if (user && user.isActive === "yes") {
          await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
          return user;
        }
      }
    }

    return null;
  }
}

export const sdk = new SDKServer();
