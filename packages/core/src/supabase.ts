import { createClient, SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import { env } from './env.js';

let svcClient: SupabaseClient | null = null;
export function getServiceClient(): SupabaseClient {
  if (!svcClient) {
    svcClient = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'public' },
    });
  }
  return svcClient;
}

let pgPool: pg.Pool | null = null;
export function getPgPool(): pg.Pool {
  if (!pgPool) {
    pgPool = new pg.Pool({
      connectionString: env.supabase.dbUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return pgPool;
}

export async function pgQuery<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await getPgPool().query(text, params as unknown[] | undefined);
  return result.rows as T[];
}
