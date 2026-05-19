import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

const EDITABLE = new Set([
  'status', 'listing_type', 'property_type', 'property_subtype',
  'title_en', 'title_es', 'description_en', 'description_es', 'description_raw',
  'price', 'price_currency', 'price_usd', 'list_price_original_usd', 'sold_price_usd',
  'hoa_fee_usd', 'hoa_fee_frequency', 'hoa_amenities', 'hoa_name',
  'taxes_usd_annual', 'tax_year', 'estimated_closing_usd', 'rental_income_potential', 'luxury_tax_yn',
  'bedrooms', 'bathrooms', 'bathrooms_full', 'bathrooms_half',
  'interior_sqm', 'lot_sqm', 'total_structure_area_sqm',
  'year_built', 'year_renovated', 'stories_total', 'floor_number', 'total_floors_in_bldg',
  'construction_status', 'condition', 'architectural_style', 'new_construction_yn',
  'parking_spaces', 'garage_spaces', 'parking_features', 'parking_yn',
  'pool_features', 'pool_yn', 'jacuzzi_yn',
  'view_types', 'waterfront_yn', 'waterfront_features', 'beachfront_yn',
  'features', 'interior_features', 'exterior_features', 'appliances',
  'flooring', 'cooling', 'heating', 'furnishings_included',
  'bedroom_features', 'dining_room_features', 'family_room_features', 'kitchen_features',
  'laundry_features', 'fireplaces_count', 'fireplace_features',
  'foundation', 'roof',
  'title_status', 'maritime_zone', 'foreigner_buyable',
  'road_access', 'water_source', 'electricity', 'internet_quality',
  'internet_types', 'television_types', 'ac_types', 'telephone_yn',
  'zoning',
  'region_slug', 'province', 'canton', 'district', 'locality', 'address_line', 'postal_code',
  'community_name', 'building_name', 'gated_community',
  'lat', 'lng', 'geocode_confidence',
  'distance_to_beach_km', 'distance_to_airport_km', 'nearest_airport_code',
  'distance_to_hospital_km', 'nearest_hospital_name',
  'distance_to_school_km', 'nearest_school_name',
  'distance_to_grocery_km', 'school_district', 'elementary_school', 'secondary_school',
  'mls_id', 'mls_status', 'agent_id', 'listed_at', 'days_on_market', 'under_contract', 'sold_at',
  'listing_agent_name', 'listing_agent_phone', 'listing_agent_email',
  'source_brokerage', 'source_brokerage_phone', 'primary_source_url',
  'virtual_tour_url', 'video_url', 'floorplan_url',
  'tags_human', 'tags_ai', 'categories', 'property_labels',
  'tour_360_url', 'video_thumbnail_url', 'energy_class', 'energy_index',
  'show_map', 'show_street_view', 'attachments',
  'notes', 'realtor_review_status', 'realtor_review_notes', 'internal_quality_score',
]);

function clean(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!EDITABLE.has(k)) continue;
    out[k] = v === '' ? null : v;
  }
  return out;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as Record<string, unknown>;
  const patch = clean(body);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no editable fields in body' }, { status: 400 });
  }
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from('canonical_listings')
    .update(patch)
    .eq('id', id)
    .select('id, slug, updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = createAdminSupabase();
  // Cascade-delete via FK constraints handles photos, dedup_links, listing_embeddings, sync_log
  const { error } = await supabase.from('canonical_listings').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id });
}
