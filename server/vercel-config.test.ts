import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel deployment configuration", () => {
  it("routes API and tRPC traffic through the Serverless Function and publishes Vite output", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
    expect(config.buildCommand).toBe("npm run build:vercel");
    expect(config.outputDirectory).toBe("dist/public");
    expect(config.rewrites[0]).toMatchObject({ source: "/api/(.*)", destination: "/api/index" });
    expect(config.rewrites[1]).toMatchObject({ source: "/trpc/(.*)", destination: "/api/index" });
  });
});
