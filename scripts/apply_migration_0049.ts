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
    path.join(__dirname, '../supabase/migrations/00049_seamless_committee_voting_and_access.sql'),
    'utf-8'
  );

  await client.query(sql);
  console.log('Successfully executed migration 00049!');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
