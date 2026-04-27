import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase/admin';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createAdminSupabase();

  const { data: existing, error: readErr } = await supabase
    .from('source_configs')
    .select('id, enabled')
    .eq('source_id', id)
    .maybeSingle();

  if (readErr || !existing) {
    return NextResponse.json(
      { error: readErr?.message ?? 'Source config missing' },
      { status: 404 }
    );
  }

  const { error } = await supabase
    .from('source_configs')
    .update({ enabled: !existing.enabled })
    .eq('id', existing.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, enabled: !existing.enabled });
}
