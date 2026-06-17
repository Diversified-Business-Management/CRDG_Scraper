import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase/admin';

const Body = z.object({
  decision: z.enum(['accept', 'reject']),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const supabase = createAdminSupabase();

  // Look up the agent record matching the user's email so we can attribute
  // the review. If none exists, leave reviewed_by null.
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('email', user.email)
    .maybeSingle();

  const update: Record<string, unknown> = {
    reviewed_at: new Date().toISOString(),
    reviewed_by: agent?.id ?? null,
    method: parsed.data.decision === 'accept' ? 'human' : 'human_rejected',
  };

  // Bump confidence to reflect human override
  if (parsed.data.decision === 'accept') update.confidence = 1.0;
  else update.confidence = 0.0;

  const { error } = await supabase.from('dedup_links').update(update).eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
