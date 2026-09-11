import type { DatabaseClient } from './client';

export interface RepositoryContext {
  client: DatabaseClient;
  actorId: string;
}

export function createRepositoryContext(
  client: DatabaseClient,
  actorId: string,
): RepositoryContext {
  return { client, actorId };
}
