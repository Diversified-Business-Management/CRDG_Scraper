import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';

const Body = z.object({
  tags_human: z.array(z.string()).optional(),
  agent_id: z.string().uuid().nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const update: Record<string, unknown> = {};
  if (parsed.data.tags_human !== undefined) update.tags_human = parsed.data.tags_human;
  if (parsed.data.agent_id !== undefined) update.agent_id = parsed.data.agent_id;

  const { error } = await supabase
    .from('canonical_listings')
    .update(update)
    .eq('slug', slug);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
