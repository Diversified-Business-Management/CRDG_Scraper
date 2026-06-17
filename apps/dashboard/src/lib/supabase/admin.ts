import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. Bypasses RLS. Server-only — never import this from
 * a client component or surface its key to the browser.
 */
export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
