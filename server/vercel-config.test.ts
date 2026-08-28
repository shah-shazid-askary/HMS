import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel deployment configuration", () => {
  it("uses Build Output API with only a buildCommand declared in vercel.json", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
    expect(config.buildCommand).toBe("npm run build:vercel");
    // Routing is handled by .vercel/output/config.json written by build-vercel.mjs
    // vercel.json intentionally has no outputDirectory or rewrites
    expect(config.outputDirectory).toBeUndefined();
    expect(config.rewrites).toBeUndefined();
  });
});
