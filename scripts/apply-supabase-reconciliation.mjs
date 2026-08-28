import postgres from "postgres";

const connectionString = process.env.SUPABASE_MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_MIGRATION_DATABASE_URL is required.");
const client = postgres(connectionString, { max: 1, prepare: false, connect_timeout: 10 });

const statements = [
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hms_active_state' AND typnamespace = 'public'::regnamespace) THEN
       CREATE TYPE public.hms_active_state AS ENUM ('yes', 'no');
     END IF;
   END; $$;`,
  `CREATE OR REPLACE FUNCTION public.set_hms_updated_at()
     RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
     BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'clinical_notes_set_updated_at' AND tgrelid = 'public.hms_clinical_notes'::regclass) THEN
       CREATE TRIGGER clinical_notes_set_updated_at BEFORE UPDATE ON public.hms_clinical_notes
       FOR EACH ROW EXECUTE FUNCTION public.set_hms_updated_at();
     END IF;
   END; $$;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS hms_availability_slot_uq
     ON public.hms_availability_windows (clinician_id, weekday, start_minute, end_minute);`,
  `ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;`,
  `ALTER TABLE IF EXISTS public.hms_clinicians ENABLE ROW LEVEL SECURITY;`,
  `ALTER TABLE IF EXISTS public.hms_patients ENABLE ROW LEVEL SECURITY;`,
  `ALTER TABLE IF EXISTS public.hms_availability_windows ENABLE ROW LEVEL SECURITY;`,
  `ALTER TABLE IF EXISTS public.hms_appointments ENABLE ROW LEVEL SECURITY;`,
  `ALTER TABLE IF EXISTS public.hms_bills ENABLE ROW LEVEL SECURITY;`,
  `ALTER TABLE IF EXISTS public.hms_payments ENABLE ROW LEVEL SECURITY;`,
  `ALTER TABLE IF EXISTS public.hms_clinical_notes ENABLE ROW LEVEL SECURITY;`,
  `ALTER TABLE IF EXISTS public.hms_prescriptions ENABLE ROW LEVEL SECURITY;`,
  `ALTER TABLE IF EXISTS public.hms_prescription_items ENABLE ROW LEVEL SECURITY;`,
  `ALTER TABLE IF EXISTS public.hms_laboratory_orders ENABLE ROW LEVEL SECURITY;`,
  `ALTER TABLE IF EXISTS public.hms_laboratory_results ENABLE ROW LEVEL SECURITY;`,
];

try {
  for (const statement of statements) await client.unsafe(statement);
  console.log("Supabase reconciliation migration applied successfully.");
} finally {
  await client.end({ timeout: 5 });
}
