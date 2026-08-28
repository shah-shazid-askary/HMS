import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  authenticateUser: vi.fn(async (email: string, password: string) => {
    if (password !== "correct-password") return undefined;
    const role = email.startsWith("admin") ? "admin" : email.startsWith("doctor") ? "doctor" : "receptionist";
    return {
      id: 21,
      openId: `user_${role}`,
      name: `${role} user`,
      email,
      role: role as "admin" | "doctor" | "receptionist",
      loginMethod: "supabase",
      passwordHash: "hash",
      isActive: "yes" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
  }),
}));

vi.mock("./db", () => ({ authenticateUser: mocks.authenticateUser }));
vi.mock("./_core/sdk", () => ({ sdk: { createSessionToken: vi.fn(async (openId: string) => `session-${openId}`) } }));

import { appRouter } from "./routers";

function context(): { ctx: TrpcContext; cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> } {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  return {
    ctx: {
      user: null,
      req: { protocol: "https", headers: {} } as unknown as TrpcContext["req"],
      res: {
        cookie: (name: string, value: string, options: Record<string, unknown>) => {
          cookies.push({ name, value, options });
          return {} as unknown;
        },
      } as unknown as TrpcContext["res"],
    },
    cookies,
  };
}

describe("auth.login", () => {
  it("issues a protected session cookie and token for valid credentials", async () => {
    for (const [email, expectedRole] of [
      ["admin@clinicalledger.demo", "admin"],
      ["doctor@clinicalledger.demo", "doctor"],
      ["reception@clinicalledger.demo", "receptionist"],
    ] as const) {
      const { ctx, cookies } = context();
      const result = await appRouter.createCaller(ctx).auth.login({ email, password: "correct-password" });
      expect(result.role).toBe(expectedRole);
      expect(result.token).toBe(`session-user_${expectedRole}`);
      expect(cookies[0]).toMatchObject({ name: "app_session_id", value: `session-user_${expectedRole}` });
      expect(cookies[0]?.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    }
  });

  it("rejects invalid credential pairs without issuing a session", async () => {
    const { ctx, cookies } = context();
    await expect(
      appRouter.createCaller(ctx).auth.login({ email: "doctor@clinicalledger.demo", password: "wrong-password" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(cookies).toHaveLength(0);
  });

  it("never exposes credential-sensitive fields in the authenticated session response", async () => {
    const { ctx } = context();
    ctx.user = {
      id: 21,
      openId: "user_admin",
      name: "admin user",
      email: "admin@clinicalledger.demo",
      loginMethod: "supabase",
      passwordHash: "sensitive-hash",
      role: "admin",
      isActive: "yes",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as NonNullable<TrpcContext["user"]>;
    const result = await appRouter.createCaller(ctx).auth.me();
    expect(result).toEqual({ id: 21, name: "admin user", email: "admin@clinicalledger.demo", loginMethod: "supabase", role: "admin" });
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("openId");
  });
});
