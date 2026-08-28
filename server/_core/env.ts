export const ENV = {
  appId: process.env.VITE_APP_ID ?? "clinical-ledger",
  cookieSecret: process.env.JWT_SECRET ?? "hms-clinical-ledger-secure-jwt-secret-2026",
  databaseUrl: process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || "",
  supabaseUrl: process.env.SUPABASE_URL ?? "https://vbprbwlafqvxwcubrsfl.supabase.co",
  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(process.env.PORT || "3000"),
};
