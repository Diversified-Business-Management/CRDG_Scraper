import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

const EDITABLE = new Set([
  'is_rejected', 'reject_reason', 'is_hero', 'position',
  'alt_text_en', 'alt_text_es', 'photo_type', 'url_source', 'url_supabase',
]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!EDITABLE.has(k)) continue;
    patch[k] = v === '' ? null : v;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'no editable fields' }, { status: 400 });

  const supabase = createAdminSupabase();

  // If marking a photo is_hero=true, unmark any existing hero on the same listing first.
  if (patch['is_hero'] === true) {
    const { data: target } = await supabase
      .from('photos')
      .select('canonical_listing_id')
      .eq('id', id)
      .single();
    if (target?.canonical_listing_id) {
      await supabase
        .from('photos')
        .update({ is_hero: false })
        .eq('canonical_listing_id', target.canonical_listing_id)
        .neq('id', id);
    }
  }

  const { data, error } = await supabase.from('photos').update(patch).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = createAdminSupabase();
  const { error } = await supabase.from('photos').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id });
}
