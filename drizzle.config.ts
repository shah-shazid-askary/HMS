import { defineConfig } from "drizzle-kit";

const connectionString = process.env.SUPABASE_MIGRATION_DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL;
if (!connectionString) {
  throw new Error("SUPABASE_MIGRATION_DATABASE_URL or SUPABASE_DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
