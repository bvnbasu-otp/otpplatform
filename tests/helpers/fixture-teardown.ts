/**
 * Deletes requirement fixtures that have committee votes.
 *
 * Votes and quote versions are append-only (INV-095, INV-064). Cascading a
 * requirement delete into those tables is refused. demo_reset is the one
 * supported exception, and only for rows flagged is_demo. Teardown uses that
 * same window, then removes the requirement. It does not relax the guards.
 */
import { Client } from 'pg';

const LOCAL_PG = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

export async function deleteFixtureRequirements(requirementIds: string[]): Promise<void> {
  if (requirementIds.length === 0) return;

  const client = new Client(LOCAL_PG);
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('otp.demo_reset', 'on', true)`);
    await client.query(
      `UPDATE rfqs SET is_demo = true WHERE requirement_id = ANY($1::uuid[])`,
      [requirementIds],
    );
    await client.query(
      `DELETE FROM committee_votes
       WHERE rfq_id IN (SELECT id FROM rfqs WHERE requirement_id = ANY($1::uuid[]))`,
      [requirementIds],
    );
    await client.query(
      `DELETE FROM quote_versions
       WHERE quote_id IN (
         SELECT q.id FROM quotes q
         JOIN rfqs r ON r.id = q.rfq_id
         WHERE r.requirement_id = ANY($1::uuid[])
       )`,
      [requirementIds],
    );
    await client.query(`DELETE FROM requirements WHERE id = ANY($1::uuid[])`, [requirementIds]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
