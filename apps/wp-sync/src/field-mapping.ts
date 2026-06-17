/**
 * Maps a canonical_listings row to Houzez `property` post fields.
 * Houzez stores most data in postmeta with 'fave_*' keys.
 */
import type { RegionSlug } from '@crdg/core';

export interface CanonicalRow {
  id: string;
  slug: string;
  status: string;
  property_type: string | null;
  title_en: string | null;
  title_es: string | null;
  description_en: string | null;
  description_es: string | null;
  price: number | null;
  price_currency: string | null;
  price_usd: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  interior_sqm: number | null;
  lot_sqm: number | null;
  year_built: number | null;
  region_slug: RegionSlug | null;
  province: string | null;
  canton: string | null;
  district: string | null;
  locality: string | null;
  address_line: string | null;
  lat: number | null;
  lng: number | null;
  features: string[] | null;
  tags_ai: string[] | null;
  tags_human: string[] | null;
  hoa_fee_usd: number | null;
  taxes_usd_annual: number | null;
  mls_id: string | null;
  agent_id: string | null;
  wp_post_id: number | null;
  wp_content_hash: string | null;
}

export interface PostPayload {
  postFields: Record<string, unknown>;
  meta: Record<string, string | number>;
  taxonomies: Record<string, string[]>; // taxonomy_slug → term names to assign
}

/**
 * Compute a stable hash of fields that should trigger re-sync.
 * Used to skip unchanged listings.
 */
export function computeContentHash(row: CanonicalRow): string {
  const subset = {
    title_en: row.title_en, description_en: row.description_en,
    price_usd: row.price_usd, bedrooms: row.bedrooms, bathrooms: row.bathrooms,
    interior_sqm: row.interior_sqm, lot_sqm: row.lot_sqm, year_built: row.year_built,
    lat: row.lat, lng: row.lng, address_line: row.address_line, locality: row.locality,
    canton: row.canton, province: row.province, region_slug: row.region_slug,
    features: [...(row.features ?? [])].sort(),
    tags_ai: [...(row.tags_ai ?? [])].sort(),
    tags_human: [...(row.tags_human ?? [])].sort(),
    status: row.status,
  };
  const json = JSON.stringify(subset);
  // Simple deterministic hash; full crypto isn't necessary
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h) ^ json.charCodeAt(i);
  return `h${(h >>> 0).toString(16)}`;
}

const REGION_DISPLAY: Record<RegionSlug, string> = {
  'central-pacific': 'Central Pacific',
  'guanacaste': 'Guanacaste',
  'central-valley': 'Central Valley',
  'nicoya': 'Nicoya Peninsula',
  'caribbean': 'Caribbean Coast',
  'south-pacific': 'South Pacific',
};

const TYPE_DISPLAY: Record<string, string> = {
  house: 'House',
  condo: 'Condo',
  lot: 'Lot / Land',
  farm: 'Farm',
  commercial: 'Commercial',
  hotel: 'Hotel',
  other: 'Other',
};

export function mapToHouzez(row: CanonicalRow): PostPayload {
  const meta: Record<string, string | number> = {};
  if (row.price_usd != null) meta['fave_property_price'] = row.price_usd;
  meta['fave_currency'] = 'USD';
  if (row.bedrooms != null) meta['fave_property_bedrooms'] = row.bedrooms;
  if (row.bathrooms != null) meta['fave_property_bathrooms'] = row.bathrooms;
  if (row.interior_sqm != null) {
    meta['fave_property_size'] = row.interior_sqm;
    meta['fave_property_size_prefix'] = 'm²';
  }
  if (row.lot_sqm != null) meta['fave_property_land'] = row.lot_sqm;
  if (row.year_built != null) meta['fave_property_year'] = row.year_built;
  if (row.lat != null && row.lng != null) {
    meta['fave_property_location'] = `${row.lat},${row.lng}`;
    const addressParts = [row.address_line, row.locality, row.canton, row.province, 'Costa Rica'].filter(Boolean).join(', ');
    if (addressParts) meta['fave_property_map_address'] = addressParts;
    meta['fave_property_map'] = 'enable';
    meta['fave_property_map_street_view'] = 'enable';
  }
  if (row.hoa_fee_usd != null) meta['fave_property_hoa_dues'] = row.hoa_fee_usd;
  if (row.mls_id) meta['fave_property_id'] = row.mls_id;

  const taxonomies: Record<string, string[]> = {};
  if (row.region_slug) taxonomies['property_city'] = [REGION_DISPLAY[row.region_slug]];
  if (row.canton) taxonomies['property_state'] = [row.canton];
  if (row.property_type) {
    const display = TYPE_DISPLAY[row.property_type];
    if (display) taxonomies['property_type'] = [display];
  }
  if (row.features?.length) {
    taxonomies['property_feature'] = row.features.map(humanizeFeature);
  }
  if (row.tags_ai?.length || row.tags_human?.length) {
    taxonomies['property_label'] = [...new Set([...(row.tags_ai ?? []), ...(row.tags_human ?? [])])].map(humanizeFeature);
  }

  const postFields: Record<string, unknown> = {
    title: row.title_en || row.title_es || '(untitled listing)',
    slug: row.slug,
    content: row.description_en || row.description_es || '',
    status: row.status === 'active' ? 'publish' : 'draft',
  };

  return { postFields, meta, taxonomies };
}

function humanizeFeature(s: string): string {
  return s.split(/[_-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
