import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  });
  await client.connect();
  console.log('Connected to Supabase Postgres');

  const sql = fs.readFileSync(
    path.join(__dirname, '../supabase/seed_master_role_accounts.sql'),
    'utf-8'
  );

  await client.query(sql);
  console.log('Successfully seeded master role accounts!');
  await client.end();
}

main().catch((err) => {
  console.error('Error applying seed:', err);
  process.exit(1);
});
