'use client';

import { createBrowserClient } from '@supabase/ssr';

let _client: ReturnType<typeof createBrowserClient> | null = null;

export function createBrowserSupabase() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  _client = createBrowserClient(url, anonKey);
  return _client;
}
