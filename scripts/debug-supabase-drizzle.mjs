import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { patients, users } from "../drizzle/schema.ts";

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is required.");
const client = postgres(connectionString, { max: 1, prepare: false, fetch_types: false, connect_timeout: 10 });
const db = drizzle({ client });
try {
  console.time("user-read");
  const user = await db.select().from(users).where(eq(users.openId, "demo_hms_admin")).limit(1);
  console.timeEnd("user-read");
  console.time("patient-read");
  const patientRows = await db.select({ id: patients.id }).from(patients).limit(1);
  console.timeEnd("patient-read");
  console.log(JSON.stringify({ administratorFound: user.length === 1, patientRows: patientRows.length }));
} finally {
  await client.end({ timeout: 5 });
}
