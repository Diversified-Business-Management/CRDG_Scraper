import { createServerSupabase } from './supabase/server';
import type { SessionUser, UserRole } from './types';

const FAKE_AUTH = process.env.NEXT_PUBLIC_DEV_FAKE_AUTH === 'true';

/**
 * Returns the signed-in user with derived role, or null. With NEXT_PUBLIC_DEV_FAKE_AUTH=true,
 * returns a synthetic admin user so the UI can be browsed without configured auth.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (FAKE_AUTH) {
    return {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'demo-admin@costaricadreamgroup.com',
      role: 'admin',
    };
  }
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    const meta = (data.user.app_metadata ?? {}) as Record<string, unknown>;
    const role: UserRole = meta.role === 'admin' ? 'admin' : 'realtor';
    return {
      id: data.user.id,
      email: data.user.email ?? '',
      role,
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser | null> {
  return getSessionUser();
}
