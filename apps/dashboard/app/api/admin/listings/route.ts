import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

/** Create a new canonical listing manually (for realtor-direct entries). */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as Record<string, unknown>;
  const slug = (body['slug'] as string) ?? `manual-${Date.now().toString(36)}`;
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from('canonical_listings')
    .insert({
      slug,
      status: (body['status'] as string) ?? 'draft',
      listing_type: 'sale',
      property_type: (body['property_type'] as string) ?? 'other',
      title_en: body['title_en'] as string | null,
      title_es: body['title_es'] as string | null,
      description_en: body['description_en'] as string | null,
      price: body['price'] as number | null,
      price_currency: (body['price_currency'] as string) ?? 'USD',
      price_usd: body['price_usd'] as number | null,
      bedrooms: body['bedrooms'] as number | null,
      bathrooms: body['bathrooms'] as number | null,
      interior_sqm: body['interior_sqm'] as number | null,
      lot_sqm: body['lot_sqm'] as number | null,
      year_built: body['year_built'] as number | null,
      region_slug: body['region_slug'] as string | null,
      province: body['province'] as string | null,
      canton: body['canton'] as string | null,
      locality: body['locality'] as string | null,
      address_line: body['address_line'] as string | null,
      lat: body['lat'] as number | null,
      lng: body['lng'] as number | null,
      notes: body['notes'] as string | null,
      realtor_review_status: 'reviewed',
    })
    .select('id, slug')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
