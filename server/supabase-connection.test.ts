import postgres from "postgres";
import { describe, expect, it } from "vitest";

const connectionString = process.env.SUPABASE_MIGRATION_DATABASE_URL;
const supabaseDescribe = connectionString ? describe : describe.skip;

supabaseDescribe("Supabase PostgreSQL connection", () => {
  it("authenticates and reaches the configured database", async () => {
    const client = postgres(connectionString!, { max: 1, prepare: false, connect_timeout: 10 });
    try {
      const result = await client<{ database: string }[]>`select current_database() as database`;
      expect(result[0]?.database).toBe("postgres");
    } finally {
      await client.end({ timeout: 5 });
    }
  }, 20_000);
});
