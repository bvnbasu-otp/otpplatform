/**
 * OTP Next — Resilient Supabase RPC & PostgREST Base Adapter
 */

import type { TypedSupabaseClient } from '@otp/database';
import { ok, err, type Result } from '../types/result';
import {
  ServiceError,
  NotFoundError,
  ForbiddenError,
  TransitionError,
  ValidationError,
} from '../types/errors';

export function normalizeSupabaseError(error: unknown): ServiceError {
  if (error instanceof ServiceError) {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const pgError = error as { code?: string; message?: string; details?: string; hint?: string };
    const msg = pgError.message || pgError.details || 'Database operation failed';
    const code = pgError.code || 'DB_ERROR';

    if (code === 'PGRST116' || msg.toLowerCase().includes('not found')) {
      return new NotFoundError(msg);
    }
    if (code === '42501' || msg.toLowerCase().includes('permission denied') || msg.toLowerCase().includes('violates row-level security')) {
      return new ForbiddenError(msg);
    }
    if (code === '23505' || msg.toLowerCase().includes('duplicate key') || msg.toLowerCase().includes('already exists')) {
      return new ValidationError(`Resource already exists: ${msg}`);
    }
    if (code === 'P0001' || msg.toLowerCase().includes('invalid transition') || msg.toLowerCase().includes('state')) {
      return new TransitionError('current', 'target', msg);
    }
    return new ServiceError(code, msg);
  }

  return new ServiceError('UNKNOWN_ERROR', String(error));
}

export async function safeRpcCall<T>(
  client: TypedSupabaseClient | any,
  fnName: string,
  args: Record<string, unknown> = {},
): Promise<Result<T, ServiceError>> {
  try {
    const { data, error } = await client.rpc(fnName, args);
    if (error) {
      return err(normalizeSupabaseError(error));
    }
    return ok(data as T);
  } catch (error) {
    return err(normalizeSupabaseError(error));
  }
}
