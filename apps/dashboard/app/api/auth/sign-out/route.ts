import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  } catch {
    // ignore — best-effort sign-out
  }
  const origin = new URL(req.url).origin;
  return NextResponse.redirect(`${origin}/login`, { status: 302 });
}
