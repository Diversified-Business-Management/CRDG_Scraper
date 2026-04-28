import { z } from 'zod';

export const RegionSlug = z.enum([
  'central-pacific',
  'guanacaste',
  'central-valley',
  'nicoya',
  'caribbean',
  'south-pacific',
]);
export type RegionSlug = z.infer<typeof RegionSlug>;

export const PropertyType = z.enum([
  'house', 'condo', 'lot', 'farm', 'commercial', 'hotel', 'other',
]);
export type PropertyType = z.infer<typeof PropertyType>;

export const Currency = z.enum(['USD', 'CRC']);
export type Currency = z.infer<typeof Currency>;

export const ListingStatus = z.enum([
  'draft', 'active', 'pending_review', 'sold', 'withdrawn', 'stale',
]);
export type ListingStatus = z.infer<typeof ListingStatus>;

/** Minimal photo descriptor as captured during scrape. */
export const RawPhoto = z.object({
  url: z.string().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  position: z.number().int().nonnegative().optional(),
  alt: z.string().optional(),
});
export type RawPhoto = z.infer<typeof RawPhoto>;

/** What a SourceAdapter returns from fetchListing(). */
export const RawListingPayload = z.object({
  source_listing_id: z.string().min(1),
  source_url: z.string().url(),
  raw_html: z.string().optional(),
  raw_extracted: z.record(z.string(), z.unknown()).optional(),
  /** Breadcrumbs as ordered array — adapter best-effort. e.g. ['Costa Rica','Cartago','Alvarado','Cervantes']. */
  breadcrumbs: z.array(z.string()).optional(),
  photos: z.array(RawPhoto).default([]),
});
export type RawListingPayload = z.infer<typeof RawListingPayload>;

/** Output of the AI extract stage. Aligned to the 95-field canonical schema. */
export const ExtractedListing = z.object({
  // Basic
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  language: z.enum(['en', 'es', 'mixed', 'unknown']).nullable().optional(),
  property_type: PropertyType.nullable().optional(),

  // Pricing
  price: z.number().nullable().optional(),
  price_currency: Currency.nullable().optional(),
  list_price_original: z.number().nullable().optional(),
  hoa_fee: z.number().nullable().optional(),
  hoa_fee_frequency: z.string().nullable().optional(),
  hoa_amenities: z.preprocess(v => (Array.isArray(v) ? v : []), z.array(z.string())).default([]),
  hoa_name: z.string().nullable().optional(),
  taxes_annual: z.number().nullable().optional(),
  tax_year: z.number().int().nullable().optional(),

  // Dimensions
  bedrooms: z.number().nullable().optional(),
  bathrooms: z.number().nullable().optional(),
  bathrooms_full: z.number().nullable().optional(),
  bathrooms_half: z.number().nullable().optional(),
  interior_sqm: z.number().nullable().optional(),
  lot_sqm: z.number().nullable().optional(),
  year_built: z.number().int().nullable().optional(),
  year_renovated: z.number().int().nullable().optional(),
  stories_total: z.number().nullable().optional(),
  floor_number: z.number().int().nullable().optional(),
  total_floors_in_bldg: z.number().int().nullable().optional(),
  construction_status: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  architectural_style: z.string().nullable().optional(),

  // Parking
  parking_spaces: z.number().int().nullable().optional(),
  garage_spaces: z.number().int().nullable().optional(),
  parking_features: z.preprocess(v => (Array.isArray(v) ? v : []), z.array(z.string())).default([]),

  // Pool / view / waterfront
  pool_features: z.preprocess(v => (Array.isArray(v) ? v : []), z.array(z.string())).default([]),
  view_types: z.preprocess(v => (Array.isArray(v) ? v : []), z.array(z.string())).default([]),
  waterfront_yn: z.boolean().nullable().optional(),
  waterfront_features: z.preprocess(v => (Array.isArray(v) ? v : []), z.array(z.string())).default([]),
  beachfront_yn: z.boolean().nullable().optional(),

  // Location (PRIORITY: read from breadcrumbs and address)
  province: z.string().nullable().optional(),
  canton: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  locality: z.string().nullable().optional(),
  address_line: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  community_name: z.string().nullable().optional(),
  building_name: z.string().nullable().optional(),
  gated_community: z.boolean().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),

  // Amenities / interior
  features: z.preprocess(v => (Array.isArray(v) ? v : []), z.array(z.string())).default([]),
  interior_features: z.preprocess(v => (Array.isArray(v) ? v : []), z.array(z.string())).default([]),
  exterior_features: z.preprocess(v => (Array.isArray(v) ? v : []), z.array(z.string())).default([]),
  appliances: z.preprocess(v => (Array.isArray(v) ? v : []), z.array(z.string())).default([]),
  flooring: z.preprocess(v => (Array.isArray(v) ? v : []), z.array(z.string())).default([]),
  cooling: z.preprocess(v => (Array.isArray(v) ? v : []), z.array(z.string())).default([]),
  heating: z.preprocess(v => (Array.isArray(v) ? v : []), z.array(z.string())).default([]),
  furnishings_included: z.string().nullable().optional(),

  // Costa Rica-specific
  title_status: z.string().nullable().optional(),
  maritime_zone: z.boolean().nullable().optional(),
  foreigner_buyable: z.boolean().nullable().optional(),
  road_access: z.string().nullable().optional(),
  water_source: z.string().nullable().optional(),
  electricity: z.string().nullable().optional(),
  internet_quality: z.string().nullable().optional(),
  zoning: z.string().nullable().optional(),
  rental_income_potential: z.string().nullable().optional(),

  // Lifecycle
  listed_at: z.string().nullable().optional(),
  mls_id: z.string().nullable().optional(),
  mls_status: z.string().nullable().optional(),
  under_contract: z.boolean().nullable().optional(),

  // Agent / brokerage attribution
  listing_agent_name: z.string().nullable().optional(),
  listing_agent_phone: z.string().nullable().optional(),
  listing_agent_email: z.string().nullable().optional(),
  source_brokerage: z.string().nullable().optional(),
  source_brokerage_phone: z.string().nullable().optional(),

  // Media
  virtual_tour_url: z.string().nullable().optional(),
  video_url: z.string().nullable().optional(),
  floorplan_url: z.string().nullable().optional(),
  floorplans: z.preprocess(v => (Array.isArray(v) ? v : []), z.array(z.object({
    url: z.string(),
    label: z.string().nullable().optional(),
    sqm: z.number().nullable().optional(),
    bedrooms: z.number().nullable().optional(),
    bathrooms: z.number().nullable().optional(),
  }))).default([]),

  // Catch-all
  notes: z.string().nullable().optional(),
  extra_data: z.preprocess(v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}), z.record(z.string(), z.unknown())).default({}),

  // Confidence (per-field)
  confidence_per_field: z.preprocess(v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}), z.record(z.string(), z.number())).default({}),
});
export type ExtractedListing = z.infer<typeof ExtractedListing>;

/** Output of normalize stage. */
export const NormalizedListing = ExtractedListing.extend({
  price_usd: z.number().nullable().optional(),
  price_per_sqm: z.number().nullable().optional(),
  region_slug: RegionSlug.nullable().optional(),
  geocode_confidence: z.enum(['exact', 'block', 'neighborhood', 'region']).nullable().optional(),
  hoa_fee_usd: z.number().nullable().optional(),
  taxes_usd_annual: z.number().nullable().optional(),
  list_price_original_usd: z.number().nullable().optional(),
  // Distances (computed in normalize from lat/lng + reference data)
  distance_to_beach_km: z.number().nullable().optional(),
  distance_to_airport_km: z.number().nullable().optional(),
  nearest_airport_code: z.string().nullable().optional(),
  distance_to_hospital_km: z.number().nullable().optional(),
  nearest_hospital_name: z.string().nullable().optional(),
  distance_to_school_km: z.number().nullable().optional(),
  nearest_school_name: z.string().nullable().optional(),
  slug: z.string(),
});
export type NormalizedListing = z.infer<typeof NormalizedListing>;

/** Final fully-enriched listing. */
export const EnrichedListing = NormalizedListing.extend({
  title_en: z.string().nullable().optional(),
  title_es: z.string().nullable().optional(),
  description_en: z.string().nullable().optional(),
  description_es: z.string().nullable().optional(),
  description_raw: z.string().nullable().optional(),
  tags_ai: z.array(z.string()).default([]),
  hero_photo_index: z.number().int().nonnegative().optional(),
  photos_alt: z.record(z.string(), z.string()).optional(),
});
export type EnrichedListing = z.infer<typeof EnrichedListing>;

/** Source adapter interface. */
export interface EnumerateOpts {
  regions?: RegionSlug[];
  maxListings?: number;
  signal?: AbortSignal;
}

export interface SourceAdapter {
  slug: string;
  name: string;
  enumerateListingUrls(opts: EnumerateOpts): AsyncIterable<string>;
  fetchListing(url: string): Promise<RawListingPayload>;
  authenticate?(): Promise<void>;
}

/** Costa Rica feature vocabulary. */
export const FeatureVocab = [
  'pool', 'private_pool', 'communal_pool', 'infinity_pool', 'jacuzzi',
  'ocean_view', 'mountain_view', 'jungle_view', 'city_view', 'valley_view', 'river_view',
  'beachfront', 'oceanfront', 'walk_to_beach', 'beach_access',
  'gated_community', 'titled', 'concession', 'maritime_zone',
  'turnkey', 'fixer', 'new_construction', 'pre_construction', 'under_construction',
  'income_producing', 'rental_potential', 'investment_grade',
  'furnished', 'partially_furnished', 'unfurnished',
  'air_conditioning', 'central_ac', 'split_ac', 'ceiling_fans',
  'solar', 'backup_generator', 'electric_vehicle_charging',
  'hoa', 'private_well', 'city_water', 'spring_water',
  'fiber_internet', 'cable_internet', 'satellite_internet',
  'paved_road', 'gravel_road', '4x4_required',
  'retiree_friendly', 'family_friendly', 'remote_work_ready',
  'horse_friendly', 'agricultural', 'farm', 'cattle',
  'eco', 'sustainable', 'off_grid',
  'walkable', 'walk_to_amenities',
  'guest_house', 'mother_in_law_suite', 'home_office',
  'security_system', 'gated_entrance', '24h_security',
  'covered_parking', 'garage', 'multiple_parking',
  'fenced', 'landscaped',
  'commercial_use_allowed', 'short_term_rental_eligible',
] as const;
export type Feature = typeof FeatureVocab[number];

export const TagVocab = [
  'luxury', 'budget', 'investment', 'lifestyle', 'fixer_upper',
  'turnkey', 'income_property', 'developer_inventory', 'pre_construction',
  'eco', 'sustainable', 'off_grid',
  'beachfront', 'oceanview', 'mountainview', 'jungleview',
  'gated', 'family', 'retiree', 'digital_nomad',
] as const;
export type Tag = typeof TagVocab[number];
