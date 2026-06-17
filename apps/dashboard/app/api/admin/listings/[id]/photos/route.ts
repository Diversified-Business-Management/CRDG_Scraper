import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

/** Add a photo to a listing by URL. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { url?: string; alt?: string; is_hero?: boolean };
  if (!body.url) return NextResponse.json({ error: 'url required' }, { status: 400 });

  const supabase = createAdminSupabase();

  // Find current max position
  const { data: existing } = await supabase
    .from('photos')
    .select('position')
    .eq('canonical_listing_id', id)
    .order('position', { ascending: false })
    .limit(1);
  const nextPos = (existing?.[0]?.position ?? -1) + 1;

  // If this is being added as hero, demote others
  if (body.is_hero) {
    await supabase.from('photos').update({ is_hero: false }).eq('canonical_listing_id', id);
  }

  const { data, error } = await supabase
    .from('photos')
    .insert({
      canonical_listing_id: id,
      url_source: body.url,
      alt_text_en: body.alt ?? null,
      position: nextPos,
      is_hero: body.is_hero ?? false,
      is_rejected: false,
      photo_type: 'manual',
      ai_validated: true,        // human-uploaded — bypasses AI vision filter
      ai_validation_notes: 'manually added by admin',
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
