export const ENV = {
  appId: process.env.VITE_APP_ID ?? "clinical-ledger",
  cookieSecret: process.env.JWT_SECRET ?? "hms-clinical-ledger-secure-jwt-secret-2026",
  databaseUrl: process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || "",
  supabaseUrl: process.env.SUPABASE_URL ?? "https://vbprbwlafqvxwcubrsfl.supabase.co",
  supabaseAuthUrl: process.env.SUPABASE_AUTH_URL ?? "https://vbprbwlafqvxwcubrsfl.supabase.co/auth/v1/oauth/authorize",
  supabaseTokenUrl: process.env.SUPABASE_TOKEN_URL ?? "https://vbprbwlafqvxwcubrsfl.supabase.co/auth/v1/oauth/token",
  supabaseJwksUrl: process.env.SUPABASE_JWKS_URL ?? "https://vbprbwlafqvxwcubrsfl.supabase.co/auth/v1/.well-known/jwks.json",
  supabaseOidcUrl: process.env.SUPABASE_OIDC_URL ?? "https://vbprbwlafqvxwcubrsfl.supabase.co/auth/v1/.well-known/openid-configuration",
  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(process.env.PORT || "3000"),
};
