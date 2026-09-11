import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  });
  await client.connect();
  console.log('Connected to Postgres');

  const sql = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/00060_comprehensive_notifications_engine.sql'),
    'utf-8'
  );

  await client.query(sql);
  console.log('Successfully executed migration 00060_comprehensive_notifications_engine.sql!');
  await client.end();
}

main().catch((err) => {
  console.error('Failed to apply migration 00060:', err);
  process.exit(1);
});
