import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;

if (!connectionString) {
  console.error("ERROR: No DATABASE_URL or SUPABASE_DATABASE_URL found in environment.");
  process.exit(1);
}

console.log("Connecting to Supabase PostgreSQL at:", connectionString.replace(/:[^:@]+@/, ":****@"));

const sql = postgres(connectionString, {
  max: 1,
  prepare: false,
  idle_timeout: 20,
  connect_timeout: 15,
});

async function main() {
  try {
    const setupSqlPath = path.resolve(import.meta.dirname, "..", "supabase", "setup.sql");
    const sqlContent = fs.readFileSync(setupSqlPath, "utf-8");

    console.log("Applying Supabase schema and seed data from supabase/setup.sql...");
    await sql.unsafe(sqlContent);
    console.log("Schema and seed data applied successfully!");

    // Verify tables
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND (table_name = 'users' OR table_name LIKE 'hms_%')
      ORDER BY table_name;
    `;
    console.log("Verified tables in database:", tables.map(t => t.table_name));

    // Verify patient count
    const [patientCount] = await sql`SELECT count(*)::int AS count FROM hms_patients;`;
    const [clinicianCount] = await sql`SELECT count(*)::int AS count FROM hms_clinicians;`;
    const [userCount] = await sql`SELECT count(*)::int AS count FROM users;`;

    console.log(`Summary: ${userCount.count} users, ${clinicianCount.count} clinicians, ${patientCount.count} patients.`);
    console.log("Supabase backend connection verified successfully!");
  } catch (err) {
    console.error("Error during Supabase setup:", err);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
