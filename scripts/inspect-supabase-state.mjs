import postgres from "postgres";

const connectionString = process.env.SUPABASE_MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_MIGRATION_DATABASE_URL is required.");
const client = postgres(connectionString, { max: 1, prepare: false, connect_timeout: 10 });
try {
  const tables = await client`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `;
  const migrationRows = await client`
    select count(*)::int as count
    from information_schema.tables
    where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
  `;
  const migrationHistory = await client`
    select hash, created_at
    from drizzle.__drizzle_migrations
    order by created_at
  `;
  const constraints = await client`
    select conname
    from pg_constraint
    where connamespace = 'public'::regnamespace and contype = 'f'
    order by conname
  `;
  const indexes = await client`
    select indexname
    from pg_indexes
    where schemaname = 'public' and tablename like 'hms_%'
    order by indexname
  `;
  const triggers = await client`
    select trigger_name
    from information_schema.triggers
    where event_object_schema = 'public'
    order by trigger_name
  `;
  const enumTypes = await client`
    select typname
    from pg_type
    where typnamespace = 'public'::regnamespace and typtype = 'e'
    order by typname
  `;
  const columns = await client`
    select table_name, column_name, data_type, udt_name
    from information_schema.columns
    where table_schema = 'public' and (table_name = 'users' or table_name like 'hms_%')
    order by table_name, ordinal_position
  `;
  const counts = {};
  for (const tableName of tables.map((row) => row.table_name).filter((name) => name === 'users' || name.startsWith('hms_'))) {
    const [count] = await client.unsafe(`select count(*)::int as count from public.${tableName}`);
    counts[tableName] = count.count;
  }
  console.log(JSON.stringify({ publicTables: tables.map((row) => row.table_name), drizzleMigrationTable: migrationRows[0]?.count === 1, migrationHistory, foreignKeys: constraints.map((row) => row.conname), indexes: indexes.map((row) => row.indexname), triggers: triggers.map((row) => row.trigger_name), enumTypes: enumTypes.map((row) => row.typname), columns, counts }));
} finally {
  await client.end({ timeout: 5 });
}
