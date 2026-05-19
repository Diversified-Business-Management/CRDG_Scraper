// Re-export selected types from @crdg/core
export type {
  RegionSlug,
  PropertyType,
  ListingStatus,
  Currency,
  Feature,
  Tag,
} from '@crdg/core/types';

export { FeatureVocab, TagVocab } from '@crdg/core/types';

/**
 * Matches the shape of `v_listings_card` view defined in
 * `supabase/migrations/20260427000001_initial_schema.sql`.
 */
export interface ListingCardRow {
  id: string;
  slug: string;
  status: string;
  title_en: string | null;
  title_es: string | null;
  property_type: string | null;
  price_usd: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  interior_sqm: number | null;
  lot_sqm: number | null;
  region_slug: string | null;
  locality: string | null;
  canton: string | null;
  lat: number | null;
  lng: number | null;
  tags_ai: string[] | null;
  tags_human: string[] | null;
  features: string[] | null;
  hero_url: string | null;
  fallback_url: string | null;
  last_seen_at: string | null;
  wp_post_id: number | null;
}

export interface CanonicalListingRow {
  id: string;
  slug: string;
  status: string;
  listing_type: string;
  property_type: string | null;
  title_en: string | null;
  title_es: string | null;
  description_en: string | null;
  description_es: string | null;
  description_raw: string | null;
  price: number | null;
  price_currency: string | null;
  price_usd: number | null;
  price_per_sqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  interior_sqm: number | null;
  lot_sqm: number | null;
  year_built: number | null;
  region_slug: string | null;
  province: string | null;
  canton: string | null;
  district: string | null;
  locality: string | null;
  address_line: string | null;
  lat: number | null;
  lng: number | null;
  geocode_confidence: string | null;
  features: string[] | null;
  tags_ai: string[] | null;
  tags_human: string[] | null;
  hoa_fee_usd: number | null;
  taxes_usd_annual: number | null;
  mls_id: string | null;
  agent_id: string | null;
  listed_at: string | null;
  last_seen_at: string | null;
  confidence: number | null;
  wp_post_id: number | null;
  wp_synced_at: string | null;
  created_at: string;
  updated_at: string;
  // 95-field expansion
  distance_to_beach_km: number | null;
  distance_to_airport_km: number | null;
  nearest_airport_code: string | null;
  distance_to_hospital_km: number | null;
  nearest_hospital_name: string | null;
  distance_to_school_km: number | null;
  nearest_school_name: string | null;
  distance_to_grocery_km: number | null;
  community_name: string | null;
  building_name: string | null;
  gated_community: boolean | null;
  view_types: string[] | null;
  pool_features: string[] | null;
  interior_features: string[] | null;
  exterior_features: string[] | null;
  parking_features: string[] | null;
  appliances: string[] | null;
  flooring: string[] | null;
  cooling: string[] | null;
  heating: string[] | null;
  furnishings_included: string | null;
  title_status: string | null;
  road_access: string | null;
  water_source: string | null;
  electricity: string | null;
  internet_quality: string | null;
  zoning: string | null;
  listing_agent_name: string | null;
  listing_agent_phone: string | null;
  listing_agent_email: string | null;
  source_brokerage: string | null;
  source_brokerage_phone: string | null;
  primary_source_url: string | null;
  virtual_tour_url: string | null;
  video_url: string | null;
  photo_count: number | null;
  notes: string | null;
  bathrooms_full: number | null;
  bathrooms_half: number | null;
  bathrooms_total: number | null;
  realtor_review_status: string | null;
  // Categories
  categories: string[] | null;
  // Utility / amenity yes-no + types
  pool_yn: boolean | null;
  jacuzzi_yn: boolean | null;
  parking_yn: boolean | null;
  telephone_yn: boolean | null;
  internet_types: string[] | null;
  television_types: string[] | null;
  ac_types: string[] | null;
  // Construction & condition
  stories_total: number | null;
  floor_number: number | null;
  total_floors_in_bldg: number | null;
  parking_spaces: number | null;
  garage_spaces: number | null;
  architectural_style: string | null;
  condition: string | null;
  construction_status: string | null;
  // Room-specific feature categories
  bedroom_features: string[] | null;
  dining_room_features: string[] | null;
  family_room_features: string[] | null;
  kitchen_features: string[] | null;
  laundry_features: string[] | null;
  fireplaces_count: number | null;
  fireplace_features: string[] | null;
  property_subtype: string | null;
  foundation: string[] | null;
  roof: string[] | null;
  new_construction_yn: boolean | null;
  total_structure_area_sqm: number | null;
}

export interface PhotoRow {
  id: string;
  canonical_listing_id: string;
  url_source: string;
  url_supabase: string | null;
  position: number | null;
  is_hero: boolean;
  alt_text_en: string | null;
  alt_text_es: string | null;
  width: number | null;
  height: number | null;
}

export interface SourceRow {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  enabled: boolean;
  notes: string | null;
}

export interface SourceConfigRow {
  id: string;
  source_id: string;
  cron_expression: string;
  rate_limit_rps: number;
  burst: number;
  max_listings_per_run: number;
  regions: string[] | null;
  enabled: boolean;
  last_run_at: string | null;
}

export interface RecentRunRow {
  id: string;
  source_id: string;
  source_slug: string;
  source_name: string;
  trigger: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  listings_seen: number | null;
  listings_new: number | null;
  listings_updated: number | null;
  listings_failed: number | null;
  cost_usd: number | null;
  error: string | null;
  duration_seconds: number | null;
}

export interface RunLogRow {
  id: number;
  run_id: string;
  stage: string;
  level: string;
  message: string;
  data: Record<string, unknown> | null;
  created_at: string;
}

export interface AiCostDailyRow {
  day: string;
  cost_usd: number;
  haiku_input_tokens: number;
  haiku_output_tokens: number;
  sonnet_input_tokens: number;
  sonnet_output_tokens: number;
  embedding_tokens: number;
  call_count: number;
}

export interface PipelineFunnelRow {
  source_slug: string;
  source_name: string;
  extracted: number;
  normalized: number;
  deduped: number;
  enriched: number;
  published: number;
  failed: number;
  total: number;
}

export interface DedupLinkRow {
  id: string;
  canonical_listing_id: string;
  raw_listing_id: string;
  confidence: number;
  method: string;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AlertRow {
  id: string;
  severity: string;
  source: string;
  message: string;
  data: Record<string, unknown> | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface AgentRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  enabled: boolean;
}

export type UserRole = 'admin' | 'realtor';

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
}
