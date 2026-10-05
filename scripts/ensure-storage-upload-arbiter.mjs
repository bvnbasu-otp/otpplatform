/**
 * Recreate storage.objects unique index bucketid_objname after a local reset.
 *
 * The storage API upserts with ON CONFLICT (name, bucket_id). Storage
 * migration drop-bucketid-objname-index removed that non-partial unique
 * index, and the remaining unique indexes are either versioned or partial
 * (COLLATE "C"), so Postgres raises 42P10. Project migrations run as
 * postgres, which is not the owner of storage.objects, so this index is
 * applied by supabase_admin through the local docker socket. No credential
 * is read or printed. Hosted projects are not contacted.
 */
import { execFileSync } from 'node:child_process';

const sql =
  'CREATE UNIQUE INDEX IF NOT EXISTS bucketid_objname ON storage.objects USING btree (bucket_id, name);';

execFileSync(
  'docker',
  [
    'exec',
    'supabase_db_otp-local',
    'psql',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ],
  { stdio: 'inherit' },
);
