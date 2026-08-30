// Read-only diagnostic: inspect the live Supabase Postgres schema (RLS, columns,
// policies) so we know whether the browser can write a profiles row.
const { Client } = require('pg');

const HOST = process.env.DIAG_DB_HOST || 'db.banrojskoitemzwosvfm.supabase.co';
const CONN = `postgresql://postgres:${encodeURIComponent(process.env.DIAG_DB_PASSWORD || '')}@${HOST}:5432/postgres`;

const QUERIES = {
  'rls_status': `
    select schemaname, relname, relrowsecurity, relforcerowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_tables t on t.tablename = c.relname and t.schemaname = n.nspname
    where n.nspname='public'
    order by relname;`,
  'policies': `
    select schemaname, tablename, policyname, cmd, roles, qual, with_check
    from pg_policies where schemaname='public' order by tablename, policyname;`,
  'profiles_columns': `
    select column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema='public' and table_name='profiles'
    order by ordinal_position;`,
  'users_columns': `
    select column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema='public' and table_name='users'
    order by ordinal_position;`,
  'grants': `
    select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
    from information_schema.role_table_grants
    where table_schema='public' and table_name in ('profiles','users')
    group by table_name, grantee order by table_name, grantee;`,
  'counts': `
    select 'profiles' as t, count(*)::text as n from public.profiles
    union all select 'users', count(*)::text from public.users
    union all select 'auth.users', count(*)::text from auth.users;`,
  'auth_users': `
    select id, email, raw_app_meta_data->>'provider' as provider, email_confirmed_at, created_at
    from auth.users order by created_at desc limit 20;`,
};

(async () => {
  const client = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  try {
    await client.connect();
    console.log('connected to', HOST);
    for (const [name, sql] of Object.entries(QUERIES)) {
      console.log('\n===== ' + name + ' =====');
      try {
        const { rows } = await client.query(sql);
        if (!rows.length) { console.log('(no rows)'); continue; }
        for (const r of rows) console.log(JSON.stringify(r));
      } catch (e) {
        console.log('QUERY ERROR: ' + e.message);
      }
    }
  } catch (e) {
    console.log('CONNECT ERROR: ' + e.message);
  } finally {
    await client.end().catch(() => {});
  }
})();
