# Supabase PostgreSQL Migration Design

## Target architecture

Clinical Ledger will continue to use its existing React, Express, tRPC, and Drizzle application architecture. The persistence layer will change from `drizzle-orm/mysql2` and MySQL table definitions to `drizzle-orm/postgres-js` and PostgreSQL table definitions. The browser will continue to call only the application’s protected tRPC API; it will not receive a Supabase service key or connect directly to database tables.

For a Vercel deployment, `DATABASE_URL` should be the **Supavisor Transaction pooler** connection string from the Supabase Connect panel. The database driver will set `prepare: false`, because transaction pooling does not support prepared statements. A separate `MIGRATION_DATABASE_URL` can point to the direct connection for migrations and administrative SQL.

| Concern | PostgreSQL/Supabase design |
|---|---|
| Driver | `postgres` with Drizzle’s `postgres-js` adapter. |
| Serverless runtime | Module-scoped client with `max: 1` and `prepare: false` for transaction pooling. |
| Schema | `drizzle/schema.ts` uses `pgTable`, PostgreSQL enum types, foreign keys, indexes, check constraints, and nullable archive metadata. |
| Migration source | `supabase/migrations/0001_clinical_ledger.sql` is paste-ready SQL for the Supabase SQL Editor and remains the source of truth for a fresh Supabase project. |
| Seed source | `supabase/seed.sql` provides deterministic, idempotent demo accounts and HMS operational/clinical records. |
| Application reads | Active operational views filter `archived_at IS NULL`; archive APIs return archived records only. |
| Integrity | Database foreign keys and check constraints complement the existing protected server-side archive/restore and scheduling checks. |

## Reference material

Drizzle documents the `postgres-js` adapter for Supabase and specifically instructs applications using Transaction pooling to disable prepared statements.[1] Supabase recommends Transaction pooler mode for serverless/edge functions and a direct connection for migrations; its direct host may require IPv6 unless the project has the IPv4 add-on.[2]

## References

[1]: https://orm.drizzle.team/docs/connect-supabase "Drizzle: Connect to Supabase"
[2]: https://supabase.com/docs/guides/database/connecting-to-postgres "Supabase: Connect to Postgres"
