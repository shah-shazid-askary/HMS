import { readFile } from "node:fs/promises";
import postgres from "postgres";

const connectionString = process.env.SUPABASE_MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_MIGRATION_DATABASE_URL is required.");
const client = postgres(connectionString, { max: 1, prepare: false, connect_timeout: 10 });
const source = await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8");
const statements = source.split(/;\s*(?=--|INSERT|UPDATE|$)/m).map((statement) => statement.trim()).filter(Boolean);

try {
  for (const statement of statements) await client.unsafe(statement);
  console.log(`Applied ${statements.length} idempotent Supabase seed statements.`);
} finally {
  await client.end({ timeout: 5 });
}
